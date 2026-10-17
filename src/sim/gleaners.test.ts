import { describe, expect, it } from 'vitest';
import { coordKey, worldToTile } from '../core/grid.ts';
import { GLEANERS } from '../data/workers.ts';
import { deserialize, serialize } from './save.ts';
import type { EntityId, Worker } from './types.ts';
import { World } from './world.ts';
import { SLOW } from './sweep.ts';

/** La mairie bâtie, la ville à sec, le matin du premier jour : seuls les libres peuvent la nourrir. */
function bareTown(seed = 5): World {
  const world = World.newColony(seed);

  world.player.inventory.add('wood', 25);
  world.player.inventory.add('stone', 12);
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();
  return world;
}

/** Pose un chantier près de la mairie et rend son id. */
function site(world: World, building: 'home' | 'lab' | 'lumberCamp'): EntityId {
  const hall = world.entities.get(world.townHallId)!;
  const origin = worldToTile(world.player.x, world.player.y);
  let id: EntityId | null = null;
  const off = world.events.on('buildingPlaced', (event) => (id = event.id));

  for (let r = 2; r < 8 && id === null; r += 1) {
    for (let dy = -r; dy <= r && id === null; dy += 1) {
      for (let dx = -r; dx <= r && id === null; dx += 1) {
        const tx = origin.tx + dx;
        const ty = origin.ty + dy;

        if (Math.abs(tx - hall.tx) > 8 || world.canPlace(building, tx, ty) !== null) continue;
        world.push({ type: 'placeBuilding', building, tx, ty });
        world.tick();
      }
    }
  }
  off();
  if (id === null) throw new Error('aucune place');
  return id;
}

function workers(world: World): Worker[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Worker => mobile.kind === 'worker');
}

function gleaning(world: World): Worker[] {
  return workers(world).filter((worker) => worker.glean);
}

describe('glaneurs', () => {
  it("un joueur AFK après la mairie a bâti une maison et réuni le bois et la pierre d'un labo avant la nuit", () => {
    const world = bareTown();
    const lab = site(world, 'lab');
    const home = site(world, 'home');

    for (let i = 0; i < 20 * 180 && world.dayDial()?.phase !== 'dusk'; i += 1) world.tick();

    const delivered = (world.entities.get(lab) as { delivered: Record<string, number> }).delivered;

    expect(world.entities.get(home)?.kind).toBe('house');
    // Le fer reste aux foreuses : le labo attend d'être livré, jamais glané.
    expect(delivered['wood']).toBe(14);
    expect(delivered['stone']).toBe(10);
    expect(delivered['ironOre'] ?? 0).toBeLessThan(4);
  });

  it('Adam immobile, un chantier dans le rayon reçoit le bois et la pierre glanés par les libres', () => {
    const world = bareTown();
    const id = site(world, 'home');
    const x = world.player.x;
    const y = world.player.y;

    for (let i = 0; i < 20 * 150 && world.entities.get(id)?.kind === 'site'; i += 1) world.tick();

    expect(world.player.x).toBe(x);
    expect(world.player.y).toBe(y);
    expect(world.entities.get(id)?.kind).toBe('house');
  });

  it('ne glane jamais ni fer ni charbon, ni plus que GLEANERS.max à la fois, ni deux fois la même ressource', () => {
    const world = bareTown();

    site(world, 'home');
    for (let i = 0; i < 20 * 120; i += 1) {
      world.tick();

      const busy = gleaning(world);
      const tiles = busy.filter((worker) => !worker.glean!.item).map((worker) => coordKey(worker.glean!.tx, worker.glean!.ty));

      expect(busy.length).toBeLessThanOrEqual(GLEANERS.max);
      expect(new Set(tiles).size).toBe(tiles.length);
      for (const worker of busy) expect(['tree', 'stoneRock']).toContain(worker.glean!.resource);
    }
  });

  it("s'arrêtent quand rien n'attend l'objet : la ville ne dépasse pas ce qui est attendu plus la réserve", () => {
    const world = bareTown();

    // Aucun chantier : seule la réserve est attendue.
    for (let i = 0; i < 20 * 150; i += 1) world.tick();

    const stock = world.townStock()!;

    expect(stock.count('wood')).toBeLessThanOrEqual(10 + GLEANERS.max);
    expect(stock.count('stone')).toBeLessThanOrEqual(10 + GLEANERS.max);
    expect(stock.count('ironOre')).toBe(0);
    expect(stock.count('coal')).toBe(0);
    const before = stock.count('wood');

    for (let i = 0; i < 20 * 20; i += 1) world.tick();
    expect(world.townStock()!.count('wood')).toBe(before);
    expect(gleaning(world)).toHaveLength(0);
  });

  it.skipIf(!SLOW)('personne ne glane la nuit ni pendant une vague', () => {
    const world = bareTown();

    site(world, 'home');
    let sawNight = false;

    for (let i = 0; i < 20 * 400; i += 1) {
      world.tick();
      if (world.dayDial()?.phase === 'night' || world.dayDial()?.phase === 'dusk') {
        sawNight = true;
        for (const worker of gleaning(world)) expect(worker.glean!.item).not.toBeNull();
      }
    }
    expect(sawNight).toBe(true);
  });

  it('la sauvegarde reprend un glaneur en route, et le rejeu donne la même empreinte', () => {
    const a = bareTown();

    site(a, 'home');
    for (let i = 0; i < 20 * 30; i += 1) a.tick();
    expect(gleaning(a).length).toBeGreaterThan(0);

    const b = deserialize(JSON.parse(JSON.stringify(serialize(a))));

    for (let i = 0; i < 20 * 60; i += 1) {
      a.tick();
      b.tick();
    }
    expect(b.checksum()).toBe(a.checksum());
  });
});
