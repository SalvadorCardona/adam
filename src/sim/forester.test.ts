import { describe, expect, it } from 'vitest';
import { TILE_SIZE, coordKey } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { COLONY } from '../data/inhabitants.ts';
import { RESOURCES, SAPLING } from '../data/resources.ts';
import { FORESTERS } from '../data/workers.ts';
import { countPlot, plotTiles } from './forester.ts';
import { treesInRange } from './lumberjacks.ts';
import { decodeSave, encodeSave, type SavedEntity } from './save.ts';
import { isWalkable, terrainAt } from './terrain.ts';
import type { Forester, ForesterHouse, LumberCamp } from './types.ts';
import { World } from './world.ts';

interface Spot {
  seed: number;
  hall: { tx: number; ty: number };
  /** Une emprise de 2 × 2 dont le carré est presque tout en herbe nue. */
  house: { tx: number; ty: number };
}

/**
 * Une seed où, près de la mairie, une maison du forestier a un carré d'au
 * moins vingt cases libres, sans eau entre la porte et le carré.
 */
function plotSpot(): Spot {
  for (let seed = 1; seed < 300; seed += 1) {
    const world = new World(seed);
    const site = world.entities.get(world.townHallId)!;
    const hall = { tx: site.tx, ty: site.ty };

    for (let dy = -12; dy <= 12; dy += 1) {
      for (let dx = -12; dx <= 12; dx += 1) {
        const house = { tx: hall.tx + dx, ty: hall.ty + dy };
        const box = { ...house, width: 2, height: 2 };
        const half = Math.ceil(FORESTERS.plot / 2) + 1;

        // Le carré ne touche pas la mairie.
        if (Math.abs(house.tx - hall.tx) < half + 3 && Math.abs(house.ty - hall.ty) < half + 3) continue;
        if (world.canPlace('foresterHouse', house.tx, house.ty) !== null) continue;

        let dry = true;

        for (const { tx, ty } of plotTiles(box)) dry &&= isWalkable(terrainAt(seed, tx, ty));
        if (!dry) continue;
        if (countPlot(world.forestPlot(box)).free >= 20) return { seed, hall, house };
      }
    }
  }
  throw new Error('aucune clairière — la génération de terrain a changé');
}

const SPOT = plotSpot();

/** La mairie finie et la maison du forestier, `staff` ouvriers voulus ; le forestier s'installe au chargement. */
function colony(staff: number = BUILDINGS.foresterHouse.workers): World {
  const world = new World(SPOT.seed);
  const state = world.snapshot();
  const houseId = state.nextId;
  const entities: SavedEntity[] = [
    { kind: 'townHall', id: world.townHallId, proto: 'townHall', ...SPOT.hall, width: 3, height: 3, store: {}, hp: BUILDINGS.townHall.hp, level: 1, paused: false, staff: BUILDINGS.townHall.workers },
    { kind: 'foresterHouse', id: houseId, proto: 'foresterHouse', ...SPOT.house, width: 2, height: 2, store: {}, hp: BUILDINGS.foresterHouse.hp, level: 1, paused: false, staff },
  ];

  // Adam loin, immobile : c'est le forestier qu'on regarde.
  state.player = { ...state.player, x: (SPOT.hall.tx - 40) * TILE_SIZE, y: (SPOT.hall.ty - 40) * TILE_SIZE };
  state.entities = entities;
  state.nextId = houseId + 1;
  state.mobiles = [];
  return World.restore(state);
}

function houseOf(world: World): ForesterHouse {
  const house = [...world.entities.values()].find((entity): entity is ForesterHouse => entity.kind === 'foresterHouse');

  if (!house) throw new Error('pas de maison du forestier');
  return house;
}

function foresters(world: World): Forester[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Forester => mobile.kind === 'forester');
}

function run(world: World, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i += 1) {
    world.tick();
    each?.();
  }
}

/** Abat l'arbre de la tuile jusqu'au bout, comme le ferait une hache. */
function fell(world: World, tx: number, ty: number): void {
  for (let i = 0; i < RESOURCES.tree.amount; i += 1) world.resources.take(tx, ty);
}

