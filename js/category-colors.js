// Зарлагын ангиллын өнгө: хүйтнээс дулаан руу (хөх → улаан), түлхүүрээр тогтвортой.
// Бэх (ink) нь текст ба багана, угаалга (wash) нь товчны дэвсгэр.
// Хос бүр WCAG AA: энгийн текст 4.5:1, график 3:1 — гэрэл, харанхуй, нүдэнд ээлтэй.

export const CATEGORY_KEYS = ['food', 'housing', 'transport', 'health', 'kids', 'comm', 'other'];

/** Текст суух боломжтой дэвсгэр (хуудас, карт, улирлын тэнгэр) ба баганын зам. */
export const THEME_SURFACES = {
  light: {
    text: '#0e1a36',
    track: '#e4eaf5',
    backgrounds: ['#edf2fb', '#ffffff', '#f2f6fd', '#d6e3f5', '#f2f6fc', '#c9d3e2', '#eef2f8', '#ffe8b8', '#f4f7fd', '#fde1c4', '#f6f2ec'],
  },
  dark: {
    text: '#e8eefc',
    track: '#1b2d58',
    backgrounds: ['#060d22', '#0d1937', '#13234a', '#1b2d58', '#0d2147', '#1a2540', '#070d1f', '#2a1d0c', '#2a160c'],
  },
  comfort: {
    text: '#3a2e1f',
    track: '#e5d8bb',
    backgrounds: ['#eee4cf', '#f9f2e2', '#f1e7d0', '#e5d8bb', '#e8e2d6', '#d9cfbd', '#f6deae', '#efcfa4'],
  },
};

export const CATEGORY_PALETTE = {
  light: {
    food:      { ink: '#285e8a', wash: '#d6e1ed' },
    housing:   { ink: '#216273', wash: '#d5e1ea' },
    transport: { ink: '#1a6657', wash: '#d4e2e6' },
    health:    { ink: '#1e6740', wash: '#d4e2e3' },
    kids:      { ink: '#72561d', wash: '#e0e0de' },
    comm:      { ink: '#8b4923', wash: '#e4dede' },
    other:     { ink: '#9e392e', wash: '#e6dce0' },
  },
  dark: {
    food:      { ink: '#8ec7f6', wash: '#1f335b' },
    housing:   { ink: '#80ddef', wash: '#1e365b' },
    transport: { ink: '#83e2cf', wash: '#1e3657' },
    health:    { ink: '#88ddad', wash: '#1f3654' },
    kids:      { ink: '#f7ce6e', wash: '#2a344e' },
    comm:      { ink: '#f6a16f', wash: '#2a304e' },
    other:     { ink: '#f39186', wash: '#292e50' },
  },
  comfort: {
    food:      { ink: '#1e5c8f', wash: '#d3d4c7' },
    housing:   { ink: '#1d6172', wash: '#d3d4c3' },
    transport: { ink: '#1d6355', wash: '#d3d5bf' },
    health:    { ink: '#1a663d', wash: '#d3d5bb' },
    kids:      { ink: '#6f5420', wash: '#dfd2b7' },
    comm:      { ink: '#864a27', wash: '#e2d1b8' },
    other:     { ink: '#9f3428', wash: '#e6ceb8' },
  },
};

const hexToRgb = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const channel = (c) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2 харьцангуй гэрэлтэлт. */
export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2 contrast ratio, 1 (ижил) … 21 (хар/цагаан). */
export function contrastRatio(a, b) {
  const L1 = relativeLuminance(a);
  const L2 = relativeLuminance(b);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Ангиллын өнгө. Үл таних түлхүүр → «Бусад», үл таних сэдэв → гэрэл. */
export function categoryColor(key, theme = 'light') {
  const pal = CATEGORY_PALETTE[theme] || CATEGORY_PALETTE.light;
  return pal[key] || pal.other;
}

/** style="" дээр тавих CSS хувьсагч. */
export function categoryStyle(key, theme = 'light') {
  const { ink, wash } = categoryColor(key, theme);
  return `--cat:${ink};--cat-fg:${ink};--cat-bg:${wash}`;
}
