import { describe, expect, it } from 'vitest';
import { auditSvg } from '../data/artDirection.ts';
import { DPAD_GLYPH, FACE_GLYPHS, STICK_GLYPH } from './padGlyphs.ts';

const GLYPHS = [
  ...Object.entries(FACE_GLYPHS).flatMap(([kind, faces]) => Object.entries(faces).map(([button, svg]) => [`${kind}.${button}`, svg] as const)),
  ['dpad', DPAD_GLYPH] as const,
  ['stick', STICK_GLYPH] as const,
];

describe('boutons de la manette', () => {
  it.each(GLYPHS)('%s respecte la direction artistique', (_, svg) => {
    expect(auditSvg(svg)).toEqual([]);
    expect(svg).toContain('width="24" height="24"');
  });

  it('dessine huit boutons de face distincts', () => {
    const faces = Object.values(FACE_GLYPHS).flatMap((faces) => Object.values(faces));

    expect(new Set(faces).size).toBe(8);
  });
});
