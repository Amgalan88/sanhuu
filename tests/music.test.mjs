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
import { parseYouTube, DEFAULT_LISTS, embedSrc } from '../js/youtube.js';

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

test('YouTube embed хаяг видеотой, хоосон биш', () => {
  const src = embedSrc({ ids: ['ZbZSe6N_BXs', 'btPJPFnesV4'] }, { autoplay: true, origin: 'https://sanhuu-pi.vercel.app' });
  const u = new URL(src);
  assert.equal(u.origin, 'https://www.youtube-nocookie.com');
  assert.equal(u.pathname, '/embed/ZbZSe6N_BXs');
  assert.notEqual(u.pathname, '/embed/');
  assert.equal(u.searchParams.get('playlist'), 'btPJPFnesV4,ZbZSe6N_BXs');
  assert.equal(u.searchParams.get('controls'), '1');
  assert.equal(u.searchParams.get('mute'), '1');
  assert.equal(u.searchParams.get('autoplay'), '1');
  assert.equal(u.searchParams.get('loop'), '1');
  assert.equal(u.searchParams.get('playsinline'), '1');
  assert.equal(u.searchParams.get('origin'), 'https://sanhuu-pi.vercel.app');
  assert.equal(embedSrc({ ids: [] }), '');
  assert.equal(embedSrc(null), '');
  const pl = new URL(embedSrc({ list: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' }));
  assert.equal(pl.pathname, '/embed/videoseries');
  assert.equal(pl.searchParams.get('list'), 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
  const one = new URL(embedSrc({ ids: ['ea2WoUtbzuw'] }));
  assert.equal(one.searchParams.get('playlist'), 'ea2WoUtbzuw');
  assert.equal(one.searchParams.get('loop'), '1');
});
