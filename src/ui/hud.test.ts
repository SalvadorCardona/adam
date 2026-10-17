import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import type { ItemId } from '../data/items.ts';
import { World } from '../sim/world.ts';
import { defeatRows } from './hud.ts';
import { SLOW } from '../sim/sweep.ts';

const CYCLE = DAY_CYCLE.day + DAY_CYCLE.dusk + DAY_CYCLE.night + DAY_CYCLE.dawn;

/** Un monde dont la mairie est bâtie, et assez solide pour passer les nuits sans défenseur. */
function builtWorld(): World {
  const world = new World(1);

  for (const [item, amount] of Object.entries(BUILDINGS.townHall.cost) as [ItemId, number][]) {
    world.player.inventory.add(item, amount);
  }
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();

  const hall = world.entities.get(world.townHallId);

  if (hall?.kind !== 'townHall') throw new Error('la mairie devrait être bâtie');
  hall.hp = 1_000_000;
  return world;
}

/** Avance jusqu'à ce que `done` soit vrai, en `limit` ticks au plus. */
function runUntil(world: World, done: () => boolean, limit: number): void {
  for (let i = 0; i < limit && !done(); i += 1) world.tick();
  if (!done()) throw new Error(`rien au bout de ${limit} ticks (nuit ${world.night})`);
}

function nightsSurvived(world: World): string | undefined {
  return defeatRows(world).find(([label]) => label === 'Nuits survécues')?.[1];
}

describe('defeatRows', () => {
  it('ne compte aucune nuit si la mairie tombe avant la première', () => {
    const world = builtWorld();

    expect(world.clock()?.phase).toBe('day');
    expect(nightsSurvived(world)).toBe('0');
  });

  it.skipIf(!SLOW)('ne compte pas la nuit pendant laquelle la mairie tombe', () => {
    const world = builtWorld();

    // Passé les nuits de grâce (où elle ne tombe pas) : la nuit 4.
    runUntil(world, () => world.night === 4 && world.mobiles.size > 0, CYCLE * 5);

    // La mairie redevient fragile : le premier coup de mutant la fait tomber, en pleine nuit 4.
    const hall = world.entities.get(world.townHallId);

    if (hall?.kind !== 'townHall') throw new Error('la mairie devrait être debout');
    hall.hp = 1;
    runUntil(world, () => world.defeated, DAY_CYCLE.night);
    expect(world.clock()?.phase).toBe('night');
    expect(nightsSurvived(world)).toBe('3');
  });

  it.skipIf(!SLOW)('compte la nuit 3 si la mairie tombe le jour qui la suit', () => {
    const world = builtWorld();
    let dawns = 0;

    world.events.on('dawnBroke', () => (dawns += 1));
    runUntil(world, () => dawns === 3 && world.clock()?.phase === 'day', CYCLE * 4);
    expect(world.night).toBe(3);
    expect(nightsSurvived(world)).toBe('3');
  });
});
