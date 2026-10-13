import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { COLONY } from '../data/inhabitants.ts';
import { unlockingResearch } from './research.ts';
import { ENEMIES } from '../data/enemies.ts';
import { ITEM_IDS, type ItemId } from '../data/items.ts';
import { HUNTING, NEEDS } from '../data/needs.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { RECIPES } from '../data/recipes.ts';
import { CROPS } from '../data/resources.ts';
import { JOB_PRIORITY, WANDER } from '../data/workers.ts';
import { doorOf } from './jobs.ts';
import { baseCenter } from './enemyBases.ts';
import { decodeSave, encodeSave, type SavedEntity } from './save.ts';
import { isWalkable, terrainAt } from './terrain.ts';
import type { EntityId, Forge, Site, TownHall, Worker } from './types.ts';
import { clearLine } from './workers.ts';
import { TICKS_PER_SECOND, World } from './world.ts';

type Stock = Partial<Record<ItemId, number>>;

interface Layout {
  /** Stock de départ de la mairie, déjà finie. */
  hall: Stock;
  houses: number;
  /** Chantiers à ouvrir, dans l'ordre. */
  sites?: BuildingId[];
  /** Foreuses finies, coffre déjà garni. */
  drills?: Stock[];
  /** Forges finies, coffre déjà garni, posées au plus près de la mairie — dans son rayon. */
  forges?: Stock[];
  /** Fours à charbon finis, coffre déjà garni, posés près de la mairie, après les forges. */
  kilns?: Stock[];
  /** Grills finis, coffre déjà garni, posés près de la mairie, après les fours. */
  grills?: Stock[];
  /** Boulangeries finies, coffre déjà garni, posées près de la mairie, après les grills. */
  bakeries?: Stock[];
  /** Nurseries finies, affamées : l'heure de la naissance est passée. */
  nurseries?: Stock[];
}

/** Les emplacements libres d'une colonie de test, en tuiles relatives à la mairie : une grille de 2 × 2 espacés. */
const SLOTS: [number, number][] = [];

for (let row = 0; row < 5; row += 1) {
  for (let col = 0; col < 8; col += 1) {
    const dx = -12 + col * 3;
    const dy = 5 + row * 3;

    SLOTS.push([dx, dy]);
  }
}

/** Une seed dont la mairie a une grande plaine sans eau au sud : les porteurs y vont partout en ligne droite. */
function landSeed(): { world: World; hx: number; hy: number } {
  for (let seed = 1; seed < 400; seed += 1) {
    const world = new World(seed);
    const hall = world.entities.get(world.townHallId)!;
    let dry = true;

    for (let ty = hall.ty - 1; ty < hall.ty + 22 && dry; ty += 1) {
      for (let tx = hall.tx - 14; tx < hall.tx + 14 && dry; tx += 1) {
        if (!isWalkable(terrainAt(world.seed, tx, ty))) dry = false;
      }
    }
    if (dry) return { world, hx: hall.tx, hy: hall.ty };
  }
  throw new Error('aucune seed testable — la génération de terrain a changé');
}

/** La distance de la tuile à la base mutante la plus proche, en tuiles. */
function awayFromBases(world: World, tx: number, ty: number): number {
  return Math.min(...world.enemyBases.map((base) => Math.hypot(baseCenter(base).x / TILE_SIZE - tx, baseCenter(base).y / TILE_SIZE - ty)));
}

/**
 * Une colonie posée d'un coup : on retouche la sauvegarde d'un monde neuf,
 * puis on la recharge — les maisons se peuplent au chargement.
 */
