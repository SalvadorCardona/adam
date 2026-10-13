import { describe, expect, it } from 'vitest';
import { TILE_SIZE, coordKey } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { COLONY } from '../data/inhabitants.ts';
import { CROPS } from '../data/resources.ts';
import { FARMERS } from '../data/workers.ts';
import { countField, fieldTiles } from './farmer.ts';
import { decodeSave, encodeSave, type SavedEntity } from './save.ts';
import { isWalkable, oreAt, terrainAt } from './terrain.ts';
import type { Farm, Farmer } from './types.ts';
import { World } from './world.ts';

interface Spot {
  seed: number;
  hall: { tx: number; ty: number };
  /** Une emprise de 2 × 2 dont le champ est presque tout en herbe nue. */
  farm: { tx: number; ty: number };
}

/**
 * Une seed où, près de la mairie, une ferme a un champ d'au moins vingt
 * cases libres, sans eau entre la porte et le champ.
 */
function fieldSpot(): Spot {
  for (let seed = 1; seed < 300; seed += 1) {
    const world = new World(seed);
    const site = world.entities.get(world.townHallId)!;
    const hall = { tx: site.tx, ty: site.ty };

    for (let dy = -12; dy <= 12; dy += 1) {
      for (let dx = -12; dx <= 12; dx += 1) {
        const farm = { tx: hall.tx + dx, ty: hall.ty + dy };
        const box = { ...farm, width: 2, height: 2 };
        const half = Math.ceil(FARMERS.plot / 2) + 1;

        // Le champ ne touche pas la mairie.
        if (Math.abs(farm.tx - hall.tx) < half + 3 && Math.abs(farm.ty - hall.ty) < half + 3) continue;
        if (world.canPlace('farm', farm.tx, farm.ty) !== null) continue;

        let dry = true;

        for (const { tx, ty } of fieldTiles(box)) dry &&= isWalkable(terrainAt(seed, tx, ty));
        if (!dry) continue;
        if (countField(world.farmField(box)).free >= 20) return { seed, hall, farm };
      }
    }
  }
  throw new Error('aucune clairière — la génération de terrain a changé');
}

const SPOT = fieldSpot();

/** La mairie finie et la ferme, `staff` fermiers voulus, `store` dans son coffre ; les fermiers s'installent au chargement. */
function colony(staff: number = BUILDINGS.farm.workers, store: SavedEntity extends infer E ? (E extends { store: infer S } ? S : never) : never = {}): World {
  const world = new World(SPOT.seed);
  const state = world.snapshot();
  const farmId = state.nextId;
  const entities: SavedEntity[] = [
    { kind: 'townHall', id: world.townHallId, proto: 'townHall', ...SPOT.hall, width: 3, height: 3, store: { food: 40, water: 40 }, hp: BUILDINGS.townHall.hp, level: 1, paused: false, staff: BUILDINGS.townHall.workers },
    { kind: 'farm', id: farmId, proto: 'farm', ...SPOT.farm, width: 2, height: 2, store, hp: BUILDINGS.farm.hp, level: 1, paused: false, staff },
  ];

  // Adam loin, immobile : ce sont les fermiers qu'on regarde.
  state.player = { ...state.player, x: (SPOT.hall.tx - 40) * TILE_SIZE, y: (SPOT.hall.ty - 40) * TILE_SIZE };
  state.entities = entities;
  state.nextId = farmId + 1;
  state.mobiles = [];
  return World.restore(state);
}

function farmOf(world: World): Farm {
  const farm = [...world.entities.values()].find((entity): entity is Farm => entity.kind === 'farm');

  if (!farm) throw new Error('pas de ferme');
  return farm;
}

function farmers(world: World): Farmer[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Farmer => mobile.kind === 'farmer');
}

function run(world: World, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i += 1) {
    world.tick();
    each?.();
  }
}

