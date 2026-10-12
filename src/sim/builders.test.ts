import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { COLONY } from '../data/inhabitants.ts';
import { ENEMIES } from '../data/enemies.ts';
import { ITEM_IDS, type ItemId } from '../data/items.ts';
import { BUILDERS } from '../data/workers.ts';
import { JobBoard, doorOf, inYardRange, siteWork } from './jobs.ts';
import { decodeSave, encodeSave, type SavedEntity } from './save.ts';
import { isWalkable, terrainAt } from './terrain.ts';
import type { Entity, EntityId, Site, TownHall, Worker, Yard } from './types.ts';
import { World, siteMissing } from './world.ts';

type Stock = Partial<Record<ItemId, number>>;

/** Un bâtiment de la colonie de test, posé à (dx, dy) tuiles de la mairie. */
interface Placement {
  proto: BuildingId;
  dx: number;
  dy: number;
  /** Un chantier, pas encore bâti ; `delivered` : ce qu'il a déjà reçu. */
  site?: boolean;
  delivered?: Stock;
  /** Un poste en pause, ou réglé à moins de bâtisseurs. */
  paused?: boolean;
  staff?: number;
}

/** Le poste, au sud de la mairie : son rayon couvre `NEAR_A` et `NEAR_B`, pas `FAR`. */
const YARD: Placement = { proto: 'constructionPost', dx: 6, dy: 12 };
const NEAR_A = { dx: 2, dy: 15 };
const NEAR_B = { dx: 10, dy: 17 };
const FAR = { dx: -12, dy: 18 };
const HOUSE: Placement = { proto: 'builderHouse', dx: -6, dy: 5 };

/** Une seed dont la mairie a une grande plaine sans eau au sud : tout le monde y va en ligne droite. */
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

/** Une colonie posée d'un coup, en retouchant la sauvegarde d'un monde neuf : maisons et postes se peuplent au chargement. */
function colony(hall: Stock, placements: Placement[]): World {
  const { world, hx, hy } = landSeed();
  const state = world.snapshot();
  let nextId = state.nextId;
  const entities: SavedEntity[] = [
    { kind: 'townHall', id: world.townHallId, proto: 'townHall', tx: hx, ty: hy, width: 3, height: 3, store: hall, hp: BUILDINGS.townHall.hp, level: 1, paused: false, staff: 0 },
  ];

  for (const { proto, dx, dy, site, delivered = {}, paused = false, staff } of placements) {
    const { width, height, hp, workers } = BUILDINGS[proto];
    const placed = { id: nextId++, proto, tx: hx + dx, ty: hy + dy, width, height, store: {}, hp, level: 1, paused, staff: staff ?? workers };

    if (site) {
      entities.push({ id: placed.id, proto, tx: placed.tx, ty: placed.ty, width, height, kind: 'site', delivered, work: 0 });
      continue;
    }

    switch (BUILDINGS[proto].kind) {
      case 'house':
        entities.push({ ...placed, kind: 'house' });
        break;
      case 'yard':
        entities.push({ ...placed, kind: 'yard' });
        break;
      default:
        throw new Error(`${proto} : pas prévu dans cette colonie de test`);
    }
  }

  // Adam à l'écart, immobile : ce sont les ouvriers qu'on regarde.
  state.player = { ...state.player, x: (hx - 20) * TILE_SIZE, y: (hy - 20) * TILE_SIZE };
  state.entities = entities;
  state.nextId = nextId;
  state.mobiles = [];
  // Ni bases ni gardiens : Adam, à l'écart, pourrait en croiser, et son arc mêlerait leur butin au compte.
  state.enemyBases = [];
  return World.restore(state);
}

function hallOf(world: World): TownHall {
  const hall = world.entities.get(world.townHallId);

  if (hall?.kind !== 'townHall') throw new Error('pas de mairie');
  return hall;
}

function yardOf(world: World): Yard {
  const yard = [...world.entities.values()].find((entity): entity is Yard => entity.kind === 'yard');

  if (!yard) throw new Error('pas de poste');
  return yard;
}

function workers(world: World): Worker[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Worker => mobile.kind === 'worker' && !mobile.free);
}

function builders(world: World): Worker[] {
  return workers(world).filter((worker) => worker.builder);
}

function porters(world: World): Worker[] {
  return workers(world).filter((worker) => !worker.builder && !worker.logistician);
}