function colony(layout: Layout): World {
  const { world, hx, hy } = landSeed();
  const state = world.snapshot();
  const slots = [...SLOTS];
  const entities: SavedEntity[] = [
    { kind: 'townHall', id: world.townHallId, proto: 'townHall', tx: hx, ty: hy, width: 3, height: 3, store: layout.hall, hp: BUILDINGS.townHall.hp, level: 1, paused: false, staff: BUILDINGS.townHall.workers },
  ];
  let nextId = state.nextId;

  const place = (proto: BuildingId): { id: EntityId; proto: BuildingId; tx: number; ty: number; width: number; height: number } => {
    const [dx, dy] = slots.shift()!;
    const { width, height } = BUILDINGS[proto];

    return { id: nextId++, proto, tx: hx + dx, ty: hy + dy, width, height };
  };

  // Les consommateurs d'abord, sur les emplacements les plus proches de la mairie.
  const placeNear = (proto: BuildingId): ReturnType<typeof place> => {
    slots.sort(([ax, ay], [bx, by]) => Math.abs(ax) + ay - (Math.abs(bx) + by));
    return place(proto);
  };

  for (const store of layout.forges ?? []) {
    entities.push({ ...placeNear('forge'), kind: 'forge', store, hp: BUILDINGS.forge.hp, level: 1, paused: false, staff: BUILDINGS.forge.workers, blocked: true });
  }
  for (const store of layout.kilns ?? []) {
    entities.push({
      ...placeNear('charcoalKiln'),
      kind: 'forge',
      store,
      hp: BUILDINGS.charcoalKiln.hp,
      level: 1,
      paused: false,
      staff: BUILDINGS.charcoalKiln.workers,
      blocked: true,
    });
  }
  for (const store of layout.grills ?? []) {
    entities.push({
      ...placeNear('grill'),
      kind: 'forge',
      store,
      hp: BUILDINGS.grill.hp,
      level: 1,
      paused: false,
      staff: BUILDINGS.grill.workers,
      blocked: true,
    });
  }
  for (const store of layout.bakeries ?? []) {
    entities.push({
      ...placeNear('bakery'),
      kind: 'forge',
      store,
      hp: BUILDINGS.bakery.hp,
      level: 1,
      paused: false,
      staff: BUILDINGS.bakery.workers,
      blocked: true,
    });
  }
  for (const store of layout.nurseries ?? []) {
    entities.push({
      ...placeNear('nursery'),
      kind: 'nursery',
      store,
      hp: BUILDINGS.nursery.hp,
      level: 1,
      paused: false,
      staff: BUILDINGS.nursery.workers,
      nextBirthTick: state.tick,
      born: 0,
      hungry: true,
    });
  }
  slots.sort(([ax, ay], [bx, by]) => ay - by || ax - bx);

  for (let i = 0; i < layout.houses; i += 1) {
    entities.push({ ...place('builderHouse'), kind: 'house', store: {}, hp: BUILDINGS.builderHouse.hp, level: 1, paused: false, staff: BUILDINGS.builderHouse.workers });
  }
  for (const proto of layout.sites ?? []) entities.push({ ...place(proto), kind: 'site', delivered: {}, work: 0 });
  for (const store of layout.drills ?? []) {
    entities.push({ ...place('drill'), kind: 'drill', store, hp: BUILDINGS.drill.hp, level: 1, paused: false, staff: BUILDINGS.drill.workers, output: 'ironOre', blocked: true });
  }

  // Adam à l'écart, immobile : ce sont les porteurs qu'on regarde. Loin de toute base mutante, dont les gardiens l'attaqueraient.
  const spots = [[-20, -20], [20, -20], [-20, 25], [20, 25], [0, -25]] as const;
  const [ax, ay] = spots.reduce((best, spot) => (awayFromBases(world, hx + spot[0], hy + spot[1]) > awayFromBases(world, hx + best[0], hy + best[1]) ? spot : best));

  state.player = { ...state.player, x: (hx + ax) * TILE_SIZE, y: (hy + ay) * TILE_SIZE };
  state.entities = entities;
  state.nextId = nextId;
  state.mobiles = [];

  const restored = World.restore(state);

  // Pas un arbre à sa portée : il ne récolte rien en restant là.
  for (let y = -6; y <= 6; y += 1) for (let x = -6; x <= 6; x += 1) restored.resources.clear(Math.floor(restored.player.x / TILE_SIZE) + x, Math.floor(restored.player.y / TILE_SIZE) + y);
  return restored;
}

function hallOf(world: World): TownHall {
  const hall = world.entities.get(world.townHallId);

  if (hall?.kind !== 'townHall') throw new Error('pas de mairie');
  return hall;
}

function sites(world: World): Site[] {
  return [...world.entities.values()].filter((entity): entity is Site => entity.kind === 'site');
}

function workers(world: World): Worker[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Worker => mobile.kind === 'worker' && !mobile.free);
}

/** Où se trouve chaque objet : mairie, foreuses, mains des porteurs, chantiers. Rien d'autre n'en crée ni n'en détruit ici. */
function census(world: World, built: ReadonlySet<EntityId> = new Set()): Record<ItemId, number> {
  const total = Object.fromEntries(ITEM_IDS.map((item) => [item, 0])) as Record<ItemId, number>;

  for (const entity of world.entities.values()) {
    if (entity.kind === 'site') {
      for (const [item, amount] of Object.entries(entity.delivered) as [ItemId, number][]) total[item] += amount;
    } else if (built.has(entity.id)) {
      // Un chantier achevé par son dernier objet : son coût est dans les murs.
      for (const [item, amount] of Object.entries(BUILDINGS[entity.proto].cost) as [ItemId, number][]) total[item] += amount;
    } else {
      for (const [item, amount] of entity.store.entries()) total[item] += amount;
    }
  }
  for (const worker of workers(world)) {
    if (worker.job?.carried) total[worker.job.item] += worker.job.amount;
  }
  return total;
}

