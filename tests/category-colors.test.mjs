import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_KEYS, CATEGORY_PALETTE, THEME_SURFACES, categoryColor, contrastRatio, relativeLuminance,
} from '../js/category-colors.js';

// Тест өөрөө харьцааг бодно — палитрын функцтэй нэг алдаа хуваалцахгүй.
function channel(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}
function contrast(a, b) {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}
function hue(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

test('contrastRatio: хар/цагаан 21, ижил өнгө 1', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 1e-6);
  assert.ok(Math.abs(contrastRatio('#ffffff', '#000000') - 21) < 1e-6);
  assert.equal(contrastRatio('#285e8a', '#285e8a'), 1);
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - contrast('#000000', '#ffffff')) < 1e-9);
  assert.ok(Math.abs(relativeLuminance('#ffffff') - 1) < 1e-6);
  assert.ok(relativeLuminance('#000000') < 1e-6);
});

test('ангилал бүр хүйтнээс дулаан руу, түлхүүрээр тогтвортой', () => {
  for (const theme of Object.keys(CATEGORY_PALETTE)) {
    const hues = CATEGORY_KEYS.map((key) => hue(categoryColor(key, theme).ink));
    for (let i = 1; i < hues.length; i++) {
      assert.ok(hues[i] < hues[i - 1], `${theme} ${CATEGORY_KEYS[i]} hue ${hues[i]} < ${hues[i - 1]}`);
    }
    assert.deepEqual(categoryColor('food', theme), categoryColor('food', theme));
    assert.equal(categoryColor('nope', theme).ink, categoryColor('other', theme).ink);
  }
  assert.equal(categoryColor('food', 'no-such-theme').ink, CATEGORY_PALETTE.light.food.ink);
});

test('палитр WCAG AA: текст 4.5:1, багана 3:1, угаалга дээрх текст 4.5:1', () => {
  for (const [theme, surface] of Object.entries(THEME_SURFACES)) {
    for (const key of CATEGORY_KEYS) {
      const { ink, wash } = CATEGORY_PALETTE[theme][key];
      for (const bg of surface.backgrounds) {
        const ratio = contrast(ink, bg);
        assert.ok(ratio >= 4.5, `${theme} ${key} ink ${ink} on ${bg} = ${ratio.toFixed(2)} < 4.5`);
      }
      const bar = contrast(ink, surface.track);
      assert.ok(bar >= 3, `${theme} ${key} bar ${ink} on track ${surface.track} = ${bar.toFixed(2)} < 3`);
      const chip = contrast(surface.text, wash);
      assert.ok(chip >= 4.5, `${theme} ${key} text ${surface.text} on wash ${wash} = ${chip.toFixed(2)} < 4.5`);
    }
  }
});
