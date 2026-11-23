import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { localPostgres } from './local-pg.mjs';

const exec = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Local database. GitHub Actions runs it when PGHOST points at the Postgres service.
// Without Postgres the test is skipped. It never uses a hosted Supabase project.
test('two households are isolated on local Postgres', { skip: await localPostgres() ? false : 'local Postgres is not installed' }, async () => {
  const { stdout, stderr } = await exec('bash', ['scripts/test-rls-isolation.sh'], {
    cwd: root,
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
  const out = `${stdout}\n${stderr}`;
  if (!out.includes('household isolation: ok')) {
    throw new Error(out.slice(-4000));
  }
});