/** Les promesses ne dépassent jamais ce qui existe, ni ce qui est attendu. */
function expectCoveredPromises(world: World): void {
  const hall = hallOf(world);
  const promisedOut = new Map<ItemId, number>();

  for (const worker of workers(world)) {
    const job = worker.job;

    if (job && !job.carried && job.from === hall.id) promisedOut.set(job.item, (promisedOut.get(job.item) ?? 0) + job.amount);
  }
  // Et la gorgée ou le repas qu'un habitant en route est venu prendre.
  for (const mobile of world.mobiles.values()) {
    if (!('meal' in mobile) || mobile.meal === null) continue;

    const { item, meal } = NEEDS[mobile.meal];

    promisedOut.set(item, (promisedOut.get(item) ?? 0) + meal);
  }

  for (const item of ITEM_IDS) {
    // Ce que la mairie a promis, c'est exactement ce que les porteurs en route vont chercher.
    expect(hall.store.available(item), `mairie : ${item} promis plus qu'en stock`).toBeGreaterThanOrEqual(0);
    expect(hall.store.count(item) - hall.store.available(item)).toBe(promisedOut.get(item) ?? 0);
  }

  for (const site of sites(world)) {
    for (const [item, needed] of Object.entries(BUILDINGS[site.proto].cost) as [ItemId, number][]) {
      const delivered = site.delivered[item] ?? 0;

      expect(delivered, `${site.proto} : ${item} livré en trop`).toBeLessThanOrEqual(needed);
      expect(delivered + world.siteIncoming(site.id, item), `${site.proto} : ${item} promis deux fois`).toBeLessThanOrEqual(needed);
    }
  }
}

/** À portée de flânerie de sa porte. */
function nearHome(world: World, worker: Worker): boolean {
  const door = doorOf(world.entities.get(worker.homeId)!);

  return Math.hypot(worker.x - door.x, worker.y - door.y) <= WANDER.radius * TILE_SIZE + 1;
}

function run(world: World, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i += 1) {
    world.tick();
    each?.();
  }
}

