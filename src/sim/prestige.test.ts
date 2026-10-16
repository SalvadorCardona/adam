import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { ENEMIES, WILDLIFE } from '../data/enemies.ts';
import type { ItemId } from '../data/items.ts';
import { BUILD_PRESTIGE, KILL_PRESTIGE } from '../data/prestige.ts';
import { SAVE_VERSION, decodeSave, encodeSave, serialize } from './save.ts';
import type { Beast, EntityId, Mutant } from './types.ts';
import { World } from './world.ts';

const SEED = 11;

function fillBag(world: World, building: BuildingId): void {
  for (const [item, amount] of Object.entries(BUILDINGS[building].cost) as [ItemId, number][]) {
    world.player.inventory.add(item, amount);
  }
}

/** Livre le chantier depuis le sac : le dernier objet l'achève. */
function finish(world: World, id: EntityId): void {
  const site = world.entities.get(id);

  if (site?.kind !== 'site') throw new Error(`#${id} n'est pas un chantier`);
  fillBag(world, site.proto);
  world.push({ type: 'transferToSite', id });
  world.tick();
  if (world.entities.get(id)?.kind === 'site') throw new Error('le chantier ne s’est pas achevé');
}

function withTownHall(): World {
  const world = new World(SEED);

  finish(world, world.townHallId);
  return world;
}

/** Pose une cabane de bûcheron sous la mairie, et l'achève. */
function buildCamp(world: World): EntityId {
  const hall = world.entities.get(world.townHallId)!;

  for (let dx = -6; dx <= 6; dx += 1) {
    const tx = hall.tx + dx;
    const ty = hall.ty + hall.height + 1;

    if (world.canPlace('lumberCamp', tx, ty) !== null) continue;

    const before = new Set(world.entities.keys());

    world.push({ type: 'placeBuilding', building: 'lumberCamp', tx, ty });
    world.tick();

    const id = [...world.entities.keys()].find((key) => !before.has(key))!;

    finish(world, id);
    return id;
  }
  throw new Error('aucune place pour la cabane');
}

/** Le bâtiment tombe à zéro, comme sous les coups des mutants : il redevient son chantier, au même endroit. */
function ruin(world: World, id: EntityId): EntityId {
  const building = world.entities.get(id)!;

  (world as unknown as { damageBuilding(id: EntityId, amount: number): void }).damageBuilding(id, 10_000);

  const site = [...world.entities.values()].find(
    (entity) => entity.kind === 'site' && entity.tx === building.tx && entity.ty === building.ty,
  );

  if (!site) throw new Error('pas de ruine');
  return site.id;
}

function gains(world: World): number[] {
  const found: number[] = [];

  world.events.on('prestigeGained', ({ amount }) => found.push(amount));
  return found;
}

/** Laisse l'arc d'Adam abattre ce qui est posé à trois tuiles de lui. */
function shootDown(world: World, id: number): void {
  for (let i = 0; i < 400 && world.mobiles.has(id); i += 1) world.tick();
  expect(world.mobiles.has(id)).toBe(false);
}

function crabNextTo(world: World, id = 9001): Beast {
  const x = world.player.x + 3 * TILE_SIZE;
  const y = world.player.y;
  const beast: Beast = {
    kind: 'beast',
    id,
    proto: 'crab',
    x,
    y,
    prevX: x,
    prevY: y,
    facing: 'down',
    moving: false,
    hp: WILDLIFE.crab.hp,
    age: 3,
    denId: 0,
    homeX: x,
    homeY: y,
    state: 'return',
    dirX: 0,
    dirY: 0,
    wanderTicks: 0,
    attackCooldown: 0,
  };

  world.mobiles.set(id, beast);
  return beast;
}

function mutantNextTo(world: World, proto: 'mutant' | 'brute', id = 9002): Mutant {
  const x = world.player.x + 3 * TILE_SIZE;
  const y = world.player.y;
  const mutant: Mutant = {
    kind: 'mutant',
    id,
    proto,
    x,
    y,
    prevX: x,
    prevY: y,
    facing: 'down',
    moving: false,
    hp: ENEMIES[proto].hp,
    age: 30,
    attackCooldown: 0,
    emerge: 0,
  };

  world.mobiles.set(id, mutant);
  return mutant;
}

