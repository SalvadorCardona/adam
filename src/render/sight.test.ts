import { describe, expect, it } from 'vitest';
import { inSight } from './sight.ts';

const sight = { minCx: 0, minCy: 0, maxCx: 9, maxCy: 9 };

describe('inSight', () => {
  it('garde un bâtiment dans la zone vue', () => {
    expect(inSight({ tx: 4, ty: 4, width: 2, height: 2 }, sight)).toBe(true);
  });

  it('garde un bâtiment dont seule une case dépasse', () => {
    expect(inSight({ tx: -1, ty: 3, width: 2, height: 2 }, sight)).toBe(true);
    expect(inSight({ tx: 9, ty: 9, width: 2, height: 2 }, sight)).toBe(true);
  });

  it('écarte un bâtiment hors de la zone vue', () => {
    expect(inSight({ tx: -3, ty: 3, width: 2, height: 2 }, sight)).toBe(false);
    expect(inSight({ tx: 10, ty: 3, width: 2, height: 2 }, sight)).toBe(false);
    expect(inSight({ tx: 3, ty: 10, width: 2, height: 2 }, sight)).toBe(false);
  });
});
