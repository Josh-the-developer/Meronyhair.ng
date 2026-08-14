/**
 * Simple SQL migrator – runs .sql files in backend/migrations in order.
 * Usage: node src/utils/migrate.js
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, query } from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../migrations");

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function main() {
  await ensureTable();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const applied = await query(
      `SELECT 1 FROM schema_migrations WHERE filename = $1`,
      [file]
    );
    if (applied.rows.length) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`apply ${file}`);
    const client = await pool.connect();
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1)`,
        [file]
      );
    } catch (err) {
      console.error(`Failed on ${file}:`, err.message);
      process.exitCode = 1;
      client.release();
      await pool.end();
      return;
    }
    client.release();
  }
  console.log("Migrations complete");
  await pool.end();
}

main();
