import { describe, expect, it } from 'vitest';
import { TILE_SIZE, worldToTile } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { EVE } from '../data/eve.ts';
import type { ItemId } from '../data/items.ts';
import { QUEST_IDS } from '../data/quests.ts';
import { harvestYieldWithTools, isUnlocked } from './eve.ts';
import { BUILD_REACH_TILES } from './player.ts';
import { deserialize } from './save.ts';
import type { EntityId } from './types.ts';
import { World } from './world.ts';
import { SLOW } from './sweep.ts';

/** Un chantier livré d'office sauf un objet, que le sac apporte : le dernier objet l'achève. Adam est à portée. */
function finish(world: World, id: EntityId): void {
  const site = world.entities.get(id);

  if (site?.kind !== 'site') throw new Error(`#${id} n'est pas un chantier`);

  const cost = BUILDINGS[site.proto].cost as Partial<Record<ItemId, number>>;
  const [last] = Object.keys(cost) as ItemId[];

  site.delivered = { ...cost, [last!]: cost[last!]! - 1 };
  world.player.inventory.add(last!, 1);
  world.push({ type: 'transferToSite', id });
  world.tick();
  if (world.entities.get(id)?.kind === 'site') throw new Error('le chantier ne s’est pas achevé');
}

/** Pose et achève un bâtiment sur la première case posable à portée d'Adam. */
function build(world: World, building: BuildingId): void {
  const origin = worldToTile(world.player.x, world.player.y);

  for (let dy = -BUILD_REACH_TILES; dy <= BUILD_REACH_TILES; dy += 1) {
    for (let dx = -BUILD_REACH_TILES; dx <= BUILD_REACH_TILES; dx += 1) {
      if (world.canPlace(building, origin.tx + dx, origin.ty + dy) !== null) continue;

      const before = new Set(world.entities.keys());

      world.push({ type: 'placeBuilding', building, tx: origin.tx + dx, ty: origin.ty + dy });
      world.tick();
      finish(world, [...world.entities.keys()].find((key) => !before.has(key))!);
      return;
    }
  }
  throw new Error('aucune case posable à portée');
}

function withTownHall(seed = 7): World {
  const world = new World(seed);

  finish(world, world.townHallId);
  return world;
}

/** Raccourci : la nuit d'arrivée est passée, Ève roule jusqu'à la mairie. */
function withEve(seed = 7): World {
  const world = withTownHall(seed);

  world.night = EVE.arrivalNight;
  for (let i = 0; i < 2000 && world.eve()?.state !== 'idle'; i += 1) world.tick();
  if (world.eve()?.state !== 'idle') throw new Error('Ève n’est pas arrivée');
  return world;
}

function clearMutants(world: World): void {
  for (const mobile of world.mobiles.values()) {
    if (mobile.kind === 'mutant') world.mobiles.delete(mobile.id);
  }
}

