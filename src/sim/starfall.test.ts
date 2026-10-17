import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { STARFALL } from '../data/starfall.ts';
import { deserialize, serialize } from './save.ts';
import { isStarNight } from './starfall.ts';
import type { Pickup } from './types.ts';
import { World } from './world.ts';
import { SLOW } from './sweep.ts';

/** Une graine dont la nuit 2 est une nuit d'étoiles. */
function starSeed(): number {
  for (let seed = 1; seed < 500; seed += 1) if (isStarNight(seed, 2)) return seed;
  throw new Error('aucune graine');
}

describe('nuits d’étoiles filantes', () => {
  it('jamais avant `fromNight`, et à peu près la part prévue des nuits ensuite', () => {
    let stars = 0;
    let nights = 0;

    for (let seed = 1; seed < 200; seed += 1) {
      expect(isStarNight(seed, 1)).toBe(false);
      for (let night = STARFALL.fromNight; night < STARFALL.fromNight + 10; night += 1) {
        nights += 1;
        if (isStarNight(seed, night)) stars += 1;
      }
    }
    expect(stars / nights).toBeGreaterThan(STARFALL.chance - 0.08);
    expect(stars / nights).toBeLessThan(STARFALL.chance + 0.08);
  });

  it.skipIf(!SLOW)('annoncée au crépuscule, elle laisse des éclats autour de la mairie, qui éclairent la nuit et survivent au rechargement', () => {
    const world = new World(starSeed());

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    const hall = world.entities.get(world.townHallId)!;
    const announced: number[] = [];
    const fallen: Pickup[] = [];

    world.revealAround(hall.tx, hall.ty, STARFALL.maxTiles + 4);
    world.events.on('starfallAnnounced', ({ night }) => announced.push(night));
    world.events.on('starFell', ({ id }) => fallen.push(world.mobiles.get(id) as Pickup));
    while (!(world.night === 2 && world.clock()?.phase === 'dawn')) world.tick();

    expect(announced).toContain(2);
    expect(fallen.length).toBeGreaterThan(3);
    for (const star of fallen) {
      const distance = Math.hypot(star.x / TILE_SIZE - (hall.tx + 1.5), star.y / TILE_SIZE - (hall.ty + 1.5));

      expect(star.star).toBe(true);
      expect(distance).toBeLessThanOrEqual(STARFALL.maxTiles + 1);
    }

    const lying = fallen.find((star) => world.mobiles.has(star.id))!;

    expect(world.sightAt(Math.floor(lying.x / TILE_SIZE), Math.floor(lying.y / TILE_SIZE))).toBe('visible');

    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(world))));

    expect((loaded.mobiles.get(lying.id) as Pickup).star).toBe(true);
  }, 60_000);
});
