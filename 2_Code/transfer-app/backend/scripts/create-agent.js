/**
 * Creates the Foundry agent (or a new version of it) from AGENT_INSTRUCTIONS and AGENT_TOOLS in
 * src/services/ai/agent.service.js. Re-run after changing either; every run creates a new version.
 * With --check, also sends the agent one sample course and prints its recommendation.
 * Needs FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_MODEL_DEPLOYMENT, and `az login` (or another Azure credential).
 * Usage: node scripts/create-agent.js [--check]
 */
import 'dotenv/config';
import { env } from '../src/config/env.js';
import { query, pool } from '../src/config/db.js';
import { AGENT_INSTRUCTIONS, AGENT_TOOLS, getProjectClient, runAgent } from '../src/services/ai/agent.service.js';

async function main() {
  if (!env.FOUNDRY_PROJECT_ENDPOINT || !env.FOUNDRY_MODEL_DEPLOYMENT) {
    throw new Error('Set FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_MODEL_DEPLOYMENT in .env first.');
  }
  const project = getProjectClient();
  const agent = await project.agents.createVersion(env.FOUNDRY_AGENT_NAME, {
    kind: 'prompt',
    model: env.FOUNDRY_MODEL_DEPLOYMENT,
    instructions: AGENT_INSTRUCTIONS,
    tools: AGENT_TOOLS,
  });
  console.log(`[Agent] ${agent.name}, version ${agent.version}, model ${env.FOUNDRY_MODEL_DEPLOYMENT}`);

  if (process.argv.includes('--check')) {
    // Riverside CSC 220 has no equivalency or past decision, so the agent has to reason from content
    const { rows: [c] } = await query(
      `SELECT institution, course_code, title, credits, credit_system, level, description, syllabus FROM catalog_courses
       WHERE institution = 'Riverside Community College' AND course_code = 'CSC 220'`
    );
    const started = Date.now();
    const recommendations = await runAgent({
      case_id: 'setup-check',
      target_program: 'Computer Science',
      courses: [{
        course_ref: 'check-1', institution: c.institution, course_code: c.course_code, title: c.title,
        credits: Number(c.credits), credit_system: c.credit_system, bu_credits: Number(c.credits), level: c.level,
        description: c.description, syllabus: c.syllabus, engine_suggestion: 'CAS CS 112', engine_reasons: [],
      }],
    });
    console.log(`[Agent] Check finished in ${((Date.now() - started) / 1000).toFixed(1)}s:`);
    console.log(JSON.stringify(recommendations, null, 2));
  }
}

main()
  .catch((err) => { console.error('[Agent] Failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
