import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// True when a local Postgres is reachable. A hosted Supabase host is refused.
export async function localPostgres() {
  const host = process.env.PGHOST || '';
  if (/supabase\.(co|com)/.test(host) || /supabase\.(co|com)/.test(process.env.DATABASE_URL || '')) {
    return false;
  }
  if (host) {
    try {
      await exec('psql', ['-c', 'select 1'], { timeout: 8000, env: process.env });
      return true;
    } catch {
      return false;
    }
  }
  try {
    await exec('sudo', ['-u', 'postgres', 'psql', '-c', 'select 1'], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}
