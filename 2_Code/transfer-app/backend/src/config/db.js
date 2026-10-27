import { setDefaultResultOrder } from 'dns';
import pg from 'pg';
import { env } from './env.js';

// Force IPv4 on Windows — avoids ETIMEDOUT on IPv6-first DNS resolution for Supabase
setDefaultResultOrder('ipv4first');

const { Pool } = pg;

const sslConfig = env.DATABASE_SSL === 'true' || env.DATABASE_SSL === true
  ? { rejectUnauthorized: false }
  : false;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: sslConfig,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

pool.on('connect', () => {
  if (env.NODE_ENV === 'development') {
    console.log('[DB] New client connected to PostgreSQL');
  }
});

/**
 * Execute a parameterized query against the database pool.
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (env.NODE_ENV === 'development' && env.LOG_REQUESTS === 'true') {
      console.log('[DB] Query executed', { text: text.slice(0, 80), duration, rows: result.rowCount });
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error', { text: text.slice(0, 80), error: err.message });
    throw err;
  }
}

/**
 * Get a client from the pool for transactions.
 * Remember to call client.release() in a finally block.
 */
export async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const release = client.release.bind(client);

  const timeout = setTimeout(() => {
    console.error('[DB] Client checkout has been outstanding for too long — releasing forcibly');
    client.release();
  }, 5000);

  client.release = () => {
    clearTimeout(timeout);
    release();
  };

  client.query = (text, params) => {
    if (env.NODE_ENV === 'development') {
      console.log('[DB] Transaction query', { text: text.slice(0, 80) });
    }
    return originalQuery(text, params);
  };

  return client;
}

export default { pool, query, getClient };