describe('maison du forestier', () => {
  it('loge un forestier, pris parmi les ouvriers de la colonie', () => {
    const world = colony();

    expect(foresters(world)).toHaveLength(BUILDINGS.foresterHouse.workers);
    expect(foresters(world)[0]!.homeId).toBe(houseOf(world).id);
    expect(world.population().workers).toBe(COLONY.startingWorkers);
  });

  it('remplit le carré pousse par pousse, rang par rang, dans l’ordre', () => {
    const world = colony();
    const house = houseOf(world);
    const order = world
      .forestPlot(house)
      .filter((tile) => tile.state === 'free')
      .map((tile) => coordKey(tile.tx, tile.ty));
    const planted: string[] = [];

    world.events.on('treePlanted', ({ tx, ty }) => planted.push(coordKey(tx, ty)));
    run(world, 2000);

    expect(planted.length).toBeGreaterThanOrEqual(10);
    // Une à une, dans l'ordre des cases libres : le carré se remplit ligne par ligne.
    expect(planted).toEqual(order.slice(0, planted.length));
    for (const key of planted) {
      const [tx, ty] = key.split(',').map(Number) as [number, number];

      expect(world.resources.isPlanted(tx, ty)).toBe(true);
      // Une pousse n'est pas encore un arbre : ni coupée, ni solide.
      expect(world.resources.at(tx, ty)).toBeNull();
      expect(world.isSolid(tx, ty)).toBe(false);
    }
  }, 30_000);

  it('finit le carré, puis ses pousses grandissent jusqu’à des arbres à couper', () => {
    const world = colony();
    const house = houseOf(world);
    const free = countPlot(world.forestPlot(house)).free;
    const stages = new Map<string, string[]>();

    run(world, 6000, () => {
      if (world.tickCount % SAPLING.passTicks !== 1) return;
      for (const tile of world.forestPlot(house)) {
        if (tile.state !== 'sapling' && tile.state !== 'tree') continue;

        const key = coordKey(tile.tx, tile.ty);
        const stage = world.resources.sapling(tile.tx, tile.ty) ?? 'tree';
        const seen = stages.get(key) ?? [];

        if (seen.at(-1) !== stage) stages.set(key, [...seen, stage]);
      }
    });

    run(world, SAPLING.adultTicks);

    const count = countPlot(world.forestPlot(house));

    expect(count.free).toBe(0);
    expect(count.saplings).toBe(0);
    expect(count.trees).toBe(free);
    // La première pousse a vu les trois stades, dans l'ordre.
    expect([...stages.values()][0]).toEqual(['sprout', 'young', 'tree']);
    // Adulte, c'est un arbre comme un autre : solide, et la hache le trouve.
    const tree = world.forestPlot(house).find((tile) => tile.state === 'tree')!;

    expect(world.resources.at(tree.tx, tree.ty)?.id).toBe('tree');
    expect(world.isSolid(tree.tx, tree.ty)).toBe(true);
  }, 60_000);

  it('les bûcherons ne visent que les arbres adultes, jamais une pousse', () => {
    const world = colony();
    const house = houseOf(world);

    run(world, 2000);

    const planted = world.forestPlot(house).filter((tile) => tile.state === 'sapling');
    const probe = { ...house, kind: 'lumberCamp', proto: 'lumberCamp' } as unknown as LumberCamp;
    const targets = new Set(treesInRange(probe, world.resources).map((tree) => coordKey(tree.tx, tree.ty)));

    expect(planted.length).toBeGreaterThan(0);
    for (const tile of planted) expect(targets.has(coordKey(tile.tx, tile.ty))).toBe(false);
  }, 30_000);

  it('replante la case d’un arbre abattu : la forêt se renouvelle', () => {
    const world = colony();
    const house = houseOf(world);

    // Un carré déjà adulte, planté il y a longtemps.
    for (const tile of world.forestPlot(house)) {
      if (tile.state === 'free') world.resources.plant(tile.tx, tile.ty, world.tickCount - SAPLING.adultTicks);
    }
    run(world, SAPLING.passTicks);
    expect(countPlot(world.forestPlot(house)).free).toBe(0);

    const tree = world.forestPlot(house).find((tile) => tile.state === 'tree')!;

    fell(world, tree.tx, tree.ty);
    expect(world.resources.isPlanted(tree.tx, tree.ty)).toBe(false);
    expect(world.forestPlot(house).find((tile) => tile.tx === tree.tx && tile.ty === tree.ty)?.state).toBe('free');

    const replanted: string[] = [];

    world.events.on('treePlanted', ({ tx, ty }) => replanted.push(coordKey(tx, ty)));
    run(world, 1000);

    expect(replanted).toEqual([coordKey(tree.tx, tree.ty)]);
    expect(world.resources.sapling(tree.tx, tree.ty)).toBe('sprout');
  }, 30_000);

  it('sans ouvrier, rien ne se plante', () => {
    const world = colony(0);
    let planted = 0;

    world.events.on('treePlanted', () => (planted += 1));
    run(world, 2000);

    expect(planted).toBe(0);
    expect(foresters(world).every((forester) => forester.state === 'idle')).toBe(true);
  }, 30_000);

  it('en pause, il pose sa bêche', () => {
    const world = colony();
    let planted = 0;

    world.push({ type: 'pauseBuilding', id: houseOf(world).id, paused: true });
    world.events.on('treePlanted', () => (planted += 1));
    run(world, 2000);

    expect(planted).toBe(0);
  }, 30_000);

  it('ne plante ni sur l’eau, ni sous le bâti', () => {
    const world = colony();
    const house = houseOf(world);

    run(world, 6000);

    for (const tile of world.forestPlot(house)) {
      if (!world.resources.isPlanted(tile.tx, tile.ty)) continue;
      expect(terrainAt(world.seed, tile.tx, tile.ty)).toBe('grass');
      expect(world.chunks.occupantAt(tile.tx, tile.ty)).toBeUndefined();
    }
    // L'emprise de la maison n'est pas dans son carré.
    expect(plotTiles(house).some((tile) => tile.tx === house.tx && tile.ty === house.ty)).toBe(false);
  }, 30_000);

  it('sauvegarde les pousses et leur stade', () => {
    const world = colony();
    const house = houseOf(world);

    run(world, 2000);

    const reloaded = decodeSave(encodeSave(world, 1));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);

    const copy = reloaded.world;

    expect(copy.forestPlot(house)).toEqual(world.forestPlot(house));
    for (const tile of world.forestPlot(house)) {
      expect(copy.resources.sapling(tile.tx, tile.ty)).toBe(world.resources.sapling(tile.tx, tile.ty));
    }
    // Le temps continue de passer pour elles après le chargement.
    run(copy, SAPLING.adultTicks);
    expect(countPlot(copy.forestPlot(house)).trees).toBeGreaterThan(0);
  }, 30_000);

  it('charge une sauvegarde d’avant le forestier, sans arbre planté', () => {
    const world = colony();
    const file = JSON.parse(encodeSave(world, 1)) as { state: Record<string, unknown> };

    delete file.state['planted'];

    const reloaded = decodeSave(JSON.stringify(file));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);
    expect(countPlot(reloaded.world.forestPlot(houseOf(reloaded.world))).saplings).toBe(0);
  });
});