describe('porteurs', () => {
  it('la maison des constructeurs loge ses ouvriers ; sans rien à porter, ils flânent devant chez eux', () => {
    const world = colony({ hall: {}, houses: 1 });

    expect(workers(world)).toHaveLength(BUILDINGS.builderHouse.workers);

    let walked = 0;

    run(world, 600, () => {
      for (const worker of workers(world)) {
        expect(worker.job).toBeNull();
        if (worker.x !== worker.prevX || worker.y !== worker.prevY) walked += 1;
      }
    });
    // Visibles, à deux pas de leur porte, et ils bougent.
    expect(workers(world).every((worker) => !worker.inside && nearHome(world, worker))).toBe(true);
    expect(walked).toBeGreaterThan(0);
  });

  it('au crépuscule, les ouvriers sans travail rentrent dormir', () => {
    const world = colony({ hall: {}, houses: 1 });

    run(world, 200);
    expect(workers(world).some((worker) => !worker.inside)).toBe(true);

    // Le cycle démarre juste avant le crépuscule.
    world.cycleStartTick = world.tickCount - DAY_CYCLE.day + 1;
    run(world, 250);
    expect(workers(world).every((worker) => worker.inside)).toBe(true);
  });

  it('un chantier se remplit seul si la mairie a le stock — et le dernier objet porté l’achève', () => {
    const world = colony({ hall: { wood: 40, stone: 40 }, houses: 1, sites: ['farm'] });
    const [site] = sites(world);
    const completed: EntityId[] = [];

    world.events.on('buildingCompleted', ({ id }) => completed.push(id));

    run(world, 60);
    // Ils sont sortis porter.
    expect(workers(world).some((worker) => !worker.inside && worker.job !== null)).toBe(true);

    run(world, 3000);

    const current = world.entities.get(site!.id);

    expect(current?.kind).toBe('farm');
    expect(completed).toEqual([site!.id]);
    expect(hallOf(world).store.count('wood')).toBe(40 - BUILDINGS.farm.cost.wood);
    expect(hallOf(world).store.count('stone')).toBe(40 - BUILDINGS.farm.cost.stone);
    // Le travail fini, tout le monde revient flâner devant chez soi.
    run(world, 600);
    expect(workers(world).every((worker) => worker.job === null && nearHome(world, worker))).toBe(true);
  });

  it('sous charge — 10 ouvriers, 5 chantiers, un stock trop court : aucune double réservation, rien de perdu ni de dupliqué', () => {
    const world = colony({
      hall: { wood: 30, stone: 20, ironOre: 4 },
      houses: 3,
      sites: ['farm', 'nursery', 'watchtower', 'builderHouse', 'drill'],
    });

    // Trois maisons en logent douze : on en garde dix.
    for (const worker of workers(world).slice(10)) world.mobiles.delete(worker.id);
    expect(workers(world)).toHaveLength(10);

    const built = new Set<EntityId>();

    world.events.on('buildingCompleted', ({ id }) => built.add(id));

    // Les matériaux en jeu : une ferme achevée récolte, sa nourriture n'entre pas dans le compte.
    const materials = (): Stock => {
      const { wood, stone, ironOre } = census(world, built);

      return { wood, stone, ironOre };
    };
    const before = materials();
    let busiest = 0;

    run(world, 4000, () => {
      expect(materials()).toEqual(before);
      expectCoveredPromises(world);
      busiest = Math.max(busiest, workers(world).filter((worker) => worker.job !== null).length);
    });

    // La charge était réelle : les dix étaient dehors en même temps.
    expect(busiest).toBe(10);

    // Tout le stock utile est parti sur les chantiers, et pas un objet de plus.
    const hall = hallOf(world);
    const delivered = (item: ItemId): number =>
      [...world.entities.values()].reduce(
        (sum, entity) =>
          sum +
          (entity.kind === 'site'
            ? (entity.delivered[item] ?? 0)
            : built.has(entity.id)
              ? ((BUILDINGS[entity.proto].cost as Partial<Record<ItemId, number>>)[item] ?? 0)
              : 0),
        0,
      );

    expect(hall.store.count('wood')).toBe(0);
    expect(delivered('wood')).toBe(30);
    expect(hall.store.count('stone')).toBe(0);
    expect(delivered('stone')).toBe(20);
    expect(delivered('ironOre')).toBe(4);
  });

  it('vide une foreuse pleine dans la mairie, et la foreuse repart', () => {
    const world = colony({ hall: {}, houses: 1, drills: [{ ironOre: BUILDINGS.drill.storage }] });
    const drill = [...world.entities.values()].find((entity) => entity.kind === 'drill')!;

    run(world, 400);

    expect(drill.kind === 'drill' && drill.blocked).toBe(false);
    expect(hallOf(world).store.count('ironOre')).toBeGreaterThan(0);
  });

  it('un chantier en attente passe avant une foreuse à vider', () => {
    const world = colony({ hall: { wood: 40, stone: 40 }, houses: 1, sites: ['farm'], drills: [{ ironOre: 20 }] });

    run(world, 2);

    const first = workers(world).find((worker) => worker.job !== null);

    expect(first?.job?.priority).toBe(JOB_PRIORITY.site);
  });

  it('ce qu’Adam a livré entre-temps repart à la mairie : la charge ne se perd pas', () => {
    const world = colony({ hall: { wood: 40, stone: 40 }, houses: 1, sites: ['farm'] });
    const site = sites(world)[0]!;
    const cost = BUILDINGS.farm.cost;

    const carrying = (): boolean => workers(world).some((worker) => worker.job?.carried === true && worker.job.to === site.id);

    // Un porteur a ramassé sa charge…
    for (let i = 0; i < 2000 && !carrying(); i += 1) world.tick();
    expect(carrying()).toBe(true);

    // … et Adam termine la livraison avant lui.
    site.delivered = { ...cost };

    const before = census(world);

    run(world, 3000);

    // Ce qu'Adam a posé est apparu de nulle part pour ce monde de test : le reste est à l'identique.
    expect(census(world)).toEqual(before);
    expect(site.delivered).toEqual(cost);
    expect(workers(world).every((worker) => worker.job === null)).toBe(true);
  });

  it('pendant une vague, tout le monde rentre ; la vague passée, le travail reprend', () => {
    const world = colony({ hall: { wood: 40, stone: 40 }, houses: 1, sites: ['farm'] });
    const hall = hallOf(world);

    run(world, 80);
    expect(workers(world).some((worker) => !worker.inside)).toBe(true);

    // Un mutant loin au nord, qui mettra longtemps à arriver.
    const x = (hall.tx + 1.5) * TILE_SIZE;
    const y = (hall.ty - 60) * TILE_SIZE;

    world.mobiles.set(9999, {
      kind: 'mutant',
      id: 9999,
      proto: 'mutant',
      x,
      y,
      prevX: x,
      prevY: y,
      facing: 'down',
      moving: false,
      hp: ENEMIES.mutant.hp,
      age: 30,
      attackCooldown: 0,
      emerge: 0,
    });

    const before = census(world);

    run(world, 400);
    expect(workers(world).every((worker) => worker.inside)).toBe(true);
    // À l'abri avec leur charge : rien ne s'est perdu.
    expect(census(world)).toEqual(before);

    world.mobiles.delete(9999);
    run(world, 3000);
    // Le travail a repris jusqu'au bout : le dernier objet porté a achevé la ferme.
    expect(sites(world)).toHaveLength(0);
  });

  it('une sauvegarde en plein transport se recharge avec ses réservations', () => {
    const world = colony({ hall: { wood: 30, stone: 20 }, houses: 2, sites: ['farm', 'nursery', 'watchtower'] });

    run(world, 150);
    expect(workers(world).some((worker) => worker.job !== null)).toBe(true);

    const reloaded = decodeSave(encodeSave(world, 1));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);

    const copy = reloaded.world;

    expectCoveredPromises(copy);
    expect(census(copy)).toEqual(census(world));

    run(world, 2000);
    run(copy, 2000, () => expectCoveredPromises(copy));
    expect(copy.snapshot()).toEqual(world.snapshot());
  });

  it('compte les ouvriers de la ville : total, par bâtiment, porteurs occupés ou en attente', () => {
    const world = colony({ hall: { wood: 40, stone: 40 }, houses: 2, sites: ['farm'] });
    const houses = BUILDINGS.builderHouse.workers * 2;

    // Un chantier n'emploie personne ; les maisons emploient huit des dix ouvriers de la colonie.
    expect(world.workforce()).toEqual({
      total: COLONY.startingWorkers,
      byBuilding: [{ proto: 'builderHouse', count: houses }],
      porters: { busy: 0, idle: houses },
      assigned: houses,
      free: COLONY.startingWorkers - houses,
      missing: 0,
    });

    run(world, 60);

    const { busy, idle } = world.workforce().porters;

    expect(busy).toBeGreaterThan(0);
    expect(busy + idle).toBe(houses);

    run(world, 3000);

    // La ferme finie embauche les deux ouvriers libres : le total ne bouge pas, et reste celui de la population.
    const after = world.workforce();

    expect(after.total).toBe(COLONY.startingWorkers);
    expect(after.total).toBe(world.population().workers);
    expect(after.byBuilding).toEqual([
      { proto: 'builderHouse', count: houses },
      { proto: 'farm', count: COLONY.startingWorkers - houses },
    ]);
    expect(after).toMatchObject({ assigned: COLONY.startingWorkers, free: 0, missing: houses + BUILDINGS.farm.workers - COLONY.startingWorkers });

    // Une maison tombée : ses porteurs quittent leur maison, la colonie les garde.
    const house = [...world.entities.values()].find((entity) => entity.kind === 'house')!;

    world.entities.delete(house.id);
    expect(world.workforce().total).toBe(COLONY.startingWorkers);
    expect(world.workforce().porters.busy + world.workforce().porters.idle).toBe(BUILDINGS.builderHouse.workers);
  });

  it('une maison réglée à 2 ouvriers : deux porteurs travaillent, les autres rentrent, libres', () => {
    const world = colony({ hall: { wood: 40, stone: 40 }, houses: 1, sites: ['farm', 'nursery'] });
    const house = [...world.entities.values()].find((entity) => entity.kind === 'house')!;
    const busy = new Set<number>();

    world.push({ type: 'setWorkers', id: house.id, count: 2 });
    run(world, 1500, () => {
      for (const worker of workers(world)) if (worker.job) busy.add(worker.id);
    });

    const ids = workers(world)
      .map((worker) => worker.id)
      .sort((a, b) => a - b);

    expect(ids).toHaveLength(2);
    expect([...busy].sort((a, b) => a - b)).toEqual(ids);
    expect(world.staffing(house)).toMatchObject({ wanted: 2, filled: 2 });
    // La ferme, achevée entre-temps, emploie les siens ; le reste est libre.
    expect(world.workforce()).toMatchObject({ assigned: 2 + BUILDINGS.farm.workers, free: COLONY.startingWorkers - 2 - BUILDINGS.farm.workers });
  });

  it('ne trace jamais une ligne droite à travers l’eau', () => {
    let water: { tx: number; ty: number } | null = null;

    for (let ty = -60; ty < 60 && !water; ty += 1) {
      for (let tx = -60; tx < 60 && !water; tx += 1) {
        if (!isWalkable(terrainAt(1, tx, ty))) water = { tx, ty };
      }
    }
    if (!water) throw new Error('pas d’eau autour de l’origine');

    const x = (water.tx + 0.5) * TILE_SIZE;
    const y = (water.ty + 0.5) * TILE_SIZE;

    expect(clearLine(1, x - 5 * TILE_SIZE, y, x + 5 * TILE_SIZE, y)).toBe(false);
    expect(clearLine(1, x, y - 5 * TILE_SIZE, x, y + 5 * TILE_SIZE)).toBe(false);
  });
});

