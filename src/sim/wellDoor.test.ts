import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { doorOf } from './jobs.ts';
import { decodeSave, encodeSave } from './save.ts';
import { doorSide, isWalkable, terrainAt, touchesWater } from './terrain.ts';
import { World } from './world.ts';
import { SWEEP_SEEDS } from './sweep.ts';

const { width, height } = BUILDINGS.well;

/** La tuile où tombe la porte d'une emprise. */
function doorTile(tx: number, ty: number, door?: Parameters<typeof doorOf>[0]['door']): { x: number; y: number } {
  const at = doorOf({ tx, ty, width, height, door });

  return { x: Math.floor(at.x / TILE_SIZE), y: Math.floor(at.y / TILE_SIZE) };
}

/** Les emprises de puits possibles autour de l'origine : de la terre partout, l'eau au bord. */
function shores(seed: number, reach: number): [number, number][] {
  const found: [number, number][] = [];

  for (let ty = -reach; ty <= reach; ty += 1) {
    for (let tx = -reach; tx <= reach; tx += 1) {
      const land = [0, 1].every((y) => [0, 1].every((x) => isWalkable(terrainAt(seed, tx + x, ty + y))));

      if (land && touchesWater(seed, tx, ty, width, height)) found.push([tx, ty]);
    }
  }
  return found;
}

describe('la porte d’un bâtiment de rive', () => {
  it('tombe sur une case où l’on marche, sur un balayage de seeds', () => {
    for (let seed = 0; seed < SWEEP_SEEDS; seed += 1) {
      for (const [tx, ty] of shores(seed, 8)) {
        const side = doorSide(seed, tx, ty, width, height);

        // L'emprise est de la terre : l'eau ne peut border les quatre côtés à la fois.
        expect(side, `seed ${seed} en (${tx}, ${ty})`).not.toBeNull();

        const door = doorTile(tx, ty, side!);

        expect(isWalkable(terrainAt(seed, door.x, door.y)), `seed ${seed} en (${tx}, ${ty})`).toBe(true);
      }
    }
  });

  it('est atteinte de la mairie et boit : le puits au sud de la mare, graine 1 734 901 450', () => {
    const seed = 1_734_901_450;
    const world = new World(seed);
    // L'emprise du constat : tuiles (-4, 15) à (-3, 16), l'eau juste au sud.
    const tx = -4;
    const ty = 15;

    expect(isWalkable(terrainAt(seed, -3, 17))).toBe(false);

    const state = world.snapshot();

    state.entities = [
      ...state.entities,
      { kind: 'quarry', id: state.nextId, proto: 'well', tx, ty, width, height, store: { water: 30 }, hp: 100, level: 1, paused: false, staff: 1, blocked: false },
    ];
    state.nextId += 1;

    const loaded = World.restore(state);
    const well = [...loaded.entities.values()].find((entity) => entity.proto === 'well')!;
    const door = doorOf(well);

    expect(isWalkable(terrainAt(seed, Math.floor(door.x / TILE_SIZE), Math.floor(door.y / TILE_SIZE)))).toBe(true);
  });

  it('se retourne au chargement d’une sauvegarde à porte noyée, et se sauvegarde', () => {
    const seed = 1_734_901_450;
    const world = new World(seed);
    const state = world.snapshot();

    state.entities = [
      ...state.entities,
      { kind: 'quarry', id: state.nextId, proto: 'well', tx: -4, ty: 15, width, height, store: { water: 30 }, hp: 100, level: 1, paused: false, staff: 1, blocked: false },
    ];
    state.nextId += 1;

    const loaded = World.restore(state);
    const well = [...loaded.entities.values()].find((entity) => entity.proto === 'well')!;

    expect(well.door).not.toBe('south');
    expect(well.door).toBeDefined();

    const decoded = decodeSave(encodeSave(loaded, 0));

    if (!decoded.ok) throw new Error('sauvegarde illisible');

    const again = decoded.world;
    const reloaded = [...again.entities.values()].find((entity) => entity.proto === 'well')!;

    expect(reloaded.door).toBe(well.door);
  });
});
