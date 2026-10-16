import { describe, expect, it } from 'vitest';
import { worldToTile } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import type { EntityId } from './types.ts';
import { World } from './world.ts';

/** La mairie bâtie, de quoi bâtir en ville, le matin du premier jour. */
function town(): World {
  const world = World.newColony(5);

  world.player.inventory.add('wood', 25);
  world.player.inventory.add('stone', 12);
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();
  world.townStock()!.add('wood', 60);
  world.townStock()!.add('stone', 60);
  return world;
}

/** Pose un chantier près de la mairie et rend son id. */
function site(world: World, building: 'home' | 'nursery'): EntityId {
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

describe('coups de main des ouvriers libres', () => {
  it('sans porteurs, les ouvriers libres livrent depuis la mairie le chantier de son rayon', () => {
    const world = town();
    const id = site(world, 'home');
    const before = world.townStock()!.count('wood');

    // Adam ne bouge pas, rien dans son sac : seuls les ouvriers libres portent.
    for (let i = 0; i < 20 * 120 && world.entities.get(id)?.kind === 'site'; i += 1) world.tick();

    expect(world.entities.get(id)?.kind).toBe('house');
    expect(world.townStock()!.count('wood')).toBe(before - (BUILDINGS.home.cost as Partial<Record<ItemId, number>>).wood!);
  });

  it('embauché en pleine livraison, rien ne se perd : sa charge retourne à la mairie', () => {
    const world = town();
    site(world, 'nursery');
    const stock = world.townStock()!;
    const hall = world.entities.get(world.townHallId)!;
    // Le bois des chantiers achevés depuis le départ, celui du poste mis à part (il vient du sac).
    let built = 0;
    let post: EntityId | null = null;

    world.events.on('buildingCompleted', (event) => {
      const proto = world.entities.get(event.id)!.proto;

      if (event.id !== post) built += (BUILDINGS[proto].cost as Partial<Record<ItemId, number>>).wood ?? 0;
    });

    const wood = (): number => {
      let carried = 0;
      let delivered = 0;

      for (const mobile of world.mobiles.values()) {
        if (mobile.kind === 'worker' && mobile.job?.carried && mobile.job.item === 'wood') carried += mobile.job.amount;
      }
      for (const entity of world.entities.values()) {
        if (entity.kind === 'site' && entity.id !== post) delivered += entity.delivered.wood ?? 0;
      }
      return stock.count('wood') + carried + delivered + built;
    };
    const before = wood();

    // Des ouvriers partent chargés…
    for (let i = 0; i < 20 * 30; i += 1) {
      world.tick();
      if ([...world.mobiles.values()].some((mobile) => mobile.kind === 'worker' && mobile.free && mobile.job?.carried)) break;
    }

    const carriers = [...world.mobiles.values()].filter((mobile) => mobile.kind === 'worker' && mobile.free && mobile.job?.carried);

    expect(carriers.length).toBeGreaterThan(0);

    // …et la commande d'embauche les prend tous : un poste de logistique achevé d'un coup.
    world.colonists = 10;
    const used = (BUILDINGS.logisticsPost.cost as Partial<Record<ItemId, number>>).wood ?? 0;

    world.player.x = (hall.tx + 1.5) * 32;
    world.player.y = (hall.ty + 4.5) * 32;
    for (const [item, amount] of Object.entries(BUILDINGS.logisticsPost.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);

    const origin = worldToTile(world.player.x, world.player.y);

    world.events.on('buildingPlaced', (event) => (post = event.id));
    for (let dx = -6; dx <= 6 && post === null; dx += 1) {
      for (let dy = -6; dy <= 6 && post === null; dy += 1) {
        if (world.canPlace('logisticsPost', origin.tx + dx, origin.ty + dy) !== null) continue;
        world.push({ type: 'placeBuilding', building: 'logisticsPost', tx: origin.tx + dx, ty: origin.ty + dy });
        world.tick();
      }
    }
    world.push({ type: 'transferToSite', id: post! });
    for (let i = 0; i < 20 * 5; i += 1) world.tick();

    // Ce que le poste a pris du sac n'était pas compté ; tout le reste du bois est là, en ville, en route ou livré.
    expect(world.entities.get(post!)?.kind).toBe('depot');
    expect(wood()).toBe(before);
    expect(used).toBeGreaterThan(0);

    // Et les réservations de la mairie retombent à zéro une fois tout livré.
    for (let i = 0; i < 20 * 120; i += 1) world.tick();
    expect(stock.available('wood') + [...world.mobiles.values()].reduce((sum, m) => sum + (m.kind === 'worker' && m.job && !m.job.carried && m.job.item === 'wood' ? m.job.amount : 0), 0)).toBe(stock.count('wood'));
  });
});