describe('forge et nurserie ravitaillées par la ville', () => {
  function forgeOf(world: World): Forge {
    const forge = [...world.entities.values()].find((entity): entity is Forge => entity.kind === 'forge' && entity.proto === 'forge');

    if (!forge) throw new Error('pas de forge');
    return forge;
  }

  it('ville avec 10 fer et 5 charbon, forge vide dans le rayon : les porteurs la ravitaillent, elle fond des plaques — rien de perdu ni de dupliqué', () => {
    const world = colony({ hall: { ironOre: 10, coal: 5 }, houses: 1, forges: [{}] });
    const forge = forgeOf(world);

    expect(world.inTownRange(forge)).toBe(true);
    expect(forge.blocked).toBe(true);

    run(world, 1500, () => {
      const { ironOre, coal, ironPlate } = census(world);

      // Une plaque, c'est deux fers et un charbon : le compte ne bouge pas.
      expect(ironOre + 2 * ironPlate).toBe(10);
      expect(coal + ironPlate).toBe(5);
      expectCoveredPromises(world);
    });

    expect(census(world).ironPlate).toBeGreaterThanOrEqual(1);
    // Les plaques ne restent pas au four : les porteurs les rapportent à la mairie.
    expect(world.townStock()?.count('ironPlate') ?? 0).toBeGreaterThanOrEqual(1);
    // Adam, resté à l'écart, n'a rien porté.
    expect(world.player.inventory.isEmpty()).toBe(true);
  });

  it('une forge en famine passe avant une foreuse à vider', () => {
    const world = colony({ hall: { ironOre: 10, coal: 5 }, houses: 1, drills: [{ ironOre: 20 }], forges: [{}] });

    run(world, 2);

    const first = workers(world).find((worker) => worker.job !== null);

    expect(first?.job?.priority).toBe(JOB_PRIORITY.starving);
    expect(first?.job?.to).toBe(forgeOf(world).id);
  });

  it('une forge en pause n’est pas ravitaillée', () => {
    const world = colony({ hall: { ironOre: 10, coal: 5 }, houses: 1, forges: [{}] });

    world.push({ type: 'pauseBuilding', id: forgeOf(world).id, paused: true });
    run(world, 600);

    expect(forgeOf(world).store.isEmpty()).toBe(true);
    expect(hallOf(world).store.count('ironOre')).toBe(10);
  });

  it('la nurserie affamée reçoit sa nourriture de la ville, et l’enfant naît', () => {
    const food = RECIPES.raiseChild.inputs.food;
    const world = colony({ hall: { food: food * 2 }, houses: 1, nurseries: [{}] });
    const kids = (): number => [...world.mobiles.values()].filter((mobile) => mobile.kind === 'kid').length;

    run(world, 1500, () => {
      expect(census(world).food + food * kids()).toBe(food * 2);
      expectCoveredPromises(world);
    });

    expect(kids()).toBe(1);
  });

  it('une nurserie à nourrir passe avant une foreuse pleine à vider', () => {
    const world = colony({ hall: { food: 12 }, houses: 1, drills: [{ ironOre: 20 }], nurseries: [{ food: 9 }] });

    run(world, 2);

    const first = workers(world).find((worker) => worker.job !== null);
    const nursery = [...world.entities.values()].find((entity) => entity.kind === 'nursery')!;

    expect(first?.job?.to).toBe(nursery.id);
    expect(first?.job?.priority).toBeGreaterThan(JOB_PRIORITY.empty);
  });

  it('une livraison de chantier déjà en route n’est pas détournée par la nurserie qui a faim', () => {
    const world = colony({ hall: { wood: 30, stone: 10 }, houses: 1, sites: ['home'], nurseries: [{}] });
    const site = sites(world)[0]!;
    const carrying = (): Worker | undefined => workers(world).find((worker) => worker.job?.carried && worker.job.to === site.id);

    for (let i = 0; i < 600 && !carrying(); i += 1) world.tick();

    const porter = carrying()!;

    expect(porter).toBeDefined();
    hallOf(world).store.add('food', 12);
    for (let i = 0; i < 600 && porter.job?.carried; i += 1) {
      world.tick();
      if (porter.job?.carried) expect(porter.job.to).toBe(site.id);
    }
    // Le chantier livré, la nurserie est servie ensuite.
    run(world, 900);
    expect([...world.mobiles.values()].filter((mobile) => mobile.kind === 'kid')).toHaveLength(1);
  });

  it('« Transférer » prend le sac, puis la ville, dans la part du coffre', () => {
    const world = colony({ hall: { ironOre: 28, coal: 4 }, houses: 0, forges: [{}] });
    const forge = forgeOf(world);
    const door = doorOf(forge);
    const supplied: ['bag' | 'town', ItemId, number][] = [];

    world.events.on('buildingSupplied', ({ source, item, amount }) => supplied.push([source, item, amount]));
    world.player.x = door.x;
    world.player.y = door.y + TILE_SIZE;
    world.player.inventory.add('ironOre', 2);

    expect(world.canSupply(forge)).toBe(true);
    world.push({ type: 'supplyBuilding', id: forge.id });
    world.tick();

    const ironShare = (BUILDINGS.forge.storage * 2) / 3;

    expect(supplied).toEqual([
      ['bag', 'ironOre', 2],
      ['town', 'ironOre', ironShare - 2],
      ['town', 'coal', 4],
    ]);
    expect(world.player.inventory.count('ironOre')).toBe(0);
    expect(hallOf(world).store.count('ironOre')).toBe(28 - (ironShare - 2));
    expect(hallOf(world).store.count('coal')).toBe(0);
    expect(forge.blocked).toBe(false);
  });
});

