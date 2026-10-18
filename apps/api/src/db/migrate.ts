import '../config.js';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, '../../../../infra/postgres/migrations');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const names = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of names) {
    const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (existing.rowCount) continue;
    const sql = await readFile(path.join(migrationsDirectory, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
