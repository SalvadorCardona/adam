import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { LOOT_DROPS } from '../data/enemies.ts';
import type { ItemId } from '../data/items.ts';
import { COLONY } from '../data/inhabitants.ts';
import type { DepositRejection } from './commands.ts';
import { INVENTORY_CAPACITY } from './player.ts';
import { SAVE_VERSION, decodeSave, encodeSave } from './save.ts';
import type { Pickup } from './types.ts';
import { World } from './world.ts';

/** Un monde neuf dont la mairie est bâtie : son coût passe du sac au chantier d'un coup. */
function withTown(seed = 11): World {
  const world = new World(seed);

  for (const [item, amount] of Object.entries(BUILDINGS.townHall.cost) as [ItemId, number][]) {
    world.player.inventory.add(item, amount);
  }
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();
  if (!world.townStock()) throw new Error('la mairie ne s’est pas achevée');
  return world;
}

function pickups(world: World): Pickup[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Pickup => mobile.kind === 'pickup');
}

function rejections(world: World): DepositRejection[] {
  const found: DepositRejection[] = [];

  world.events.on('depositRejected', ({ reason }) => found.push(reason));
  return found;
}

describe('ville et sac', () => {
  it('pas de ville tant que la mairie est en chantier : rien ne se dépose', () => {
    const world = new World(11);
    const refused = rejections(world);

    world.player.inventory.add('wood', 5);
    expect(world.townStock()).toBeNull();
    world.push({ type: 'depositToTown' });
    world.tick();

    expect(refused).toEqual(['noTown']);
    expect(world.player.inventory.count('wood')).toBe(5);
  });

  it('« Déposer en ville » vide le sac dans le coffre de la mairie et rend la place', () => {
    const world = withTown();
    const { inventory } = world.player;

    inventory.add('wood', 30);
    inventory.add('stone', 12);
    expect(inventory.freeSpace()).toBe(INVENTORY_CAPACITY - 42);

    world.push({ type: 'depositToTown' });
    world.tick();

    expect(inventory.total()).toBe(0);
    expect(inventory.freeSpace()).toBe(INVENTORY_CAPACITY);
    expect(world.townStock()!.count('wood')).toBe(30);
    expect(world.townStock()!.count('stone')).toBe(12);
  });

  it('déposer un seul objet laisse le reste dans le sac', () => {
    const world = withTown();
    const { inventory } = world.player;

    inventory.add('wood', 8);
    inventory.add('coal', 3);
    world.push({ type: 'depositToTown', item: 'wood' });
    world.tick();

    expect(inventory.count('wood')).toBe(0);
    expect(inventory.count('coal')).toBe(3);
    expect(world.townStock()!.count('wood')).toBe(8);
    expect(world.townStock()!.count('coal')).toBe(0);
  });

  it('une quantité ne dépose ou ne jette que ces unités-là', () => {
    const world = withTown();
    const { inventory } = world.player;

    inventory.add('wood', 12);
    world.push({ type: 'depositToTown', item: 'wood', amount: 10 });
    world.tick();

    expect(inventory.count('wood')).toBe(2);
    expect(world.townStock()!.count('wood')).toBe(10);

    world.push({ type: 'dropItem', item: 'wood', amount: 1 });
    world.tick();

    expect(inventory.count('wood')).toBe(1);
    expect(pickups(world)).toEqual([expect.objectContaining({ item: 'wood', amount: 1 })]);
  });

  it('loin de la mairie, ou le sac vide : refusé, rien ne bouge', () => {
    const world = withTown();
    const refused = rejections(world);

    world.push({ type: 'depositToTown' });
    world.tick();

    world.player.inventory.add('stone', 4);
    world.player.x += 30 * TILE_SIZE;
    expect(world.nearTown()).toBe(false);
    world.push({ type: 'depositToTown' });
    world.tick();

    expect(refused).toEqual(['empty', 'outOfReach']);
    expect(world.player.inventory.count('stone')).toBe(4);
    expect(world.townStock()!.total()).toBe(COLONY.startingStock.food + COLONY.startingStock.water);
  });

  it('« Jeter » pose un tas à ses pieds, qu’Adam ne reprend qu’après s’en être éloigné', () => {
    const world = withTown();
    const { inventory } = world.player;

    inventory.add('wood', 20);
    inventory.add('stone', 5);
    world.push({ type: 'dropItem', item: 'wood' });
    world.tick();

    expect(inventory.count('wood')).toBe(0);
    expect(inventory.count('stone')).toBe(5);

    const [pile] = pickups(world);

    expect(pile).toMatchObject({ item: 'wood', amount: 20, waitForLeave: true });

    // Il reste au sol tant qu'Adam ne bouge pas.
    for (let i = 0; i < 40; i += 1) world.tick();
    expect(world.mobiles.has(pile!.id)).toBe(true);

    // Adam s'éloigne, revient : le tas rentre dans le sac.
    const { x, y } = world.player;

    world.player.x = x + (LOOT_DROPS.magnetRadius + 1) * TILE_SIZE;
    world.tick();
    world.player.x = x;
    world.player.y = y;
    world.tick();

    expect(inventory.count('wood')).toBe(20);
    expect(world.mobiles.has(pile!.id)).toBe(false);
  });

  it('un tas trop gros pour le sac n’y entre qu’en partie ; le reste attend au sol', () => {
    const world = withTown();
    const { inventory } = world.player;

    inventory.add('wood', 50);
    world.push({ type: 'dropItem' });
    world.tick();
    inventory.add('stone', INVENTORY_CAPACITY - 10);

    const { x, y } = world.player;

    world.player.x = x + (LOOT_DROPS.magnetRadius + 1) * TILE_SIZE;
    world.tick();
    world.player.x = x;
    world.player.y = y;
    world.tick();

    expect(inventory.count('wood')).toBe(10);
    expect(inventory.freeSpace()).toBe(0);
    expect(pickups(world)[0]).toMatchObject({ item: 'wood', amount: 40 });
  });

  it('« Tout jeter » fait un tas par objet et vide le sac', () => {
    const world = withTown();

    world.player.inventory.add('wood', 3);
    world.player.inventory.add('stone', 2);
    world.push({ type: 'dropItem' });
    world.tick();

    expect(world.player.inventory.total()).toBe(0);
    expect(pickups(world).map(({ item, amount }) => [item, amount]).sort()).toEqual([
      ['stone', 2],
      ['wood', 3],
    ]);
  });

  it('les constructions puisent dans le stock de la ville, après le sac, sans toucher au promis', () => {
    const world = withTown();
    const hall = world.entities.get(world.townHallId)!;
    const town = world.townStock()!;

    // Un chantier de tour juste à côté de la mairie.
    let siteId = -1;

    // La récompense de l'objectif de la première tour tomberait dans le sac : elle n'est pas l'objet du test.
    world.objectivesDone.add('firstTower');

    for (let dx = -6; dx <= 6 && siteId < 0; dx += 1) {
      const tx = hall.tx + dx;
      const ty = hall.ty + hall.height + 1;

      if (world.canPlace('watchtower', tx, ty) === null) {
        world.push({ type: 'placeBuilding', building: 'watchtower', tx, ty });
        world.tick();
        siteId = [...world.entities.values()].find((entity) => entity.kind === 'site')?.id ?? -1;
      }
    }
    expect(siteId).toBeGreaterThan(0);

    const cost = BUILDINGS.watchtower.cost as Partial<Record<ItemId, number>>;
    const [item, needed] = Object.entries(cost)[0] as [ItemId, number];

    world.player.inventory.add(item, 1);
    town.add(item, needed + 5);
    // Cinq objets déjà promis à un porteur : la ville ne les donne pas.
    town.reserveOut(item, 5);
    for (const [other, amount] of Object.entries(cost) as [ItemId, number][]) {
      if (other !== item) town.add(other, amount);
    }

    world.push({ type: 'transferToSite', id: siteId });
    world.tick();

    expect(world.entities.get(siteId)?.kind).toBe('tower');
    expect(world.player.inventory.count(item)).toBe(0);
    expect(town.count(item)).toBe(5 + 1);
    expect(town.available(item)).toBe(1);
  });

  it('le sac, la ville et les tas jetés survivent à la sauvegarde', () => {
    const world = withTown();

    world.player.inventory.add('wood', 12);
    world.player.inventory.add('stone', 7);
    world.push({ type: 'depositToTown', item: 'stone' });
    world.push({ type: 'dropItem', item: 'wood' });
    world.tick();
    world.player.inventory.add('coal', 2);

    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);

    const restored = decoded.world;

    expect(restored.player.inventory.toJSON()).toEqual({ coal: 2 });
    expect(restored.player.inventory.capacity).toBe(INVENTORY_CAPACITY);
    expect(restored.townStock()!.toJSON()).toEqual({ ...COLONY.startingStock, stone: 7 });
    expect(pickups(restored)).toEqual([expect.objectContaining({ item: 'wood', amount: 12, waitForLeave: true })]);
  });

  it('un butin d’une sauvegarde d’avant les tas se relit comme un exemplaire', () => {
    const world = withTown();
    const state = world.snapshot();
    const { x, y } = world.player;

    state.mobiles = [{ kind: 'pickup', id: 900, x, y: y + 200, prevX: x, prevY: y + 200, facing: 'down', moving: false, item: 'coal', ttl: 50 } as never];

    const decoded = decodeSave(JSON.stringify({ version: SAVE_VERSION, savedAt: 0, state }));

    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.world.mobiles.get(900)).toMatchObject({ amount: 1, waitForLeave: false });
  });
});
