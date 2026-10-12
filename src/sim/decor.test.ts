import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, BUILDING_IDS, bedsOf, logisticRadiusOf, speedOf, type BuildingId, type BuildingProto } from '../data/buildings.ts';
import { DECOR } from '../data/housing.ts';
import type { ItemId } from '../data/items.ts';
import { decorMoodAt, type DecorSpot } from './decor.ts';
import { decodeSave, encodeSave } from './save.ts';
import type { Building } from './types.ts';
import { World, type Laborer } from './world.ts';

const DECORS = BUILDING_IDS.filter((id) => BUILDINGS[id].kind === 'decor');

/** Un monde neuf, mairie bâtie : les dix ouvriers flânent devant. */
function withHall(seed = 11): World {
  const world = new World(seed);

  for (const [item, amount] of Object.entries(BUILDINGS.townHall.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();
  return world;
}

/** Pose et achève un bâtiment au premier emplacement libre autour de (tx, ty), pris dans la ville. */
function build(world: World, id: BuildingId, tx: number, ty: number): Building {
  const town = world.townStock()!;

  for (const [item, amount] of Object.entries(BUILDINGS[id].cost) as [ItemId, number][]) town.add(item, amount);
  for (let radius = 0; radius < 12; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius || world.canPlace(id, tx + dx, ty + dy) !== null) continue;

        world.push({ type: 'placeBuilding', building: id, tx: tx + dx, ty: ty + dy });
        world.tick();

        const site = [...world.entities.values()].find((entity) => entity.kind === 'site' && entity.proto === id);

        if (!site) throw new Error('pas de chantier');
        world.push({ type: 'transferToSite', id: site.id });
        world.tick();

        const built = world.entities.get(site.id);

        if (!built || built.kind === 'site') throw new Error('le chantier ne s’est pas achevé');
        return built;
      }
    }
  }
  throw new Error('aucune place');
}

/** Ce que l'aube fait au moral des ouvriers : le bonheur de chacun après une nuit. */
function dawnHappiness(world: World): number[] {
  const laborers = [...world.mobiles.values()].filter((mobile): mobile is Laborer => mobile.kind === 'worker');

  (world as unknown as { restInhabitants(): void }).restInhabitants();
  return laborers.map((worker) => worker.happiness);
}

/** Pose la décoration `id` à côté des ouvriers libres, et débloque son menu. */
function withDecor(world: World, id: BuildingId): void {
  const worker = [...world.mobiles.values()].find((mobile) => mobile.kind === 'worker')!;

  world.objective = 6;
  build(world, id, Math.floor(worker.x / TILE_SIZE), Math.floor(worker.y / TILE_SIZE));
}

describe('décorations : les données', () => {
  it('compte cinq décorations, sans fonction : ni ouvrier, ni coffre, ni lit', () => {
    expect(DECORS).toHaveLength(5);
    for (const id of DECORS) {
      const proto: BuildingProto = BUILDINGS[id];

      expect(proto).toMatchObject({ workers: 0, storage: 0, category: 'decor', menu: true });
      expect(bedsOf(id)).toBe(0);
      expect(proto.mood!.amount).toBeGreaterThan(0);
    }
  });

  it('les plus rares donnent le plus : le moral se gagne en explorant et en finissant l’acte I', () => {
    expect(BUILDINGS.fountain.mood.amount).toBeGreaterThan(BUILDINGS.flowerBed.mood.amount);
    expect(BUILDINGS.adamStatue.mood.amount).toBeGreaterThan(BUILDINGS.fountain.mood.amount);
    expect(BUILDINGS.fountain.unlockExplored).toBeGreaterThan(0);
    expect(BUILDINGS.adamStatue.unlockObjective).toBeGreaterThan(0);
  });
});

describe('décorations : le moral', () => {
  const spot = (x: number, y: number, amount: number, radius: number): DecorSpot => ({ x: x * TILE_SIZE, y: y * TILE_SIZE, amount, radius });

  it('ajoute le bonus de chaque décoration à portée, et rien au-delà', () => {
    const spots = [spot(0, 0, 1, 4), spot(0, 0, 2, 6)];

    expect(decorMoodAt(0, 0, spots)).toBe(3);
    expect(decorMoodAt(5 * TILE_SIZE, 0, spots)).toBe(2);
    expect(decorMoodAt(7 * TILE_SIZE, 0, spots)).toBe(0);
  });

  it('plafonne à DECOR.maxPerDawn : un champ de parterres ne suffit pas', () => {
    const spots = Array.from({ length: 20 }, () => spot(0, 0, 3, 8));

    expect(decorMoodAt(0, 0, spots)).toBe(DECOR.maxPerDawn);
  });

  it('une décoration posée près des ouvriers les rend plus heureux à l’aube', () => {
    const bare = dawnHappiness(withHall());
    const world = withHall();

    withDecor(world, 'flowerBed');

    const decorated = dawnHappiness(world);

    expect(decorated).toHaveLength(bare.length);
    expect(Math.max(...decorated)).toBeGreaterThan(Math.max(...bare));
    for (const [index, happiness] of decorated.entries()) expect(happiness).toBeGreaterThanOrEqual(bare[index]!);
  });

  it('une décoration retirée ne donne plus rien', () => {
    const world = withHall();

    withDecor(world, 'bench');

    const bench = [...world.entities.values()].find((entity) => entity.proto === 'bench')!;
    const stock = world.townStock()!.count('wood');

    world.push({ type: 'removeDecor', id: bench.id });
    world.tick();

    expect(world.entities.has(bench.id)).toBe(false);
    expect(world.townStock()!.count('wood')).toBe(stock + BUILDINGS.bench.cost.wood);
    expect(dawnHappiness(world)).toEqual(dawnHappiness(withHall()));
  });

  it('seule une décoration se retire : la mairie reste', () => {
    const world = withHall();

    world.push({ type: 'removeDecor', id: world.townHallId });
    world.tick();
    expect(world.entities.has(world.townHallId)).toBe(true);
  });
});

