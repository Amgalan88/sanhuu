import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Хуваалцах текст, PWA тайлбар: орлого 3 данс (өрх 60 / зорилт 20 / эрсдэл 20).
test('хуваалцах текст 3 данс', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8');
  for (const src of [html, manifest]) {
    assert.equal(src.includes('5 данс'), false);
    assert.equal(src.includes('3 данс'), true);
  }
  assert.match(html, /name="description"[^>]*орлогыг 3 дансанд/);
  assert.match(html, /property="og:description"[^>]*орлогоо 3 дансанд/);
  assert.match(html, /name="twitter:description"[^>]*орлогоо 3 дансанд/);
});
