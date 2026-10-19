// Арын хөгжмийн дуунууд (цэвэр өгөгдөл — тест хийхэд хялбар).
// Цаг хугацаагаар: 🌅 өглөө · ☀️ өдөр (урам зориг) · 🌆 үдэш (романтик) · 🌙 шөнө (бүүвэй).
//
// Мелоди: 'A4/1.5 C5/.5 E5 -/2 | …' — нот/цохилт ('-' = амсхийх, цохилт байхгүй бол 1), '|' нь хэмжүүр тусгаарлана.
// Аккорд: 'F', 'Am', 'Bbmaj7', 'Em7', 'C7', 'Dsus4' гэх мэт; хэмжүүр бүрт нэг.

export const MOODS = [
  { key: 'morning', emoji: '🌅', name: 'Өглөө', from: 5, to: 11 },
  { key: 'day', emoji: '☀️', name: 'Өдөр · урам зориг', from: 11, to: 17 },
  { key: 'evening', emoji: '🌆', name: 'Үдэш · романтик', from: 17, to: 21 },
  { key: 'night', emoji: '🌙', name: 'Шөнө · бүүвэй', from: 21, to: 5 },
];

/** Тухайн цагийн уур амьсгал: 5–11 өглөө, 11–17 өдөр, 17–21 үдэш, 21–5 шөнө */
export function moodAt(hour) {
  return MOODS.find((m) => (m.from < m.to ? hour >= m.from && hour < m.to : hour >= m.from || hour < m.to)).key;
}

