/**
 * One way to ask the AI for both scripts (generate-tests.mjs, analyze-results.mjs).
 *
 * 1. QA_AGENT_SECRET set  → asks your backend (POST /api/qa/agent), which calls the Foundry agent with its own
 *                           Azure sign-in (Managed Identity), like the credit agent. Real Foundry agents, no Azure
 *                           credentials in GitHub.
 * 2. FOUNDRY_API_KEY set  → calls your model deployment directly with the API key and the instructions file.
 * 3. Otherwise            → calls the Foundry agent by name, signed in with Azure (azure/login or `az login`).
 *
 * Env: FOUNDRY_API_KEY, FOUNDRY_PROJECT_ENDPOINT (https://<resource>.services.ai.azure.com/api/projects/<project>),
 *      FOUNDRY_MODEL_DEPLOYMENT (default gpt-4.1-mini), FOUNDRY_OPENAI_ENDPOINT (optional override).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

export const aiMode = () => (env.QA_AGENT_SECRET ? 'backend' : env.FOUNDRY_API_KEY ? 'api-key' : env.FOUNDRY_PROJECT_ENDPOINT && (!env.CI || env.HAS_AZURE === 'true') ? 'agent' : null);

// https://agenthackathon001.services.ai.azure.com/api/projects/proj-default → https://agenthackathon001.openai.azure.com
function openAiEndpoint() {
  if (env.FOUNDRY_OPENAI_ENDPOINT) return env.FOUNDRY_OPENAI_ENDPOINT.replace(/\/+$/, '');
  if (!env.FOUNDRY_PROJECT_ENDPOINT) throw new Error('Set FOUNDRY_PROJECT_ENDPOINT or FOUNDRY_OPENAI_ENDPOINT');
  const host = new URL(env.FOUNDRY_PROJECT_ENDPOINT).host.split('.')[0];
  return `https://${host}.openai.azure.com`;
}

async function viaApiKey(instructionsFile, input) {
  const deployment = env.FOUNDRY_MODEL_DEPLOYMENT || 'gpt-4.1-mini';
  const url = `${openAiEndpoint()}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-10-21`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': env.FOUNDRY_API_KEY },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: fs.readFileSync(path.join(here, instructionsFile), 'utf8') },
        { role: 'user', content: input },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`model call failed (${res.status}): ${body.error?.message || body.message || 'no details'}`);
  return body.choices?.[0]?.message?.content || '';
}

async function viaBackend(role, input) {
  const base = (env.QA_AGENT_URL || env.BASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('Set QA_AGENT_URL or BASE_URL');
  const res = await fetch(`${base}/api/qa/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-QA-Secret': env.QA_AGENT_SECRET },
    body: JSON.stringify({ agent: role, input }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`backend QA agent call failed (${res.status}): ${body.error?.message || body.message || 'no details'}`);
  console.log(`[AI] answered by Foundry agent ${body.data?.agent} (through the backend)`);
  return body.data?.text || '';
}

async function viaAgent(agentName, input) {
  const [{ DefaultAzureCredential }, { AIProjectClient }] = await Promise.all([import('@azure/identity'), import('@azure/ai-projects')]);
  const project = new AIProjectClient(env.FOUNDRY_PROJECT_ENDPOINT, new DefaultAzureCredential());
  const client = project.getOpenAIClient();
  const ref = { body: { agent_reference: { type: 'agent_reference', name: agentName } } };
  const conversation = await client.conversations.create();
  try {
    const r = await client.responses.create({ conversation: conversation.id, input }, ref);
    return r.output_text || (r.output || []).filter((i) => i.type === 'message').flatMap((m) => m.content || []).map((c) => c.text || '').join('\n');
  } finally {
    await client.conversations.delete(conversation.id).catch(() => {});
  }
}

/** Ask the AI. role = 'test-writer' | 'qa-analyst' (backend mode); instructionsFile (API-key mode); agentName (agent mode). */
export async function askAI({ role, instructionsFile, agentName, input }) {
  const mode = aiMode();
  if (!mode) throw new Error('AI not configured (set QA_AGENT_SECRET, FOUNDRY_API_KEY, or Azure login + FOUNDRY_PROJECT_ENDPOINT)');
  const text = mode === 'backend' ? await viaBackend(role, input)
    : mode === 'api-key' ? await viaApiKey(instructionsFile, input)
    : await viaAgent(agentName, input);
  if (mode === 'api-key') console.log(`[AI] answered by model ${env.FOUNDRY_MODEL_DEPLOYMENT || 'gpt-4.1-mini'} (API key)`);
  if (mode === 'agent') console.log(`[AI] answered by Foundry agent ${agentName}`);
  if (!String(text).trim()) throw new Error('the AI returned an empty answer');
  return String(text).trim();
}