describe('grill', () => {
  function grillsOf(world: World): Forge[] {
    return [...world.entities.values()].filter((entity): entity is Forge => entity.proto === 'grill');
  }

  it('la recette : 1 viande → 1 viande grillée en 5 s, un ouvrier, débloqué au labo', () => {
    expect(RECIPES.grillMeat).toMatchObject({ building: 'grill', duration: 20 * 5, inputs: { meat: 1 }, outputs: { grilledMeat: 1 } });
    expect(BUILDINGS.grill).toMatchObject({ kind: 'forge', workers: 1 });
    expect(unlockingResearch('grill')).toBe('grilling');
  });

  it('la viande grillée rapporte plus de nourriture que la crue', () => {
    expect(HUNTING.foodPerGrilled).toBeGreaterThan(HUNTING.foodPerMeat);
  });

  it('6 viandes en ville : le grill en garde 4 à cuire, les porteurs rapportent les grillées, le reste est converti cru', () => {
    const world = colony({ hall: { meat: 6 }, houses: 1, grills: [{}] });
    const [grill] = grillsOf(world);
    const food = hallOf(world).store.count('food');
    let grilled = 0;

    if (!grill) throw new Error('pas de grill');
    world.events.on('forgeProduced', () => (grilled += 1));

    run(world, 120 * TICKS_PER_SECOND, () => expectCoveredPromises(world));

    // Le stock visé du grill (`demand`) passe par la grille ; le surplus est converti cru, comme sans grill.
    const kept = BUILDINGS.grill.demand.meat;

    expect(grilled).toBe(kept);
    expect(census(world).meat).toBe(0);
    expect(census(world).grilledMeat).toBe(0);
    expect(hallOf(world).store.count('food')).toBe(food + kept * HUNTING.foodPerGrilled + (6 - kept) * HUNTING.foodPerMeat);
  });

  it('sans grill, la viande crue devient de la nourriture comme avant', () => {
    const world = colony({ hall: { meat: 6 }, houses: 1 });
    const food = hallOf(world).store.count('food');

    run(world, 3 * TICKS_PER_SECOND);

    expect(hallOf(world).store.count('meat')).toBe(0);
    expect(hallOf(world).store.count('food')).toBe(food + 6 * HUNTING.foodPerMeat);
  });

  it('un grill en pause ne retient pas la viande : elle est convertie', () => {
    const world = colony({ hall: { meat: 6 }, houses: 1, grills: [{}] });
    const [grill] = grillsOf(world);

    if (!grill) throw new Error('pas de grill');
    grill.paused = true;
    run(world, 3 * TICKS_PER_SECOND);

    expect(hallOf(world).store.count('meat')).toBe(0);
  });

  it('la viande grillée déposée en ville est convertie au ratio des grillades', () => {
    const world = colony({ hall: { grilledMeat: 4 }, houses: 1 });
    const food = hallOf(world).store.count('food');

    run(world, 3 * TICKS_PER_SECOND);

    expect(hallOf(world).store.count('grilledMeat')).toBe(0);
    expect(hallOf(world).store.count('food')).toBe(food + 4 * HUNTING.foodPerGrilled);
  });
});