/** Ce qui est posé à (dx, dy) de la mairie. */
function at(world: World, spot: { dx: number; dy: number }): Entity {
  const hall = hallOf(world);
  const found = [...world.entities.values()].find((entity) => entity.tx === hall.tx + spot.dx && entity.ty === hall.ty + spot.dy);

  if (!found) throw new Error(`rien en ${spot.dx}, ${spot.dy}`);
  return found;
}

function siteAt(world: World, spot: { dx: number; dy: number }): Site {
  const found = at(world, spot);

  if (found.kind !== 'site') throw new Error(`pas de chantier en ${spot.dx}, ${spot.dy}`);
  return found;
}

function run(world: World, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i += 1) {
    world.tick();
    each?.();
  }
}

/** Tourne jusqu'à ce que `done()` soit vrai ; renvoie le nombre de ticks. */
function until(world: World, done: () => boolean, limit = 6000): number {
  for (let i = 0; i < limit; i += 1) {
    if (done()) return i;
    world.tick();
  }
  throw new Error('jamais arrivé');
}

/**
 * Où se trouve chaque objet : coffres, charges en main, livré sur les
 * chantiers — et, pour un chantier achevé depuis `sites`, tout son coût,
 * consommé par la construction. Rien d'autre n'en crée ni n'en détruit ici.
 */
function census(world: World, sites: readonly EntityId[]): Record<ItemId, number> {
  const total = Object.fromEntries(ITEM_IDS.map((item) => [item, 0])) as Record<ItemId, number>;
  const add = (stock: Stock): void => {
    for (const [item, amount] of Object.entries(stock) as [ItemId, number][]) total[item] += amount;
  };

  for (const entity of world.entities.values()) {
    if (entity.kind === 'site') add(entity.delivered);
    else if (sites.includes(entity.id)) add(BUILDINGS[entity.proto].cost);
    else for (const [item, amount] of entity.store.entries()) total[item] += amount;
  }
  for (const worker of workers(world)) {
    if (worker.job?.carried) total[worker.job.item] += worker.job.amount;
  }
  for (const mobile of world.mobiles.values()) {
    if (mobile.kind === 'pickup') total[mobile.item] += mobile.amount;
  }
  return total;
}

function sitesOf(world: World): EntityId[] {
  return [...world.entities.values()].filter((entity) => entity.kind === 'site').map((entity) => entity.id);
}

/**
 * Les promesses sont couvertes : ce que la mairie a promis, c'est ce que
 * les ouvriers en route vont y chercher ; aucun chantier ne se voit promettre
 * plus qu'il n'attend.
 */
function expectCoveredPromises(world: World): void {
  const promised = new Map<string, number>();

  for (const worker of workers(world)) {
    const job = worker.job;

    if (job && !job.carried) promised.set(`${job.from}:${job.item}`, (promised.get(`${job.from}:${job.item}`) ?? 0) + job.amount);
  }

  const hall = hallOf(world);

  for (const item of ITEM_IDS) {
    expect(hall.store.available(item)).toBeGreaterThanOrEqual(0);
    expect(hall.store.count(item) - hall.store.available(item)).toBe(promised.get(`${hall.id}:${item}`) ?? 0);
  }
  for (const entity of world.entities.values()) {
    if (entity.kind !== 'site') continue;
    for (const [item, needed] of Object.entries(BUILDINGS[entity.proto].cost) as [ItemId, number][]) {
      expect((entity.delivered[item] ?? 0) + world.siteIncoming(entity.id, item)).toBeLessThanOrEqual(needed);
    }
  }
}

