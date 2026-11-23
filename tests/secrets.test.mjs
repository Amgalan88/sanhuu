import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The browser bundle. Edge functions read secrets from the platform env, not from these files.
const ROOTS = ['js', 'index.html', 'sw.js', 'manifest.webmanifest', 'styles.css', 'vercel.json'];

const FORBIDDEN = [
  /sb_secret_/i,
  /SUPABASE_SERVICE_ROLE/,
  /service_role/,
  /eyJhbGciOi/,
  /BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/,
  /vrf_[A-Za-z0-9]/,
  /VERIFY_MN_API_KEY\s*=\s*['"][^'"]+['"]/,
];

function filesUnder(path) {
  const full = join(root, path);
  const stat = statSync(full);
  if (stat.isFile()) return [full];
  const out = [];
  for (const name of readdirSync(full)) {
    const child = join(full, name);
    if (statSync(child).isDirectory()) out.push(...filesUnder(join(path, name)));
    else out.push(child);
  }
  return out;
}

test('client files do not contain a service role key or other secret', () => {
  const hits = [];
  for (const path of ROOTS) {
    for (const file of filesUnder(path)) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(text)) hits.push(`${file.slice(root.length + 1)} matches ${pattern}`);
      }
    }
  }
  assert.deepEqual(hits, []);
  const config = readFileSync(join(root, 'js/config.js'), 'utf8');
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /sb_secret_/);
});