describe('boulangerie', () => {
  function bakeriesOf(world: World): Forge[] {
    return [...world.entities.values()].filter((entity): entity is Forge => entity.proto === 'bakery');
  }

  it('la recette : 2 blés → 1 pain, un ouvrier, débloquée au labo, et le blé vient de la ferme', () => {
    expect(RECIPES.bakeBread).toMatchObject({ building: 'bakery', inputs: { wheat: 2 }, outputs: { bread: 1 } });
    expect(BUILDINGS.bakery).toMatchObject({ kind: 'forge', workers: 1, menu: true });
    expect(unlockingResearch('bakery')).toBe('baking');
    expect(CROPS.item).toBe('wheat');
  });

  it('le pain rapporte plus de nourriture que la viande grillée, sans rendre la chasse inutile', () => {
    expect(HUNTING.foodPerBread).toBeGreaterThan(HUNTING.foodPerGrilled);
    // Deux blés pour un pain : le pain ne vaut pas le double de la viande grillée.
    expect(HUNTING.foodPerBread).toBeLessThan(HUNTING.foodPerGrilled * 2);
  });

  it('les porteurs ravitaillent la boulangerie en blé depuis la mairie, qui cuit à la cadence de la recette', () => {
    const world = colony({ hall: { wheat: 6 }, houses: 1, bakeries: [{}] });
    const [bakery] = bakeriesOf(world);
    let baked = 0;

    if (!bakery) throw new Error('pas de boulangerie');
    world.events.on('forgeProduced', () => (baked += 1));
    run(world, 120 * TICKS_PER_SECOND);

    expect(baked).toBeGreaterThanOrEqual(1);
    expect(hallOf(world).store.count('wheat')).toBeLessThan(6);
    // Le pain n'est jamais perdu : au four, en route ou déjà converti en nourriture à la mairie.
    expect(hallOf(world).store.count('food') + bakery.store.count('bread')).toBeGreaterThan(0);
  });

  it('le pain déposé en ville devient de la nourriture au ratio du pain', () => {
    const world = colony({ hall: { bread: 3 }, houses: 1 });
    const food = hallOf(world).store.count('food');

    run(world, 3 * TICKS_PER_SECOND);

    expect(hallOf(world).store.count('bread')).toBe(0);
    expect(hallOf(world).store.count('food')).toBe(food + 3 * HUNTING.foodPerBread);
  });
});