describe('poste de construction', () => {
  it('loge quatre bâtisseurs, pris parmi les ouvriers de la colonie ; leur nombre se règle et le poste se met en pause', () => {
    const world = colony({}, [YARD]);
    const yard = yardOf(world);

    expect(BUILDINGS.constructionPost.workers).toBe(4);
    expect(builders(world)).toHaveLength(4);
    expect(builders(world).every((worker) => worker.homeId === yard.id)).toBe(true);
    // Le poste n'en crée aucun : il en emploie quatre.
    expect(world.population().workers).toBe(COLONY.startingWorkers);
    expect(world.workforce()).toMatchObject({ total: COLONY.startingWorkers, assigned: 4 });

    world.push({ type: 'setWorkers', id: yard.id, count: 2 });
    world.push({ type: 'pauseBuilding', id: yard.id, paused: true });
    world.tick();
    expect(yard.staff).toBe(2);
    expect(yard.paused).toBe(true);
    expect(world.stopped(yard)).toBe(true);
  });

  it('le rayon se mesure du centre du poste au centre du chantier', () => {
    const world = colony({}, [YARD, { proto: 'farm', ...NEAR_A, site: true }, { proto: 'farm', ...FAR, site: true }]);
    const yard = yardOf(world);
    const edge = { width: 2, height: 2, tx: yard.tx, ty: yard.ty + BUILDERS.radius };

    expect(inYardRange(yard, at(world, NEAR_A))).toBe(true);
    expect(inYardRange(yard, at(world, FAR))).toBe(false);
    expect(inYardRange(yard, edge)).toBe(true);
    expect(inYardRange(yard, { ...edge, ty: edge.ty + 1 })).toBe(false);
    expect(world.yardSites(yard)).toBe(1);
  });

  it('mairie → chantier → bâtiment : poser un bâtiment dans le rayon suffit, sans Adam', () => {
    const world = colony({ wood: 30, stone: 20 }, [YARD]);
    const hall = hallOf(world);
    const tx = hall.tx + NEAR_A.dx;
    const ty = hall.ty + NEAR_A.dy;

    // Adam vient poser le chantier, puis repart loin : il n'y touchera plus.
    const far = { x: world.player.x, y: world.player.y };

    world.player.x = (tx + 1) * TILE_SIZE;
    world.player.y = (ty - 3) * TILE_SIZE;
    world.push({ type: 'placeBuilding', building: 'farm', tx, ty });
    world.tick();
    Object.assign(world.player, { x: far.x, y: far.y, prevX: far.x, prevY: far.y });

    const site = siteAt(world, NEAR_A);
    const sources = new Set<string>();
    let hammered = false;
    let deliveredWhole = -1;
    let completedAt = -1;

    world.events.on('porterDelivered', ({ workerId, id }) => {
      const worker = world.mobiles.get(workerId) as Worker;

      expect(id).toBe(site.id);
      expect(worker.builder).toBe(true);
      sources.add('builder');
    });
    world.events.on('siteDelivered', () => sources.add('adam'));
    world.events.on('buildingCompleted', ({ id }) => {
      if (id === site.id) completedAt = world.tickCount;
    });

    run(world, 3000, () => {
      const current = world.entities.get(site.id);

      if (current?.kind === 'site' && siteMissing(current) === 0 && deliveredWhole < 0) deliveredWhole = world.tickCount;
      if (builders(world).some((worker) => worker.build === site.id && !worker.moving)) hammered = true;
    });

    expect([...sources]).toEqual(['builder']);
    expect(hammered).toBe(true);
    expect(deliveredWhole).toBeGreaterThan(0);
    // Tout livré ne suffit pas : il a fallu le bâtir.
    expect(completedAt).toBeGreaterThan(deliveredWhole);
    expect(world.entities.get(site.id)?.kind).toBe('farm');
    expect(hall.store.count('wood')).toBe(20);
    expect(hall.store.count('stone')).toBe(16);
    expect(world.player.inventory.total()).toBe(0);
    // Le bâtiment est debout : les bâtisseurs ont posé le marteau.
    expect(builders(world).every((worker) => worker.build === null)).toBe(true);
  });

  it('plusieurs bâtisseurs bâtissent plus vite ensemble, trois au plus sur un chantier', () => {
    const cost = BUILDINGS.farm.cost;
    const time = (staff: number): { ticks: number; most: number } => {
      const world = colony({}, [{ ...YARD, staff }, { proto: 'farm', ...NEAR_A, site: true, delivered: cost }]);
      const site = siteAt(world, NEAR_A);
      let most = 0;

      expect(world.awaitsBuilders(site)).toBe(true);

      const ticks = until(world, () => {
        most = Math.max(most, world.siteBuilders(site.id));
        return world.entities.get(site.id)?.kind === 'farm';
      });

      return { ticks, most };
    };

    const alone = time(1);
    const crew = time(4);

    expect(alone.most).toBe(1);
    expect(crew.most).toBe(BUILDERS.perSite);
    expect(crew.ticks).toBeLessThan(alone.ticks);
    // Le travail, seul : `siteWork` ticks au marteau, plus la marche.
    expect(alone.ticks).toBeGreaterThanOrEqual(siteWork({ proto: 'farm' } as Site));
  });

  it('outils de qualité (labo) : chaque coup de marteau abat plus d’ouvrage', () => {
    const strikes = (tools: boolean): number => {
      const world = colony({}, [{ ...YARD, staff: 1 }, { proto: 'farm', ...NEAR_A, site: true, delivered: BUILDINGS.farm.cost }]);
      const site = siteAt(world, NEAR_A);

      if (tools) world.researchDone.push('goodTools');
      until(world, () => site.work > 0);

      const from = site.work;

      for (let i = 0; i < 40; i += 1) world.tick();
      return site.work - from;
    };

    expect(strikes(true)).toBe(Math.round(strikes(false) * 1.25));
  });

  it('plusieurs chantiers en parallèle, sans rien perdre ni dupliquer, sans jamais promettre deux fois', () => {
    const world = colony({ wood: 40, stone: 20, ironOre: 4 }, [
      YARD,
      { proto: 'farm', ...NEAR_A, site: true },
      { proto: 'watchtower', ...NEAR_B, site: true },
      { proto: 'drill', dx: 4, dy: 18, site: true },
    ]);
    const sites = sitesOf(world);
    const before = census(world, sites);

    run(world, 5000, () => {
      expect(census(world, sites)).toEqual(before);
      expectCoveredPromises(world);
      for (const id of sites) expect(world.siteBuilders(id)).toBeLessThanOrEqual(BUILDERS.perSite);
    });

    for (const id of sites) expect(world.entities.get(id)?.kind).not.toBe('site');
    // Ferme, tour de guet et foreuse payées sur la ville : le reste y est.
    const spent = (item: ItemId): number =>
      (['farm', 'watchtower', 'drill'] as const).reduce((sum, proto) => sum + ((BUILDINGS[proto].cost as Stock)[item] ?? 0), 0);

    expect(hallOf(world).store.count('wood')).toBe(40 - spent('wood'));
    expect(hallOf(world).store.count('stone')).toBe(20 - spent('stone'));
    expect(hallOf(world).store.count('ironOre')).toBe(4 - spent('ironOre'));
  });

  it('le plus ancien chantier d’abord ; la mairie à court, ils passent à ce qu’elle a, puis attendent', () => {
    // De quoi livrer une ferme (10 bois, 4 pierre), pas la foreuse (pierre et fer) ni les deux.
    const world = colony({ wood: 10, stone: 4 }, [
      YARD,
      { proto: 'farm', ...NEAR_B, site: true },
      { proto: 'farm', ...NEAR_A, site: true },
    ]);
    const older = siteAt(world, NEAR_B);
    const newer = siteAt(world, NEAR_A);

    expect(older.id).toBeLessThan(newer.id);
    run(world, 3000);

    expect(world.entities.get(older.id)?.kind).toBe('farm');
    expect(world.entities.get(newer.id)?.kind).toBe('site');
    expect(hallOf(world).store.total()).toBe(0);
    // Rien à faire : ils flânent devant le poste.
    expect(builders(world).every((worker) => worker.job === null && worker.build === null)).toBe(true);

    // La mairie se remplit : le second chantier repart.
    hallOf(world).store.add('wood', 10);
    hallOf(world).store.add('stone', 4);
    run(world, 3000);
    expect(world.entities.get(newer.id)?.kind).toBe('farm');
  });

  it('le partage : les chantiers du rayon aux bâtisseurs, les autres aux porteurs, qui les achèvent au dernier objet', () => {
    const world = colony({ wood: 40, stone: 20 }, [
      HOUSE,
      YARD,
      { proto: 'farm', ...NEAR_A, site: true },
      { proto: 'farm', ...FAR, site: true },
    ]);
    const near = siteAt(world, NEAR_A);
    const far = siteAt(world, FAR);
    let farBuilt = false;

    world.events.on('buildingCompleted', ({ id }) => {
      if (id === far.id) {
        farBuilt = true;
        // Hors de portée : aucun travail au marteau, le dernier objet l'a achevé.
        expect(builders(world).some((worker) => worker.build === far.id)).toBe(false);
      }
    });

    run(world, 4000, () => {
      for (const worker of porters(world)) expect(worker.job?.to).not.toBe(near.id);
      for (const worker of builders(world)) {
        expect(worker.job?.to ?? near.id).toBe(near.id);
        expect(worker.build ?? near.id).toBe(near.id);
      }
    });

    expect(farBuilt).toBe(true);
    expect(world.entities.get(near.id)?.kind).toBe('farm');
  });

  it('sans poste, un chantier s’achève au dernier objet livré, comme avant', () => {
    const world = colony({ wood: 40, stone: 20 }, [HOUSE, { proto: 'farm', ...NEAR_A, site: true }]);
    const site = siteAt(world, NEAR_A);

    until(world, () => world.entities.get(site.id)?.kind !== 'site');
    expect(world.entities.get(site.id)?.kind).toBe('farm');
    expect(site.work).toBe(0);
  });

  it('un poste mis en pause ou tombé ne bloque rien : ses chantiers prêts s’achèvent, les porteurs livrent les autres', () => {
    const world = colony({ wood: 40, stone: 20 }, [
      HOUSE,
      YARD,
      { proto: 'farm', ...NEAR_A, site: true, delivered: BUILDINGS.farm.cost },
      { proto: 'farm', ...NEAR_B, site: true },
    ]);
    const ready = siteAt(world, NEAR_A);
    const waiting = siteAt(world, NEAR_B);
    const yard = yardOf(world);

    expect(world.awaitsBuilders(ready)).toBe(true);
    world.push({ type: 'pauseBuilding', id: yard.id, paused: true });
    world.tick();
    expect(world.entities.get(ready.id)?.kind).toBe('farm');

    run(world, 3000);
    expect(world.entities.get(waiting.id)?.kind).toBe('farm');
  });

  it('annuler un chantier : le livré retourne en ville, la charge en route aussi, rien ne se perd', () => {
    const world = colony({ wood: 30, stone: 20 }, [YARD, { proto: 'farm', ...NEAR_A, site: true, delivered: { wood: 3 } }]);
    const site = siteAt(world, NEAR_A);
    const hall = hallOf(world);

    // Un instant où un bâtisseur porte sa charge vers le chantier.
    until(world, () => builders(world).some((worker) => worker.job?.carried && worker.job.to === site.id));

    const sites = sitesOf(world);
    const woodBefore = census(world, sites).wood;
    let cancelled = false;

    world.events.on('siteCancelled', ({ id, toTown }) => {
      expect(id).toBe(site.id);
      expect(toTown).toBe(true);
      cancelled = true;
    });
    world.push({ type: 'cancelSite', id: site.id });
    world.tick();

    expect(cancelled).toBe(true);
    expect(world.entities.has(site.id)).toBe(false);
    // L'emprise est libre : on peut y reposer.
    expect(world.chunks.isFree(site.tx, site.ty, site.width, site.height)).toBe(true);

    run(world, 2000, () => expectCoveredPromises(world));

    expect(builders(world).every((worker) => worker.job === null && worker.build === null)).toBe(true);
    expect(hall.store.count('wood')).toBe(woodBefore);
    expect(hall.store.count('wood')).toBe(33);
    expect(hall.store.count('stone')).toBe(20);
  });

  it('le chantier de la mairie ne s’annule pas ; sans mairie, le livré reste au sol', () => {
    const fresh = new World(7);

    fresh.push({ type: 'cancelSite', id: fresh.townHallId });
    fresh.tick();
    expect(fresh.entities.get(fresh.townHallId)?.kind).toBe('site');

    const world = colony({}, [{ proto: 'farm', ...NEAR_A, site: true, delivered: { wood: 4, stone: 2 } }]);
    const site = siteAt(world, NEAR_A);

    world.entities.delete(world.townHallId);
    world.push({ type: 'cancelSite', id: site.id });
    world.tick();

    const piles = [...world.mobiles.values()].filter((mobile) => mobile.kind === 'pickup');

    expect(piles.map((pile) => (pile.kind === 'pickup' ? [pile.item, pile.amount] : null))).toEqual([
      ['wood', 4],
      ['stone', 2],
    ]);
  });

  it('pendant une vague, ils rentrent s’abriter, puis reprennent le chantier', () => {
    const world = colony({}, [YARD, { proto: 'farm', ...NEAR_A, site: true, delivered: BUILDINGS.farm.cost }]);
    const site = siteAt(world, NEAR_A);
    const hall = hallOf(world);

    until(world, () => site.work > 0);

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

    run(world, 400);
    expect(builders(world).every((worker) => worker.inside)).toBe(true);

    const paused = site.work;

    run(world, 50);
    expect(site.work).toBe(paused);

    world.mobiles.delete(9999);
    until(world, () => world.entities.get(site.id)?.kind === 'farm');
  });

  it('une sauvegarde en plein chantier se recharge — charges, marteau, avancement — et la suite est identique', () => {
    const world = colony({ wood: 30, stone: 20 }, [
      YARD,
      { proto: 'farm', ...NEAR_A, site: true, delivered: BUILDINGS.farm.cost },
      { proto: 'farm', ...NEAR_B, site: true },
    ]);
    const ready = siteAt(world, NEAR_A);

    // Un instant où l'un bâtit pendant qu'un autre est parti chercher de quoi livrer.
    const midway = (): boolean =>
      ready.work > 0 && builders(world).some((worker) => worker.job !== null) && builders(world).some((worker) => worker.build !== null);

    until(world, midway);

    const reloaded = decodeSave(encodeSave(world, 1));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);

    const copy = reloaded.world;
    const sites = sitesOf(world);

    expect(builders(copy)).toHaveLength(4);
    expect((copy.entities.get(ready.id) as Site).work).toBe(ready.work);
    expect(builders(copy).map((worker) => worker.build)).toEqual(builders(world).map((worker) => worker.build));
    expectCoveredPromises(copy);
    expect(census(copy, sites)).toEqual(census(world, sites));

    run(world, 3000);
    run(copy, 3000, () => expectCoveredPromises(copy));
    expect(copy.snapshot()).toEqual(world.snapshot());
    expect(copy.entities.get(ready.id)?.kind).toBe('farm');
  });

  it('même seed, même colonie : la même journée de bâtisseur', () => {
    const layout: Placement[] = [
      HOUSE,
      YARD,
      { proto: 'farm', ...NEAR_A, site: true },
      { proto: 'watchtower', ...NEAR_B, site: true },
      { proto: 'farm', ...FAR, site: true },
    ];
    const a = colony({ wood: 60, stone: 30 }, layout);
    const b = colony({ wood: 60, stone: 30 }, layout);

    run(a, 3000);
    run(b, 3000);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('une vieille sauvegarde, d’avant le poste, se relit : ni bâtisseur, ni travail au marteau', () => {
    const world = colony({}, [HOUSE, { proto: 'farm', ...NEAR_A, site: true, delivered: { wood: 2 } }]);
    const file = JSON.parse(encodeSave(world, 1)) as { state: { mobiles: Record<string, unknown>[]; entities: Record<string, unknown>[] } };

    file.state.mobiles = file.state.mobiles.map((mobile) => {
      const old = { ...mobile };

      delete old['builder'];
      delete old['build'];
      return old;
    });
    file.state.entities = file.state.entities.map((entity) => {
      const old = { ...entity };

      delete old['work'];
      return old;
    });

    const reloaded = decodeSave(JSON.stringify(file));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);
    expect(workers(reloaded.world).every((worker) => !worker.builder && worker.build === null)).toBe(true);
    expect(siteAt(reloaded.world, NEAR_A).work).toBe(0);
    expect(siteAt(reloaded.world, NEAR_A).delivered).toEqual({ wood: 2 });
  });

  it('JobBoard : un bâtisseur ne se voit proposer que les chantiers de son rayon, que les porteurs ne voient plus', () => {
    const world = colony({ wood: 40, stone: 20 }, [YARD, { proto: 'farm', ...NEAR_A, site: true }, { proto: 'farm', ...FAR, site: true }]);
    const board = new JobBoard();
    const yard = yardOf(world);
    const door = doorOf(yard);
    const near = at(world, NEAR_A);
    const far = at(world, FAR);

    const job = board.assign(world.entities, world.townHallId, door, door, () => true, BUILDERS.carry, { kind: 'builder', yard });

    expect(job?.to).toBe(near.id);
    expect(job?.from).toBe(world.townHallId);
    expect(board.assign(world.entities, world.townHallId, door, door, () => true)?.to).toBe(far.id);
  });
});
