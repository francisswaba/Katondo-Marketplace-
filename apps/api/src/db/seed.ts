import '../config.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(currentDirectory, '../../../../infra/postgres/seed.sql');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(await readFile(seedPath, 'utf8'));
  console.log('Development catalogue seed applied.');
} finally {
  await pool.end();
}