export const SONGS = [
  // ---------- 🌙 Шөнө ----------
  {
    id: 'moon-lullaby', mood: 'night', title: 'Сарны бүүвэй', emoji: '🌙',
    bpm: 64, beats: 3, lead: 'bell', comp: ['waltz', 'pad'], compVoice: 'piano', bass: 'waltz', drums: null, gain: 1.1,
    chords: 'F Am Bb F Gm C F C',
    melody: {
      A: 'A4/2 C5 | E5/2 C5 | D5/1.5 C5/.5 Bb4 | A4/3 | Bb4/2 D5 | C5/1.5 Bb4/.5 G4 | A4 C5 F5 | E5/2 -',
      B: 'C5 F5/1.5 E5/.5 | E5/2 A4 | D5/2 F5 | C5/3 | D5 Bb4 G4 | E5/1.5 D5/.5 C5 | A4/2 G4 | G4/2 -',
    },
    form: ['A', 'B', null, 'A', 'B'],
  },
  {
    id: 'bell-lullaby', mood: 'night', title: 'Хонхон бүүвэй', emoji: '🔔',
    bpm: 62, beats: 4, lead: 'bell', comp: ['pad', 'arp'], compVoice: 'bell', bass: 'root', drums: null, gain: 0.85,
    chords: 'C G Am Em F C F G',
    melody: {
      A: 'E5/1.5 D5/.5 C5 G4 | D5/1.5 E5/.5 D5 G4 | C5/1.5 D5/.5 E5 A4 | G4/2 E4 G4 | A4/1.5 C5/.5 D5 C5 | E5/1.5 G5/.5 E5 C5 | A4/1.5 C5/.5 D5 E5 | D5/3 -',
      B: 'G5/2 E5 D5 | D5/2 - G4 | C5 E5 A5/2 | G5/2 -/2 | A5/1.5 G5/.5 E5 C5 | E5/2 D5 C5 | A4 C5 D5 G5 | C5/3 -',
    },
    form: ['A', 'B', null, 'A'],
  },

  // ---------- 🌅 Өглөө ----------
  {
    id: 'morning-sun', mood: 'morning', title: 'Өглөөний нар', emoji: '🌅',
    bpm: 92, beats: 4, lead: 'flute', comp: ['arp', 'pad'], compVoice: 'pluck', bass: 'root', drums: 'shaker', gain: 0.85,
    chords: 'D A Bm G D A G A',
    melody: {
      A: 'A4/.5 D5/.5 F#5 E5/.5 D5/.5 E5 | C#5 E5/1.5 A4/.5 - | B4/.5 D5/.5 F#5 A5 F#5 | G5/1.5 F#5/.5 E5 D5 | F#5 E5/.5 D5/.5 A4/2 | C#5/.5 D5/.5 E5 A5/2 | B5 A5/.5 G5/.5 F#5 E5 | E5/3 -',
      B: 'D5 F#5 A5/2 | C#6 B5/.5 A5/.5 E5/2 | F#5/1.5 E5/.5 D5 B4 | D5/2 B4 G4 | A4 D5 F#5 A5 | G5 F#5 E5 C#5 | D5/1.5 E5/.5 F#5 G5 | A5/2 -/2',
    },
    form: ['A', 'B', 'A', null, 'B'],
  },
  {
    id: 'new-day', mood: 'morning', title: 'Шинэ өдөр', emoji: '☕',
    bpm: 100, beats: 4, lead: 'piano', comp: ['strum', 'pad'], compVoice: 'pluck', bass: 'quarter', drums: 'light', gain: 1,
    chords: 'G D Em C G D C D',
    melody: {
      A: 'B4 D5 G5/1.5 F#5/.5 | A5/2 F#5 D5 | E5 G5 B5/1.5 A5/.5 | G5/2 E5/2 | D5 B4/.5 D5/.5 G5 B5 | A5/1.5 G5/.5 F#5 A5 | G5 E5 C5 E5 | D5/3 -',
      B: 'G5/.5 A5/.5 B5 B5 A5 | A5/.5 B5/.5 A5 F#5/2 | G5/.5 A5/.5 G5 E5/2 | E5 G5 C6/2 | B5 A5 G5 D5 | F#5 A5 D6/2 | C6 B5/.5 A5/.5 G5 E5 | F#5/2 -/2',
    },
    form: ['A', 'B', null, 'A', 'B'],
  },

  // ---------- ☀️ Өдөр · урам зориг ----------
  {
    id: 'forward', mood: 'day', title: 'Урагшаа!', emoji: '🚀',
    bpm: 116, beats: 4, lead: 'lead', comp: ['stabs', 'pad'], compVoice: 'epiano', bass: 'pulse', drums: 'beat', gain: 1.1,
    chords: 'Am F C G Am F G G',
    melody: {
      A: 'A4/.5 C5/.5 E5 E5/.5 D5/.5 C5 | C5/.5 A4/.5 F4 A4 C5 | G4/.5 C5/.5 E5 G5 E5 | D5/1.5 B4/.5 G4/2 | A4/.5 C5/.5 E5 A5 G5/.5 E5/.5 | F5 E5/.5 C5/.5 A4/2 | B4 D5 G5 D5 | B4/2 -/2',
      B: 'E5/.5 E5/.5 E5/.5 D5/.5 C5 A4 | C5/.5 C5/.5 C5/.5 D5/.5 C5 A4 | E5/.5 E5/.5 G5 E5 C5 | D5/2 - G4 | E5/.5 E5/.5 E5/.5 D5/.5 C5 A4 | A5 G5 F5 E5 | D5 E5 G5 B5 | A5/2 -/2',
    },
    form: [null, 'A', 'B', 'A', 'B'],
  },
  {
    id: 'together', mood: 'day', title: 'Хамтдаа чадна', emoji: '💪',
    bpm: 108, beats: 4, lead: 'marimba', comp: ['stabs', 'arp'], compVoice: 'epiano', bass: 'pulse', drums: 'beat', gain: 1.1,
    chords: 'C G Am F C G F G',
    melody: {
      A: 'E5 G5 C6 G5 | D5 G5 B5 G5 | C5 E5 A5/1.5 G5/.5 | F5 A5 C6/2 | G5/.5 E5/.5 G5 E5 C5 | B4/.5 D5/.5 G5 F5 D5 | C5 F5 A5 G5 | G5/3 -',
      B: 'C6/1.5 B5/.5 A5 G5 | B5/1.5 A5/.5 G5 D5 | A5/1.5 G5/.5 E5 C5 | F5 E5 F5 A5 | G5/2 E5 G5 | D6/2 B5 G5 | A5 C6 A5 F5 | G5/2 -/2',
    },
    form: ['A', 'B', 'A', null, 'B'],
  },

  // ---------- 🌆 Үдэш · романтик ----------
  {
    id: 'evening-love', mood: 'evening', title: 'Үдшийн хайр', emoji: '🌆',
    bpm: 74, beats: 4, swing: 0.16, lead: 'flute', comp: ['rhodes', 'pad'], compVoice: 'epiano', bass: 'walk', drums: 'brush', gain: 1,
    chords: 'Fmaj7 Em7 Dm7 Cmaj7 Bbmaj7 Am7 Gm7 C7',
    melody: {
      A: 'A4 C5 E5/2 | D5 B4 G4/2 | F4 A4 C5/1.5 D5/.5 | B4/3 - | D5 F5 A5/2 | G5/1.5 E5/.5 C5/2 | F5 D5 Bb4 A4 | E5/2 G4 -',
      B: 'C5/.5 E5/.5 A5/2 G5 | G5/1.5 E5/.5 D5/2 | F5 E5/.5 D5/.5 C5 A4 | E5/2 G5/2 | F5/1.5 D5/.5 Bb4 A4 | C5 E5 G5 E5 | D5 F5 Bb5/1.5 A5/.5 | G5/2 E5 -',
    },
    form: [null, 'A', 'B', 'A'],
  },
  {
    id: 'two-of-us', mood: 'evening', title: 'Хоёулаа', emoji: '💑',
    bpm: 80, beats: 3, lead: 'piano', comp: ['waltz', 'strings'], compVoice: 'piano', bass: 'waltz', drums: null, gain: 1.2,
    chords: 'G Em C D G Bm C D',
    melody: {
      A: 'D5/2 B4 | G5/2 E5 | E5/1.5 D5/.5 C5 | A4/3 | B4 D5 G5 | F#5/2 D5 | E5 G5 E5 | D5/3',
      B: 'G5/2 A5 | B5/2 G5 | C6/1.5 B5/.5 A5 | F#5/3 | G5 B5 D6 | D6/1.5 B5/.5 F#5 | E5 G5 C6 | A5/2 F#5',
    },
    form: ['A', 'B', 'A', 'B'],
  },
];