/** Sème d'avance tout le champ libre, mûr depuis longtemps. */
function ripenField(world: World, farm: Farm): void {
  for (const tile of world.farmField(farm)) {
    if (tile.state === 'free') world.resources.sow(tile.tx, tile.ty, world.tickCount - CROPS.ripeTicks);
  }
  run(world, 20);
}

describe('ferme et fermiers', () => {
  it('loge ses fermiers, pris parmi les ouvriers de la colonie, dans la population', () => {
    const world = colony();

    expect(farmers(world)).toHaveLength(BUILDINGS.farm.workers);
    expect(farmers(world).every((farmer) => farmer.homeId === farmOf(world).id)).toBe(true);
    expect(world.population().workers).toBe(COLONY.startingWorkers);
    expect(world.workforce()).toMatchObject({ assigned: BUILDINGS.farm.workers });
  });

  it('ne cultive que l’herbe nue : ni eau, ni sable, ni bâti, ni filon, ni arbre', () => {
    const world = colony();
    const farm = farmOf(world);
    run(world, 4000);

    for (const tile of world.farmField(farm)) {
      if (tile.state === 'blocked' || tile.state === 'free') continue;
      expect(terrainAt(world.seed, tile.tx, tile.ty)).toBe('grass');
      expect(oreAt(world.seed, tile.tx, tile.ty)).toBeNull();
      expect(world.chunks.occupantAt(tile.tx, tile.ty)).toBeUndefined();
    }
    // L'emprise de la ferme n'est pas dans son champ.
    expect(fieldTiles(farm).some((tile) => tile.tx === farm.tx && tile.ty === farm.ty)).toBe(false);
    // Une culture n'arrête personne et ne se récolte pas comme un arbre.
    const sown = world.farmField(farm).find((tile) => tile.state !== 'free' && tile.state !== 'blocked')!;

    expect(world.isSolid(sown.tx, sown.ty)).toBe(false);
    expect(world.resources.at(sown.tx, sown.ty)).toBeNull();
  }, 30_000);

  it('sème case par case, rang par rang, dans l’ordre du champ', () => {
    const world = colony();
    const farm = farmOf(world);
    const order = world
      .farmField(farm)
      .filter((tile) => tile.state === 'free')
      .map((tile) => coordKey(tile.tx, tile.ty));
    const sown: string[] = [];

    world.events.on('cropSown', ({ tx, ty }) => sown.push(coordKey(tx, ty)));
    run(world, 1200);

    expect(sown.length).toBeGreaterThanOrEqual(10);
    // Plusieurs fermiers : chacun prend la première case libre que personne ne vise — le champ se remplit dans l'ordre.
    expect([...sown].sort()).toEqual(order.slice(0, sown.length).sort());
    expect(new Set(sown).size).toBe(sown.length);
  }, 30_000);

  it('semis, pousse, mûre ; récoltée, le blé entre au coffre, et la case est ressemée', () => {
    const world = colony(1);
    const farm = farmOf(world);
    const first = world.farmField(farm).find((tile) => tile.state === 'free')!;
    const key = coordKey(first.tx, first.ty);
    const stages: string[] = [];
    const events: string[] = [];

    world.events.on('cropSown', ({ tx, ty }) => coordKey(tx, ty) === key && events.push('sown'));
    world.events.on('cropHarvested', ({ tx, ty }) => coordKey(tx, ty) === key && events.push('harvested'));
    world.events.on('farmProduced', () => events.push(`stored:${farm.store.count('wheat')}`));

    run(world, CROPS.ripeTicks + 3000, () => {
      const stage = world.resources.crop(first.tx, first.ty) ?? 'free';

      if (stages.at(-1) !== stage) stages.push(stage);
    });

    expect(stages.slice(0, 5)).toEqual(['free', 'sown', 'growing', 'ripe', 'free']);
    expect(events.slice(0, 4)).toEqual(['sown', 'harvested', `stored:${CROPS.yield}`, 'sown']);
    expect(world.resources.crop(first.tx, first.ty)).not.toBeNull();
  }, 60_000);

  it('deux fermiers ne travaillent jamais la même case', () => {
    const world = colony();
    const farm = farmOf(world);
    let busiest = 0;

    ripenField(world, farm);
    run(world, 3000, () => {
      const plots = farmers(world).flatMap((farmer) => (farmer.plot ? [coordKey(farmer.plot.tx, farmer.plot.ty)] : []));

      busiest = Math.max(busiest, plots.length);
      expect(new Set(plots).size).toBe(plots.length);
    });
    // Ils ont bien travaillé ensemble.
    expect(busiest).toBeGreaterThan(1);
  }, 60_000);

  it('aucun blé sans récolte : le coffre ne monte que de ce qui est récolté', () => {
    const world = colony();
    const farm = farmOf(world);
    let harvested = 0;

    world.events.on('cropHarvested', ({ amount }) => (harvested += amount));
    run(world, CROPS.ripeTicks - 100);
    // Rien n'est encore mûr : rien au coffre.
    expect(farm.store.count('wheat')).toBe(0);
    expect(harvested).toBe(0);

    run(world, 3000);
    expect(harvested).toBeGreaterThan(0);
    // Ce qui est au coffre a été récolté ; le reste est dans les paniers, en route.
    const carried = farmers(world).reduce((sum, farmer) => sum + (farmer.state === 'toFarm' ? farmer.load : 0), 0);

    expect(farm.store.count('wheat') + carried).toBe(harvested);
  }, 60_000);

  it('un champ plein produit autant que l’ancienne ferme au complet', () => {
    const world = colony();
    const farm = farmOf(world);
    const minutes = 10;
    let produced = 0;

    ripenField(world, farm);
    // Le premier passage vide le champ mûr : on mesure ensuite le régime établi.
    run(world, CROPS.ripeTicks);
    world.events.on('cropHarvested', ({ amount }) => (produced += amount));
    run(world, minutes * 60 * 20, () => {
      // Le coffre se vide comme si les porteurs passaient.
      if (farm.store.count('wheat') > 20) world.withdraw(farm.id, 'wheat', 20);
    });

    const perMinute = produced / minutes;
    const free = countField(world.farmField(farm));
    const field = free.free + free.growing + free.ripe;

    // L'ancienne ferme : 4 nourritures toutes les 30 s, 8 par minute, à quatre ouvriers.
    expect(field).toBeGreaterThanOrEqual(20);
    expect(perMinute).toBeGreaterThan((field / 30) * 6);
    expect(perMinute).toBeLessThan((field / 30) * 10);
  }, 120_000);

  it('coffre plein : les cultures mûres attendent, l’alerte paraît ; vidé, la récolte reprend', () => {
    const world = colony(BUILDINGS.farm.workers, { wheat: BUILDINGS.farm.storage });
    const farm = farmOf(world);
    let harvested = 0;

    world.events.on('cropHarvested', () => (harvested += 1));
    ripenField(world, farm);
    run(world, 600);

    expect(harvested).toBe(0);
    expect(world.problem(farm)).toBe('storeFull');
    expect(farmers(world).some((farmer) => farmer.state === 'wait')).toBe(true);

    world.withdraw(farm.id, 'wheat', BUILDINGS.farm.storage);
    run(world, 600);
    expect(harvested).toBeGreaterThan(0);
    expect(farm.store.total()).toBeLessThanOrEqual(farm.store.capacity);
  }, 30_000);

  it('en pause, ou sans fermier, rien ne se sème ni ne se récolte', () => {
    const paused = colony();
    const idle = colony(0);
    let work = 0;

    paused.push({ type: 'pauseBuilding', id: farmOf(paused).id, paused: true });
    for (const world of [paused, idle]) {
      world.events.on('cropSown', () => (work += 1));
      world.events.on('cropHarvested', () => (work += 1));
      run(world, 2000);
    }

    expect(work).toBe(0);
    expect(farmers(idle)).toHaveLength(0);
    expect(idle.stopped(farmOf(idle))).toBe(true);
    expect(farmers(paused).every((farmer) => farmer.state === 'idle')).toBe(true);
  }, 30_000);

  it('la nuit, les fermiers rentrent dormir ; les cultures poussent encore', () => {
    const world = colony();
    const farm = farmOf(world);

    run(world, 600);

    const sown = world.farmField(farm).find((tile) => tile.state === 'sown')!;
    let asleep = 0;

    // Le crépuscule dans un instant, puis la nuit : la mairie debout, le cycle tourne.
    world.cycleStartTick = world.tickCount - DAY_CYCLE.day + 20;
    run(world, DAY_CYCLE.dusk + DAY_CYCLE.night - 40, () => {
      if (world.clock()?.phase === 'night' && farmers(world).every((farmer) => farmer.inside || farmer.sleepingOut)) asleep += 1;
    });

    // Couchés presque toute la nuit, sans semer ni récolter.
    expect(asleep).toBeGreaterThan(DAY_CYCLE.night / 2);
    // La culture, elle, a poussé pendant leur sommeil.
    expect(world.resources.crop(sown.tx, sown.ty)).toBe('growing');
  }, 60_000);

  it('sauvegarde les cultures, leur stade, les fermiers et la place réservée au coffre', () => {
    const world = colony();
    const farm = farmOf(world);

    ripenField(world, farm);
    run(world, 300);

    const reloaded = decodeSave(encodeSave(world, 1));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);

    const copy = reloaded.world;
    const copyFarm = farmOf(copy);

    expect(copy.farmField(copyFarm)).toEqual(world.farmField(farm));
    expect(farmers(copy)).toEqual(farmers(world));
    expect(copyFarm.store.freeSpace()).toBe(farm.store.freeSpace());

    // La suite est la même partie.
    run(world, 500);
    run(copy, 500);
    expect(copy.farmField(copyFarm)).toEqual(world.farmField(farm));
    expect(copyFarm.store.count('wheat')).toBe(farm.store.count('wheat'));
  }, 30_000);

  it('charge une sauvegarde d’avant les fermiers : champ vide, la ferme recommence à semer', () => {
    const world = colony();
    const file = JSON.parse(encodeSave(world, 1)) as { state: Record<string, unknown> };
    const state = file.state as { crops?: unknown; mobiles: Record<string, unknown>[]; entities: Record<string, unknown>[] };

    // Avant : pas de cultures, la ferme « bloquée » ou non, ses ouvriers entrés dedans — invisibles.
    delete state.crops;
    state.mobiles = state.mobiles.filter((mobile) => mobile['kind'] !== 'farmer');
    for (const entity of state.entities) if (entity['kind'] === 'farm') entity['blocked'] = true;

    const reloaded = decodeSave(JSON.stringify(file));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);

    const loaded = reloaded.world;
    const farm = farmOf(loaded);
    let sown = 0;

    expect(countField(loaded.farmField(farm))).toMatchObject({ growing: 0, ripe: 0 });
    loaded.events.on('cropSown', () => (sown += 1));
    run(loaded, 1000);
    expect(farmers(loaded)).toHaveLength(BUILDINGS.farm.workers);
    expect(loaded.population().workers).toBe(COLONY.startingWorkers);
    expect(sown).toBeGreaterThan(0);
  }, 30_000);

  it('est déterministe : même seed, mêmes ticks, même champ', () => {
    const a = colony();
    const b = colony();

    run(a, 5000);
    run(b, 5000);
    expect(a.farmField(farmOf(a))).toEqual(b.farmField(farmOf(b)));
    expect(farmers(a)).toEqual(farmers(b));
    expect(encodeSave(a, 1)).toBe(encodeSave(b, 1));
  }, 60_000);
});
