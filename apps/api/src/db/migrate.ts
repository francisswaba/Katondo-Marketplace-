import '../config.js';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, '../../../../infra/postgres/migrations');
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run database migrations.');
}

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 10_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
});

try {
  console.log('Connecting to the database for migrations.');
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const names = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
  console.log(`Found ${names.length} database migration(s).`);
  for (const name of names) {
    const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (existing.rowCount) {
      console.log(`Already applied ${name}`);
      continue;
    }
    const sql = await readFile(path.join(migrationsDirectory, name), 'utf8');
    console.log(`Applying ${name}`);
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
  console.log('Database migrations completed successfully.');
} catch (error) {
  console.error('Database migration failed.', error);
  process.exitCode = 1;
} finally {
  await pool.end().catch((error: unknown) => {
    console.error('Failed to close the migration database connection.', error);
    process.exitCode = 1;
  });
}