// ---------- Задлагч ----------
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C#5' → 73 */
export function noteMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Нот буруу: ${name}`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** Мелодийг хэмжүүрээр: [[[midi|null, цохилт], …], …] */
export function parseMelody(str) {
  return str.split('|').map((bar) => bar.trim().split(/\s+/).filter(Boolean).map((tok) => {
    const [n, d] = tok.split('/');
    return [n === '-' ? null : noteMidi(n), d ? Number(d) : 1];
  }));
}

const QUALITY = {
  '': [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10],
  sus4: [0, 5, 7], add9: [0, 4, 7, 14],
};

/** 'Bbmaj7' → { root: басс midi, tones: [A3–G#4 хооронд ойр байрлуулсан] } */
export function parseChord(name) {
  const m = /^([A-G])([#b]?)(maj7|m7|sus4|add9|m|7)?$/.exec(name);
  if (!m) throw new Error(`Аккорд буруу: ${name}`);
  const pc = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const tones = QUALITY[m[3] || ''].map((iv) => 57 + ((((pc + iv) % 12) - 9 + 12) % 12)).sort((a, b) => a - b);
  // Хагас аяны зайтай (A–Bb гэх мэт) доод нотыг октав дээш — бүдэг сонсогдохгүй
  for (let i = 0; i + 1 < tones.length; i++) if (tones[i + 1] - tones[i] === 1) tones[i] += 12;
  tones.sort((a, b) => a - b);
  let root = 36 + pc;
  if (root < 40) root += 12; // E2–D#3
  return { root, tones };
}