describe('Ève', () => {
  it.skipIf(!SLOW)('arrive une fois la troisième nuit repoussée, et la population compte deux adultes', () => {
    const world = withTownHall();
    const arrived: number[] = [];

    world.events.on('eveArrived', () => arrived.push(world.night));

    expect(world.population().adults).toBe(1);

    for (let i = 0; i < 20 * 60 * 20 && arrived.length === 0; i += 1) {
      world.tick();
      if (world.night < EVE.arrivalNight) expect(world.eve()).toBeUndefined();
      // Adam repousse chaque vague sur-le-champ.
      clearMutants(world);
    }

    expect(arrived).toEqual([EVE.arrivalNight]);
    expect(world.eve()?.state).toBe('idle');
    expect(world.population().adults).toBe(2);
  });

  it('arrive du bord de la carte, sur son vélo, jusque devant la mairie', () => {
    const world = withTownHall();
    const hall = world.entities.get(world.townHallId)!;

    world.night = EVE.arrivalNight;
    for (let i = 0; i < 40 && !world.eve(); i += 1) world.tick();

    const eve = world.eve()!;

    expect(eve.state).toBe('arriving');
    expect(eve.x - eve.homeX).toBeGreaterThan(10 * TILE_SIZE);

    for (let i = 0; i < 2000 && eve.state === 'arriving'; i += 1) world.tick();

    expect(eve.state).toBe('idle');
    expect([eve.x, eve.y]).toEqual([eve.homeX, eve.homeY]);
    // Chez elle : une tuile collée à l'emprise de la mairie.
    expect(eve.homeX).toBeGreaterThan((hall.tx - 1) * TILE_SIZE);
    expect(eve.homeX).toBeLessThan((hall.tx + hall.width + 1) * TILE_SIZE);
    expect(eve.homeY).toBeGreaterThan((hall.ty - 1) * TILE_SIZE);
    expect(eve.homeY).toBeLessThan((hall.ty + hall.height + 1) * TILE_SIZE);
  });

  it('n’arrive pas si la vague est encore là', () => {
    const world = withTownHall();

    world.night = EVE.arrivalNight;
    world.mobiles.set(999, {
      kind: 'mutant',
      id: 999,
      proto: 'mutant',
      x: world.player.x + 400,
      y: world.player.y + 400,
      prevX: world.player.x + 400,
      prevY: world.player.y + 400,
      facing: 'down',
      moving: false,
      hp: 999,
      age: 30,
      attackCooldown: 0,
      emerge: 0,
    });
    for (let i = 0; i < 60; i += 1) world.tick();

    expect(world.eve()).toBeUndefined();
  });

  it('répare les bâtiments abîmés entre deux vagues', () => {
    const world = withEve();
    const hall = world.entities.get(world.townHallId)!;
    const repaired: number[] = [];

    world.events.on('buildingRepaired', ({ hp }) => repaired.push(hp));
    if (hall.kind === 'site') throw new Error('la mairie est encore en chantier');
    hall.hp = 50;

    for (let i = 0; i < 400; i += 1) {
      world.tick();
      clearMutants(world);
    }

    expect(repaired.length).toBeGreaterThan(0);
    expect(hall.hp).toBeGreaterThan(50);
    expect(hall.hp).toBeLessThanOrEqual(BUILDINGS.townHall.hp);
  });

  it('donne ses quêtes une à une, avec leur récompense', () => {
    const world = withEve();
    const completed: string[] = [];

    world.events.on('questCompleted', ({ quest }) => completed.push(quest));
    expect(world.questsDone).toBe(0);

    // La maison des constructeurs attend son plan.
    const origin = worldToTile(world.player.x, world.player.y);

    expect(world.canPlace('builderHouse', origin.tx + 2, origin.ty + 2)).toBe('locked');

    build(world, 'home');
    for (let i = 0; i < EVE.checkTicks; i += 1) world.tick();

    expect(completed).toEqual(['housing']);
    expect(world.questsDone).toBe(1);
    expect(world.canPlace('builderHouse', origin.tx + 2, origin.ty + 2)).not.toBe('locked');
  });

  it('se sauvegarde, en route comme arrivée, avec les quêtes finies', () => {
    const world = withEve();

    world.questsDone = 2;

    const state = JSON.parse(JSON.stringify(world.snapshot())) as ReturnType<World['snapshot']>;

    // Les bêtes ne sont pas le sujet ici.
    state.mobiles = state.mobiles.filter((mobile) => mobile.kind !== 'beast');

    const restored = deserialize(state);

    expect(restored.eve()).toEqual(world.eve());
    expect(restored.questsDone).toBe(2);
    expect(restored.population().adults).toBe(2);
  });

  it('relit une sauvegarde d’avant Ève sans quête finie', () => {
    const state = JSON.parse(JSON.stringify(new World(3).snapshot())) as Record<string, unknown>;

    delete state['questsDone'];
    expect(deserialize(state).questsDone).toBe(0);
  });
});

describe('quêtes et récompenses', () => {
  it('en compte au moins trois', () => {
    expect(QUEST_IDS.length).toBeGreaterThanOrEqual(3);
  });

  it('débloque un plan à la quête qui le donne', () => {
    const done = QUEST_IDS.findIndex((id) => id === 'housing') + 1;

    expect(isUnlocked('builderHouse', done - 1)).toBe(false);
    expect(isUnlocked('builderHouse', done)).toBe(true);
    expect(isUnlocked('home', 0)).toBe(true);
  });

  it('récolte plus vite avec les outils reçus', () => {
    const all = QUEST_IDS.length;

    expect(harvestYieldWithTools('tree', 0)).toBe(1);
    expect(harvestYieldWithTools('tree', all)).toBe(2);
    expect(harvestYieldWithTools('ironRock', all)).toBe(2);
  });
});
