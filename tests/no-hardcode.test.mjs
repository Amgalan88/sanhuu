// Апп өөрөө нэг өрхийг мэдэх ёсгүй. Өрхийн id, имэйл, нэр өгөгдлийн сангаас ирнэ.
// Түүхэн миграци, тест өгөгдөл энд орохгүй.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['js', 'index.html', 'styles.css', 'sw.js', 'manifest.webmanifest'];
const BANNED = [
  'a0000000-0000-4000-8000-0000000000a1',
  'Энх-Амгалан',
  'Цэцгээ',
  'demo-enkh',
  'demo-tsetsgee',
  'enkh@',
  'tsetsgee@',
  'Манай өрх',
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function filesUnder(path) {
  const abs = join(ROOT, path);
  const stat = statSync(abs);
  if (stat.isFile()) return [abs];
  return readdirSync(abs).flatMap((name) => filesUnder(join(path, name)));
}

test('app source has no hardcoded family id, email, or name', () => {
  const hits = [];
  for (const path of ROOTS) {
    for (const file of filesUnder(path)) {
      const text = readFileSync(file, 'utf8');
      const rel = file.slice(ROOT.length + 1);
      for (const needle of BANNED) {
        if (text.includes(needle)) hits.push(`${rel}: ${needle}`);
      }
      // legal-config.js holds the public contact address of the data controller on purpose.
      const email = rel === join('js', 'legal-config.js') ? null : text.match(EMAIL);
      if (email) hits.push(`${rel}: ${email[0]}`);
    }
  }
  assert.deepEqual(hits, []);
});
