import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { localPostgres } from './local-pg.mjs';

const exec = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Local database. GitHub Actions runs it against the Postgres service.
// tests/household.test.mjs is the mocked client suite and always runs.
test('household RLS and rollback on local Postgres', { skip: await localPostgres() ? false : 'local Postgres is not installed' }, async () => {
  const { stdout, stderr } = await exec('bash', ['scripts/test-household-rls.sh'], {
    cwd: root,
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
  const out = `${stdout}\n${stderr}`;
  if (!out.includes('household RLS + rollback: ok')) {
    throw new Error(out.slice(-4000));
  }
});