describe('Prestige', () => {
  it('démarre à zéro', () => {
    expect(new World(SEED).prestige).toBe(0);
  });

  it('se gagne à l’achèvement d’un bâtiment, selon son type, au-dessus de lui', () => {
    const world = new World(SEED);
    const events: { amount: number; total: number; x: number; y: number }[] = [];

    world.events.on('prestigeGained', (event) => events.push(event));
    finish(world, world.townHallId);

    const hall = world.entities.get(world.townHallId)!;

    expect(world.prestige).toBe(BUILD_PRESTIGE.townHall);
    expect(events).toEqual([
      { amount: BUILD_PRESTIGE.townHall, total: BUILD_PRESTIGE.townHall, x: (hall.tx + hall.width / 2) * TILE_SIZE, y: hall.ty * TILE_SIZE },
    ]);

    buildCamp(world);
    expect(world.prestige).toBe(BUILD_PRESTIGE.townHall + BUILD_PRESTIGE.lumberCamp);
  });

  it('rapporte plus pour un gros bâtiment, et pour un ennemi plus fort', () => {
    expect(BUILD_PRESTIGE.antenna).toBeGreaterThan(BUILD_PRESTIGE.townHall);
    expect(BUILD_PRESTIGE.townHall).toBeGreaterThan(BUILD_PRESTIGE.lumberCamp);
    expect(KILL_PRESTIGE.queen).toBeGreaterThan(KILL_PRESTIGE.brute);
    expect(KILL_PRESTIGE.brute).toBeGreaterThan(KILL_PRESTIGE.mutant);
    expect(KILL_PRESTIGE.wolf).toBeGreaterThan(KILL_PRESTIGE.crab);
  });

  it('ne rapporte rien de plus quand on rebâtit un bâtiment abattu au même endroit', () => {
    const world = withTownHall();
    const camp = buildCamp(world);
    const before = world.prestige;
    const found = gains(world);

    finish(world, ruin(world, camp));
    finish(world, ruin(world, [...world.entities.values()].find((entity) => entity.proto === 'lumberCamp')!.id));

    expect(world.prestige).toBe(before);
    expect(found).toEqual([]);
  });

  it('se gagne pour chaque ennemi abattu, selon son type, là où il tombe', () => {
    const world = withTownHall();
    const before = world.prestige;
    const found: { amount: number; x: number; y: number }[] = [];

    world.events.on('prestigeGained', ({ amount, x, y }) => found.push({ amount, x, y }));

    const crab = crabNextTo(world);

    shootDown(world, crab.id);
    expect(world.prestige).toBe(before + KILL_PRESTIGE.crab);
    expect(found[0]?.amount).toBe(KILL_PRESTIGE.crab);
    expect(Math.abs(found[0]!.x - crab.x)).toBeLessThan(TILE_SIZE * 2);

    shootDown(world, mutantNextTo(world, 'brute').id);
    expect(world.prestige).toBe(before + KILL_PRESTIGE.crab + KILL_PRESTIGE.brute);
  });

  it('se garde à la sauvegarde, emplacements payés compris', () => {
    const world = withTownHall();
    const camp = buildCamp(world);
    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);

    const restored = decoded.world;

    expect(restored.prestige).toBe(world.prestige);
    finish(restored, ruin(restored, camp));
    expect(restored.prestige).toBe(world.prestige);
  });

  it('une ancienne sauvegarde sans Prestige se charge à zéro, sans payer ses bâtiments déjà debout', () => {
    const world = withTownHall();
    const camp = buildCamp(world);
    const state = JSON.parse(JSON.stringify(serialize(world))) as Record<string, unknown>;

    delete state['prestige'];
    delete state['prestigeSites'];

    const decoded = decodeSave(JSON.stringify({ version: SAVE_VERSION, savedAt: 0, state }));

    if (!decoded.ok) throw new Error(decoded.reason);

    const restored = decoded.world;
    // Le défi du jour paie aussi du Prestige : il se compte à part.
    let daily = 0;

    restored.events.on('challengeCompleted', ({ prestige }) => (daily += prestige));

    expect(restored.prestige).toBe(0);
    finish(restored, ruin(restored, camp));
    expect(restored.prestige).toBe(daily);

    // Un bâtiment neuf, lui, rapporte.
    buildCamp(restored);
    expect(restored.prestige).toBe(BUILD_PRESTIGE.lumberCamp + daily);
  });
});