describe('décorations : le déblocage', () => {
  it('les parterres et les bancs attendent les trois nuits, la fontaine l’exploration', () => {
    const world = withHall();

    expect(world.isUnlocked('flowerBed')).toBe(false);
    expect(world.isUnlocked('streetLamp')).toBe(false);
    expect(world.isUnlocked('fountain')).toBe(false);
    expect(world.isUnlocked('adamStatue')).toBe(false);

    world.objective = 6;
    expect(world.isUnlocked('flowerBed')).toBe(true);
    expect(world.isUnlocked('bench')).toBe(true);
    expect(world.isUnlocked('streetLamp')).toBe(true);
    expect(world.isUnlocked('adamStatue')).toBe(true);
    expect(world.isUnlocked('fountain')).toBe(false);

    world.fog.reveal(world.player.x / TILE_SIZE, world.player.y / TILE_SIZE, 20);
    world.tick();
    expect(world.isUnlocked('fountain')).toBe(world.fog.exploredCount() >= BUILDINGS.fountain.unlockExplored);
  });

  it('une décoration posée se sauvegarde et se recharge', () => {
    const world = withHall();

    withDecor(world, 'streetLamp');

    const lamp = [...world.entities.values()].find((entity) => entity.proto === 'streetLamp')!;
    const copy = decodeSave(encodeSave(world, 0));

    if (!copy.ok) throw new Error(copy.reason);
    expect(copy.world.entities.get(lamp.id)).toMatchObject({ kind: 'decor', proto: 'streetLamp', tx: lamp.tx, ty: lamp.ty });
  });
});

describe('niveaux : les bonus', () => {
  it('la mairie étend son rayon, la maison ses lits, la carrière et la foreuse leur cadence', () => {
    expect(logisticRadiusOf('townHall', 1)).toBe(BUILDINGS.townHall.logisticRadius);
    expect(logisticRadiusOf('townHall', 2)).toBeGreaterThan(logisticRadiusOf('townHall', 1));
    expect(logisticRadiusOf('townHall', 3)).toBeGreaterThan(logisticRadiusOf('townHall', 2));
    expect(bedsOf('home', 1)).toBe(4);
    expect(bedsOf('home', 3)).toBeGreaterThan(bedsOf('home', 2));
    for (const id of ['quarry', 'drill'] as const) {
      expect(speedOf(id, 1)).toBe(1);
      expect(speedOf(id, 2)).toBeLessThan(1);
      expect(speedOf(id, 3)).toBeLessThan(speedOf(id, 2));
    }
  });

  it('un niveau ne reprend jamais moins de points de vie, et le troisième attend la maçonnerie', () => {
    for (const id of ['townHall', 'home', 'quarry', 'drill'] as const) {
      expect(BUILDINGS[id].upgrades).toHaveLength(2);
      expect(BUILDINGS[id].upgrades[0]).not.toHaveProperty('research');
      expect(BUILDINGS[id].upgrades[1]).toMatchObject({ research: 'masonry' });
    }
  });

  it('améliorer la mairie élargit le rayon logistique ; le niveau 3 attend la recherche', () => {
    const world = withHall();
    const hall = world.entities.get(world.townHallId)!;

    if (hall.kind === 'site') throw new Error('mairie en chantier');
    for (const [item, amount] of Object.entries({ wood: 100, stone: 100, ironPlate: 20 }) as [ItemId, number][]) world.townStock()!.add(item, amount);

    world.push({ type: 'upgradeBuilding', id: hall.id });
    world.tick();
    expect(hall.level).toBe(2);
    expect(logisticRadiusOf('townHall', hall.level)).toBe(13);

    expect(world.upgradeLocked(hall)).toBe('masonry');
    world.push({ type: 'upgradeBuilding', id: hall.id });
    world.tick();
    expect(hall.level).toBe(2);

    world.researchDone.push('masonry');
    expect(world.upgradeLocked(hall)).toBeNull();
    world.push({ type: 'upgradeBuilding', id: hall.id });
    world.tick();
    expect(hall.level).toBe(3);
  });

  it('un bâtiment amélioré garde son niveau au rechargement ; une sauvegarde sans niveau charge le niveau 1', () => {
    const world = withHall();
    const hall = world.entities.get(world.townHallId)!;

    if (hall.kind === 'site') throw new Error('mairie en chantier');
    for (const [item, amount] of Object.entries({ wood: 40, stone: 40 }) as [ItemId, number][]) world.townStock()!.add(item, amount);
    world.push({ type: 'upgradeBuilding', id: hall.id });
    world.tick();
    expect(hall.level).toBe(2);

    const text = encodeSave(world, 0);
    const kept = decodeSave(text);

    if (!kept.ok) throw new Error(kept.reason);
    expect(kept.world.entities.get(hall.id)).toMatchObject({ level: 2 });

    const file = JSON.parse(text) as { state: { entities: Record<string, unknown>[] } };

    for (const entity of file.state.entities) delete entity['level'];

    const old = decodeSave(JSON.stringify(file));

    if (!old.ok) throw new Error(old.reason);
    expect(old.world.entities.get(hall.id)).toMatchObject({ level: 1 });
  });
});
