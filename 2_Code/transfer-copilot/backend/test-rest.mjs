import { config } from 'dotenv';
config({ path: '.env' });
const url = process.env.SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('Service key type:', svc ? svc.slice(0,15) + '...' : 'MISSING');

// Test REST with service key
const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: svc, Authorization: `Bearer ${svc}` } });
const body = await r.json().catch(() => r.text());
console.log('REST /rest/v1/ status:', r.status, typeof body === 'object' ? JSON.stringify(body).slice(0,100) : body.slice(0,100));

// Test migration: can we create a simple table?
const r2 = await fetch(`${url}/rest/v1/rpc/exec`, { method: 'POST',
  headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql: 'SELECT 1 as test' })
});
console.log('RPC exec status:', r2.status, (await r2.text()).slice(0,100));
