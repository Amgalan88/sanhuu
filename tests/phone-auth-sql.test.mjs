import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { localPostgres } from './local-pg.mjs';

const exec = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Local Postgres only. The handler tests in phone-auth-fn.test.mjs are mocked.
test('phone auth migration and rollback on local Postgres', { skip: await localPostgres() ? false : 'local Postgres is not installed' }, async () => {
  const { stdout, stderr } = await exec('bash', ['scripts/test-phone-auth-sql.sh'], {
    cwd: root,
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
  const out = `${stdout}\n${stderr}`;
  if (!out.includes('phone auth SQL + rollback: ok')) {
    throw new Error(out.slice(-4000));
  }
});
