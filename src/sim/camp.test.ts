import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { CAMP, campSpot, campfireTile } from './camp.ts';
import { World } from './world.ts';

const HALL = { tx: 10, ty: 10, width: 3, height: 3 };

describe('campement du départ', () => {
  it('pose le feu devant la façade du chantier', () => {
    expect(campfireTile(HALL)).toEqual({ tx: 11, ty: 10 + 3 + CAMP.fireAhead });
  });

  it('place les dix colons sans jamais les aligner en grille', () => {
    for (const seed of [1, 7, 100, 4242]) {
      const spots = Array.from({ length: 10 }, (_, i) => campSpot(seed, HALL, i));

      // Une grille 5 × 2 n'a que 5 abscisses et 2 ordonnées ; ici presque chacun a les siennes.
      expect(new Set(spots.map(({ x }) => Math.round(x))).size).toBeGreaterThanOrEqual(8);
      expect(new Set(spots.map(({ y }) => Math.round(y))).size).toBeGreaterThanOrEqual(8);
      // Aucun ne se tient sur le feu.
      const fire = campfireTile(HALL);

      for (const { x, y } of spots) {
        expect(Math.hypot(x - (fire.tx + 0.5) * TILE_SIZE, y - (fire.ty + 0.5) * TILE_SIZE)).toBeGreaterThan(TILE_SIZE * 0.5);
      }
    }
  });

  it('est déterministe pour une seed', () => {
    expect(campSpot(5, HALL, 3)).toEqual(campSpot(5, HALL, 3));
    expect(campSpot(5, HALL, 3)).not.toEqual(campSpot(6, HALL, 3));
  });

  it('les colons d’une nouvelle partie ne sont pas alignés', () => {
    const world = new World(100);
    const xs = [...world.mobiles.values()].filter((m) => m.kind === 'worker').map((m) => Math.round(m.x));

    expect(xs.length).toBe(10);
    expect(new Set(xs).size).toBeGreaterThan(5);
  });
});
