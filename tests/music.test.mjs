import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOODS, moodAt } from '../js/music.js';

test('цагаар уур амьсгал', () => {
  assert.equal(moodAt(6), 'morning');
  assert.equal(moodAt(12), 'day');
  assert.equal(moodAt(19), 'evening');
  assert.equal(moodAt(23), 'night');
  assert.equal(moodAt(2), 'night');
  assert.equal(moodAt(5), 'morning');
  assert.equal(moodAt(21), 'night');
});

// ---------- YouTube холбоос ----------
import { parseYouTube, DEFAULT_LISTS } from '../js/youtube.js';

test('YouTube холбоос задлах', () => {
  assert.deepEqual(parseYouTube('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG'), { list: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' });
  assert.deepEqual(parseYouTube('https://youtu.be/ZbZSe6N_BXs?si=abc'), { ids: ['ZbZSe6N_BXs'] });
  assert.deepEqual(parseYouTube('https://www.youtube.com/watch?v=2Vv-BfVoq4g&t=10 https://m.youtube.com/shorts/450p7goxZqg, ZbZSe6N_BXs'),
    { ids: ['2Vv-BfVoq4g', '450p7goxZqg', 'ZbZSe6N_BXs'] });
  assert.equal(parseYouTube('hello'), null);
  assert.equal(parseYouTube(''), null);
  for (const [k, ids] of Object.entries(DEFAULT_LISTS)) {
    assert.ok(ids.length >= 4, k);
    for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{11}$/, `${k} ${id}`);
  }
});
