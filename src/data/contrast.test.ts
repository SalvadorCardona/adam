import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AA_RATIO, GOOD_TEXT, GOOD_TEXT_SHARE, TEXT_PAIRS, contrastRatio, mixColors } from './contrast.ts';

describe('contraste', () => {
  it('calcule les ratios de référence de WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // Symétrique : le texte clair sur fond foncé vaut le contraire.
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#777777'), 10);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it.each(TEXT_PAIRS.map((pair) => [pair.name, pair] as const))('%s tient AA (4,5:1)', (_name, pair) => {
    expect(contrastRatio(pair.text, pair.background)).toBeGreaterThanOrEqual(AA_RATIO);
  });

  it('la menthe seule ne tient pas sur blanc : d’où le vert de texte', () => {
    expect(contrastRatio('#15a866', '#ffffff')).toBeLessThan(AA_RATIO);
    expect(contrastRatio(GOOD_TEXT, '#ffffff')).toBeGreaterThanOrEqual(AA_RATIO);
  });

  it('style.css emploie le même mélange pour --good-text', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const percent = Math.round(GOOD_TEXT_SHARE * 100);

    expect(css).toContain(`--good-text: color-mix(in srgb, var(--mint-shade) ${percent}%, var(--ink-shade))`);
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
