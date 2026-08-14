import pg from "pg";
import { config } from "./index.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: config.isProd ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error", err);
});

/**
 * Execute a query with parameters (safe against SQL injection)
 */
export async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.logLevel === "debug") {
      console.debug(`[db] ${duration}ms`, text.slice(0, 80));
    }
    return result;
  } catch (err) {
    console.error("[db] Query error", { text: text.slice(0, 120), err: err.message });
    throw err;
  }
}

/**
 * Run a function inside a transaction
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function healthCheck() {
  const res = await query("SELECT 1 AS ok");
  return res.rows[0]?.ok === 1;
}
