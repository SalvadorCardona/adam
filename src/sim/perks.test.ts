import { describe, expect, it } from 'vitest';
import { worldToTile } from '../core/grid.ts';
import { harvestYieldWith, seedsFor, type PerkId } from '../data/perks.ts';
import { BUILD_REACH_TILES, INVENTORY_CAPACITY } from './player.ts';
import { decodeSave, encodeSave } from './save.ts';
import type { EntityId } from './types.ts';
import { World, siteMissing } from './world.ts';

/** Un monde parti avec ces bonus, comme au clic sur « Jouer ». */
function startedWith(perks: readonly PerkId[], seed = 7): World {
  const world = new World(seed);

  world.push({ type: 'applyPerks', perks });
  world.tick();
  return world;
}

/** Ouvre un chantier de tour de guet sur la première case posable à portée. */
function placeTower(world: World): EntityId {
  const origin = worldToTile(world.player.x, world.player.y);

  for (let dy = -BUILD_REACH_TILES; dy <= BUILD_REACH_TILES; dy += 1) {
    for (let dx = -BUILD_REACH_TILES; dx <= BUILD_REACH_TILES; dx += 1) {
      const tx = origin.tx + dx;
      const ty = origin.ty + dy;

      if (world.canPlace('watchtower', tx, ty) !== null) continue;

      const before = new Set(world.entities.keys());

      world.push({ type: 'placeBuilding', building: 'watchtower', tx, ty });
      world.tick();

      const id = [...world.entities.keys()].find((key) => !before.has(key));

      if (id === undefined) throw new Error('le chantier n’a pas été ouvert');
      return id;
    }
  }
  throw new Error('aucune case posable à portée');
}

describe('bonus du jardin', () => {
  it('au départ : sac agrandi et objets dans le sac', () => {
    const { inventory } = startedWith(['bigBag', 'woodStart', 'stoneStart']).player;

    expect(inventory.capacity).toBe(INVENTORY_CAPACITY + 10);
    expect(inventory.count('wood')).toBe(10);
    expect(inventory.count('stone')).toBe(6);
  });

  it('sans bonus — partie pure — rien ne change', () => {
    const world = startedWith([]);

    expect(world.perks).toEqual([]);
    expect(world.player.inventory.capacity).toBe(INVENTORY_CAPACITY);
    expect(world.player.inventory.total()).toBe(0);
  });

  it('refusés une fois la partie lancée, et appliqués une seule fois', () => {
    const late = new World(7);

    late.tick();
    late.push({ type: 'applyPerks', perks: ['woodStart'] });
    late.tick();
    expect(late.perks).toEqual([]);
    expect(late.player.inventory.count('wood')).toBe(0);

    const twice = new World(7);

    twice.push({ type: 'applyPerks', perks: ['woodStart', 'woodStart'] });
    twice.push({ type: 'applyPerks', perks: ['woodStart'] });
    twice.tick();
    expect(twice.player.inventory.count('wood')).toBe(10);
  });

  it('la tour offerte : le premier chantier arrive livré, pas le suivant, et attend « Construire »', () => {
    const world = startedWith(['freeTower']);
    const ready: EntityId[] = [];

    world.events.on('siteReady', ({ id }) => ready.push(id));

    const first = placeTower(world);
    const gifted = world.entities.get(first);

    expect(gifted?.kind).toBe('site');
    if (gifted?.kind === 'site') expect(siteMissing(gifted)).toBe(0);
    expect(ready).toEqual([first]);

    const second = world.entities.get(placeTower(world));

    if (second?.kind !== 'site') throw new Error('pas de second chantier');
    expect(siteMissing(second)).toBeGreaterThan(0);
  });

  it('la hache affûtée coupe plus vite, et seulement les arbres', () => {
    const over = (perks: PerkId[], resource: 'tree' | 'stoneRock'): number => {
      let total = 0;

      for (let pass = 0; pass < 100; pass += 1) total += harvestYieldWith(perks, resource, 1, pass);
      return total;
    };

    expect(over(['sharpAxe'], 'tree')).toBe(110);
    expect(over([], 'tree')).toBe(100);
    expect(over(['sharpAxe'], 'stoneRock')).toBe(100);
  });

  it('les bonus et le sac agrandi survivent à la sauvegarde', () => {
    const world = startedWith(['bigBag', 'freeTower', 'woodStart']);
    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.world.perks).toEqual(['bigBag', 'freeTower', 'woodStart']);
    expect(decoded.world.player.inventory.capacity).toBe(INVENTORY_CAPACITY + 10);
    expect(decoded.world.player.inventory.count('wood')).toBe(10);
    expect(decoded.world.snapshot().giftedSites).toEqual(['watchtower']);
  });

  it('une sauvegarde d’avant le jardin se relit comme une colonie sans bonus', () => {
    const text = encodeSave(new World(7), 0);
    const file = JSON.parse(text) as { state: Record<string, unknown> };

    delete file.state['perks'];
    delete file.state['giftedSites'];

    const decoded = decodeSave(JSON.stringify(file));

    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.world.perks).toEqual([]);
  });
});

describe('graines laissées par une colonie', () => {
  it('une colonie qui n’a rien bâti ne compte rien, sinon le bâti et les nuits comptent', () => {
    const world = new World(7);

    expect(world.colonyScore()).toEqual({ waves: 0, children: 0, buildings: 0, bases: 0, population: 11, minutes: 0, victory: false });

    world.night = 4;
    world.defeated = true;
    expect(world.colonyScore()).toEqual({ waves: 3, children: 0, buildings: 1, bases: 0, population: 11, minutes: 0, victory: false });
    expect(seedsFor(world.colonyScore())).toBeGreaterThan(seedsFor({ waves: 0, children: 0, buildings: 1, bases: 0, population: 0, minutes: 0, victory: false }));
  });

  it('le bilan lit les bases abattues, le Signal et le temps de jeu', () => {
    const world = new World(7);
    const before = seedsFor(world.colonyScore());

    world.enemyBases[0]!.hp = 0;
    world.victory = true;
    world.tickCount = 20 * 60 * 30;

    const score = world.colonyScore();

    expect(score).toMatchObject({ bases: 1, victory: true, minutes: 30 });
    expect(seedsFor(score)).toBeGreaterThan(before);
  });
});
