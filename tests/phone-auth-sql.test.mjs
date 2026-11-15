import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const exec = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function localPostgres() {
  try {
    await exec('sudo', ['-u', 'postgres', 'psql', '-c', 'select 1'], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

// Local Postgres only. GitHub Actions skips this. The handler tests are mocked.
test('[mocked] phone auth migration and rollback on local Postgres', { skip: await localPostgres() ? false : 'local Postgres is not installed' }, async () => {
  const { stdout, stderr } = await exec('bash', ['scripts/test-phone-auth-sql.sh'], {
    cwd: root,
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const out = `${stdout}\n${stderr}`;
  if (!out.includes('phone auth SQL + rollback: ok')) {
    throw new Error(out.slice(-4000));
  }
});
