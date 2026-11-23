import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('vercel.json sends the closed-beta security headers', () => {
  const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const headers = Object.fromEntries(config.headers[0].headers.map((header) => [header.key, header.value]));
  const csp = headers['Content-Security-Policy'];
  assert.equal(config.headers[0].source, '/(.*)');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /https:\/\/evtawdwjlwniwjjimkfh\.supabase\.co/);
  assert.match(csp, /wss:\/\/evtawdwjlwniwjjimkfh\.supabase\.co/);
  assert.match(csp, /https:\/\/fonts\.googleapis\.com/);
  assert.match(csp, /https:\/\/fonts\.gstatic\.com/);
  assert.match(csp, /https:\/\/cdn\.jsdelivr\.net/);
  assert.match(csp, /https:\/\/cdnjs\.cloudflare\.com/);
  assert.match(csp, /https:\/\/www\.youtube\.com/);
  assert.match(csp, /https:\/\/www\.youtube-nocookie\.com/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(headers['Strict-Transport-Security'], /max-age=\d+/);
  assert.match(headers['Permissions-Policy'], /camera=\(\)/);
  assert.match(headers['Permissions-Policy'], /microphone=\(\)/);
  assert.match(headers['Permissions-Policy'], /geolocation=\(\)/);
});
