import { supabaseAdmin } from './supabase.js';

function substituteParams(sql, params) {
  if (!params || params.length === 0) return sql;
  // Replace from highest index to lowest so $10 isn't replaced by $1 match first
  for (let i = params.length - 1; i >= 0; i--) {
    const val = params[i];
    let escaped;
    if (val === null || val === undefined) {
      escaped = 'NULL';
    } else if (typeof val === 'number') {
      escaped = String(val);
    } else if (typeof val === 'boolean') {
      escaped = val ? 'true' : 'false';
    } else if (Array.isArray(val)) {
      escaped = `ARRAY[${val.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(',')}]`;
    } else {
      escaped = `'${String(val).replace(/'/g, "''")}'`;
    }
    sql = sql.replaceAll(`$${i + 1}`, escaped);
  }
  return sql;
}

async function execSql(sql, params) {
  const finalSql = substituteParams(sql, params);
  const { data, error } = await supabaseAdmin.rpc('exec_sql', { query: finalSql });
  if (error) {
    const err = new Error(`(${error.code || error.hint || 'EQUERY'}) ${error.message}`);
    err.code = error.code;
    throw err;
  }
  return { rows: Array.isArray(data) ? data : [] };
}

const fakeClient = {
  query: (sql, params) => execSql(sql, params),
  release: () => {},
};

export const pool = {
  query: (sql, params) => execSql(sql, params),
  connect: async () => fakeClient,
  end: async () => {},
  on: () => {},
};

export async function withTransaction(fn) {
  // Supabase RPC doesn't support real transactions — run sequentially without wrapping
  return fn(fakeClient);
}

export function query(sql, params, clientOrPool = pool) {
  return clientOrPool.query(sql, params);
}