describe('four à charbon', () => {
  function kilnsOf(world: World): Forge[] {
    return [...world.entities.values()].filter((entity): entity is Forge => entity.proto === 'charcoalKiln');
  }

  it('la recette : 3 bois → 1 charbon en 8 s, un ouvrier, un coffre de 10, débloqué avec la forge', () => {
    expect(RECIPES.burnCharcoal).toMatchObject({ building: 'charcoalKiln', duration: 20 * 8, inputs: { wood: 3 }, outputs: { coal: 1 } });
    expect(BUILDINGS.charcoalKiln).toMatchObject({ kind: 'forge', cost: { stone: 10, wood: 6 }, workers: 1, storage: 10 });
    expect(unlockingResearch('charcoalKiln')).toBe(unlockingResearch('forge'));
  });

  it('30 bois en ville : 10 charbons cuits en 80 s et rapportés à la mairie — rien de perdu ni de dupliqué', () => {
    const world = colony({ hall: { wood: 30 }, houses: 1, kilns: [{}] });
    const [kiln] = kilnsOf(world);
    const cooked: number[] = [];
    let lit = -1;

    if (!kiln) throw new Error('pas de four');
    expect(world.inTownRange(kiln)).toBe(true);
    world.events.on('forgeProduced', () => cooked.push(world.tickCount));

    run(world, 100 * TICKS_PER_SECOND, () => {
      const { wood, coal } = census(world);

      if (lit < 0 && !kiln.blocked) lit = world.tickCount;
      // Un charbon, c'est trois bois : le compte ne bouge pas.
      expect(wood + 3 * coal).toBe(30);
      expectCoveredPromises(world);
    });

    // Les porteurs le tiennent garni : dix cuissons d'affilée, 80 s du premier feu au dernier charbon.
    expect(cooked).toHaveLength(10);
    expect(cooked[9]! - lit).toBe(10 * RECIPES.burnCharcoal.duration);
    expect(hallOf(world).store.count('coal')).toBe(10);
    expect(census(world).wood).toBe(0);
    // Adam, resté à l'écart, n'a rien porté.
    expect(world.player.inventory.isEmpty()).toBe(true);
  });

  it('sans ouvrier, le four ne cuit rien', () => {
    const world = colony({ hall: { wood: 30 }, houses: 1, kilns: [{}] });
    const [kiln] = kilnsOf(world);

    if (!kiln) throw new Error('pas de four');
    world.push({ type: 'setWorkers', id: kiln.id, count: 0 });
    run(world, 30 * TICKS_PER_SECOND);

    expect(world.stopped(kiln)).toBe(true);
    expect(census(world).coal).toBe(0);
  });

  /*
   * Le playtest v2 : la forge bâtie, 311 minerais en ville et 0 charbon —
   * deux plaques en 33 minutes. Une foreuse, deux fours et une forge, la
   * ville pleine de bois : la chaîne bois → charbon → plaque tourne seule.
   */
  it('forge + 2 fours + foreuse pendant 5 min : au moins 30 plaques, sans rien dupliquer', () => {
    // De l'eau pour cinq minutes : ce n'est pas la soif qu'on mesure ici.
    const world = colony({ hall: { wood: 300, water: 100 }, houses: 2, forges: [{}], kilns: [{}, {}], drills: [{ ironOre: 1 }] });
    let plates = 0;

    world.events.on('forgeProduced', ({ item }) => {
      if (item === 'ironPlate') plates += 1;
    });

    run(world, 5 * 60 * TICKS_PER_SECOND, () => {
      const { wood, coal, ironPlate } = census(world);

      // Le bois devient charbon, le charbon devient plaque : rien ne se crée en route.
      expect(wood + 3 * (coal + ironPlate)).toBe(300);
      expectCoveredPromises(world);
    });

    expect(plates).toBeGreaterThanOrEqual(30);
    expect(census(world).ironPlate).toBe(plates);
  });
});
