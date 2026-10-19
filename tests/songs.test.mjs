import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, MOODS, moodAt, parseMelody, parseChord, noteMidi } from '../js/songs.js';

test('нот, аккорд задлах', () => {
  assert.equal(noteMidi('A4'), 69);
  assert.equal(noteMidi('C#5'), 73);
  assert.equal(noteMidi('Bb4'), 70);
  assert.deepEqual(parseChord('C'), { root: 48, tones: [60, 64, 67] });
  assert.deepEqual(parseChord('Am').tones, [57, 60, 64]);
  assert.deepEqual(parseChord('Bbmaj7').tones, [58, 62, 65, 69]); // A–Bb хагас аяныг задална
  assert.deepEqual(parseChord('Cmaj7').tones, [60, 64, 67, 71]);
  assert.equal(parseChord('E').root, 40);
});

test('дуу бүр: хэмжүүрийн цохилт тэнцүү, 8 хэмжүүр, аккорд таарна', () => {
  for (const s of SONGS) {
    const chords = s.chords.split(/\s+/);
    assert.equal(chords.length, 8, s.id);
    chords.forEach(parseChord);
    for (const [k, str] of Object.entries(s.melody)) {
      const bars = parseMelody(str);
      assert.equal(bars.length, 8, `${s.id} ${k}`);
      bars.forEach((bar, i) => assert.equal(bar.reduce((t, [, d]) => t + d, 0), s.beats, `${s.id} ${k} хэмжүүр ${i + 1}`));
    }
    for (const f of s.form) assert.ok(f === null || s.melody[f], `${s.id} form ${f}`);
    assert.ok(MOODS.some((m) => m.key === s.mood), s.id);
  }
  for (const m of MOODS) assert.ok(SONGS.filter((s) => s.mood === m.key).length >= 2, m.key);
});

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
