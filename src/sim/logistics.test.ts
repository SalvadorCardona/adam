import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { COLONY } from '../data/inhabitants.ts';
import { ENEMIES } from '../data/enemies.ts';
import { ITEM_IDS, type ItemId } from '../data/items.ts';
import { RECIPES } from '../data/recipes.ts';
import { JOB_PRIORITY, LOGISTICIANS, PORTERS } from '../data/workers.ts';
import { consumerDemands, consumerTarget } from './consumers.ts';
import { JobBoard, doorOf, inDepotRange } from './jobs.ts';
import { decodeSave, encodeSave, type SavedEntity } from './save.ts';
import { isWalkable, terrainAt } from './terrain.ts';
import type { Depot, Entity, Nursery, TownHall, Worker } from './types.ts';
import { World } from './world.ts';

type Stock = Partial<Record<ItemId, number>>;

/** Un bâtiment de la colonie de test, posé à (dx, dy) tuiles de la mairie. */
interface Placement {
  proto: BuildingId;
  dx: number;
  dy: number;
  /** Coffre de départ d'un producteur. */
  store?: Stock;
  /** Un chantier, pas encore bâti. */
  site?: boolean;
  /** Posé en pause : une ferme qui ne produit pas — on compte ce qui circule. */
  paused?: boolean;
}

/** Le poste, au sud de la mairie : son rayon couvre `NEAR`, pas `FAR`. */
const DEPOT: Placement = { proto: 'logisticsPost', dx: 6, dy: 12 };
const NEAR_A = { dx: 2, dy: 15 };
const NEAR_B = { dx: 10, dy: 17 };
const FAR = { dx: -12, dy: 18 };

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

/**
 * Une colonie posée d'un coup, en retouchant la sauvegarde d'un monde neuf :
 * maisons et postes se peuplent au chargement. Les foreuses sont posées à
 * sec — elles ne produisent rien : on compte ce qui circule.
 */
function colony(hall: Stock, placements: Placement[]): World {
  const { world, hx, hy } = landSeed();
  const state = world.snapshot();
  let nextId = state.nextId;
  const entities: SavedEntity[] = [
    { kind: 'townHall', id: world.townHallId, proto: 'townHall', tx: hx, ty: hy, width: 3, height: 3, store: hall, hp: BUILDINGS.townHall.hp, level: 1, paused: false, staff: 0 },
  ];

  for (const { proto, dx, dy, store = {}, site, paused = false } of placements) {
    const { width, height, hp } = BUILDINGS[proto];
    const placed = { id: nextId++, proto, tx: hx + dx, ty: hy + dy, width, height, store, hp, level: 1, paused, staff: BUILDINGS[proto].workers };

    if (site) {
      entities.push({ id: placed.id, proto, tx: placed.tx, ty: placed.ty, width, height, kind: 'site', delivered: {}, work: 0 });
      continue;
    }

    switch (BUILDINGS[proto].kind) {
      case 'drill':
        entities.push({ ...placed, kind: 'drill', output: null, blocked: true });
        break;
      case 'house':
        entities.push({ ...placed, kind: 'house' });
        break;
      case 'depot':
        entities.push({ ...placed, kind: 'depot' });
        break;
      case 'lumberCamp':
        entities.push({ ...placed, kind: 'lumberCamp' });
        break;
      case 'farm':
        entities.push({ ...placed, kind: 'farm' });
        break;
      case 'nursery':
        // L'heure de la naissance est passée : elle attend sa nourriture.
        entities.push({ ...placed, kind: 'nursery', nextBirthTick: state.tick, born: 0, hungry: true });
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
  const restored = World.restore(state);

  // Bilans exacts des stocks : les libres ne glanent pas.
  restored.gleaning = false;
  return restored;
}

function hallOf(world: World): TownHall {
  const hall = world.entities.get(world.townHallId);

  if (hall?.kind !== 'townHall') throw new Error('pas de mairie');
  return hall;
}

function depotOf(world: World): Depot {
  const depot = [...world.entities.values()].find((entity): entity is Depot => entity.kind === 'depot');

  if (!depot) throw new Error('pas de poste');
  return depot;
}

function workers(world: World): Worker[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Worker => mobile.kind === 'worker' && !mobile.free);
}

function logisticians(world: World): Worker[] {
  return workers(world).filter((worker) => worker.logistician);
}

function porters(world: World): Worker[] {
  return workers(world).filter((worker) => !worker.logistician);
}

/** Le producteur posé à (dx, dy) de la mairie. */
function at(world: World, spot: { dx: number; dy: number }): Entity {
  const hall = hallOf(world);
  const found = [...world.entities.values()].find((entity) => entity.tx === hall.tx + spot.dx && entity.ty === hall.ty + spot.dy);

  if (!found) throw new Error(`rien en ${spot.dx}, ${spot.dy}`);
  return found;
}

function count(entity: Entity, item: ItemId): number {
  return entity.kind === 'site' ? 0 : entity.store.count(item);
}

/** Où se trouve chaque objet : coffres, et charges en main. Rien d'autre n'en crée ni n'en détruit ici. */
function census(world: World): Record<ItemId, number> {
  const total = Object.fromEntries(ITEM_IDS.map((item) => [item, 0])) as Record<ItemId, number>;

  for (const entity of world.entities.values()) {
    if (entity.kind === 'site') continue;
    for (const [item, amount] of entity.store.entries()) total[item] += amount;
  }
  for (const worker of workers(world)) {
    if (worker.job?.carried) total[worker.job.item] += worker.job.amount;
  }
  return total;
}

/** Ce qu'un coffre a promis, c'est exactement ce que les ouvriers en route vont y chercher — jamais plus qu'il n'a. */
function expectCoveredPromises(world: World): void {
  const promised = new Map<string, number>();

  for (const worker of workers(world)) {
    const job = worker.job;

    if (job && !job.carried) promised.set(`${job.from}:${job.item}`, (promised.get(`${job.from}:${job.item}`) ?? 0) + job.amount);
  }
  for (const entity of world.entities.values()) {
    if (entity.kind === 'site') continue;
    for (const item of ITEM_IDS) {
      expect(entity.store.available(item), `${entity.proto} : ${item} promis plus qu'en stock`).toBeGreaterThanOrEqual(0);
      expect(entity.store.count(item) - entity.store.available(item)).toBe(promised.get(`${entity.id}:${item}`) ?? 0);
    }
  }
}

function run(world: World, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i += 1) {
    world.tick();
    each?.();
  }
}

describe('poste de logistique', () => {
  it('loge quatre logisticiens, pris parmi les ouvriers de la colonie', () => {
    const world = colony({}, [DEPOT]);

    expect(logisticians(world)).toHaveLength(BUILDINGS.logisticsPost.workers);
    expect(BUILDINGS.logisticsPost.workers).toBe(4);
    expect(logisticians(world).every((worker) => worker.homeId === depotOf(world).id)).toBe(true);
    expect(world.population().workers).toBe(COLONY.startingWorkers);
    expect(world.workforce()).toMatchObject({ total: COLONY.startingWorkers, assigned: 4 });
  });

  it('portent un peu plus qu’un porteur', () => {
    expect(LOGISTICIANS.carry).toBeGreaterThan(PORTERS.carry);
  });

  it('le rayon se mesure du centre du poste au centre du producteur', () => {
    const world = colony({}, [DEPOT, { proto: 'drill', ...NEAR_A }, { proto: 'drill', ...FAR }]);
    const depot = depotOf(world);
    const edge = { width: 2, height: 2, tx: depot.tx, ty: depot.ty + LOGISTICIANS.radius };

    expect(inDepotRange(depot, at(world, NEAR_A))).toBe(true);
    expect(inDepotRange(depot, at(world, FAR))).toBe(false);
    // Pile au bord : dedans ; une tuile plus loin : dehors.
    expect(inDepotRange(depot, edge)).toBe(true);
    expect(inDepotRange(depot, { ...edge, ty: edge.ty + 1 })).toBe(false);
    expect(world.depotProducers(depot)).toBe(1);
  });

  it('cabane → poste → mairie : les logisticiens vident la cabane, le stock de la ville monte', () => {
    const world = colony({}, [DEPOT, { proto: 'lumberCamp', ...NEAR_A, store: { wood: 20 } }]);
    const camp = at(world, NEAR_A);
    let delivered = 0;

    world.events.on('porterDelivered', ({ workerId, id, item, amount }) => {
      expect(world.mobiles.get(workerId)?.kind === 'worker' && (world.mobiles.get(workerId) as Worker).logistician).toBe(true);
      expect(id).toBe(world.townHallId);
      expect(item).toBe('wood');
      delivered += amount;
    });

    run(world, 1500);

    expect(delivered).toBeGreaterThanOrEqual(20);
    expect(hallOf(world).store.count('wood')).toBe(delivered);
    expect(count(camp, 'wood')).toBeLessThan(LOGISTICIANS.carry);
  });

  it('vide les producteurs du rayon sans rien perdre ni dupliquer, et sans jamais promettre deux fois', () => {
    const world = colony({}, [
      DEPOT,
      { proto: 'drill', ...NEAR_A, store: { ironOre: 20 } },
      { proto: 'drill', ...NEAR_B, store: { ironOre: 13, coal: 4 } },
    ]);
    const before = census(world);

    run(world, 3000, () => {
      expect(census(world)).toEqual(before);
      expectCoveredPromises(world);
    });

    expect(hallOf(world).store.count('ironOre')).toBe(33);
    expect(hallOf(world).store.count('coal')).toBe(4);
    expect(count(at(world, NEAR_A), 'ironOre') + count(at(world, NEAR_B), 'ironOre')).toBe(0);
  }, 30_000);

  it('va d’abord au coffre le plus rempli, même plus loin', () => {
    const world = colony({}, [
      DEPOT,
      { proto: 'drill', ...NEAR_A, store: { ironOre: 12 } },
      { proto: 'drill', ...NEAR_B, store: { ironOre: 20 } },
    ]);
    const full = at(world, NEAR_B);
    const depot = depotOf(world);
    const door = doorOf(depot);
    const near = doorOf(at(world, NEAR_A));
    const far = doorOf(full);

    // La foreuse pleine est bien la plus loin du poste.
    expect(Math.hypot(far.x - door.x, far.y - door.y)).toBeGreaterThan(Math.hypot(near.x - door.x, near.y - door.y));

    run(world, 2);

    const first = logisticians(world).find((worker) => worker.job !== null);

    expect(first?.job?.from).toBe(full.id);
    expect(first?.job?.to).toBe(world.townHallId);
    expect(first?.job?.amount).toBe(LOGISTICIANS.carry);
  });

  it('deux logisticiens ne vont pas vider le même coffre s’il n’y a pas de quoi faire deux voyages', () => {
    const world = colony({}, [DEPOT, { proto: 'drill', ...NEAR_A, store: { ironOre: 3 } }]);
    const drill = at(world, NEAR_A);
    let most = 0;

    run(world, 400, () => {
      const onIt = logisticians(world).filter((worker) => worker.job?.from === drill.id && !worker.job.carried).length;

      most = Math.max(most, onIt);
    });

    expect(most).toBe(1);
    expect(hallOf(world).store.count('ironOre')).toBe(3);
  });

  it('le partage : un producteur du rayon est au poste, les porteurs ne vident que ceux qu’aucun poste ne couvre', () => {
    const world = colony({}, [
      { proto: 'builderHouse', dx: -6, dy: 5 },
      DEPOT,
      { proto: 'drill', ...NEAR_A, store: { ironOre: 20 } },
      { proto: 'drill', ...FAR, store: { coal: 20 } },
    ]);
    const near = at(world, NEAR_A);
    const far = at(world, FAR);

    run(world, 3000, () => {
      for (const worker of porters(world)) expect(worker.job?.from).not.toBe(near.id);
      for (const worker of logisticians(world)) expect(worker.job?.from).not.toBe(far.id);
    });

    // Chacun a fait sa part : tout est à la mairie.
    expect(hallOf(world).store.count('ironOre')).toBe(20);
    expect(hallOf(world).store.count('coal')).toBe(20);
  });

  it('les porteurs livrent toujours les chantiers, un poste à côté', () => {
    const world = colony({ wood: 40, stone: 40 }, [
      { proto: 'builderHouse', dx: -6, dy: 5 },
      DEPOT,
      { proto: 'drill', ...NEAR_A, store: { ironOre: 20 } },
      // Le chantier est dans le rayon du poste : ce n'est pas l'affaire des logisticiens.
      { proto: 'farm', dx: 7, dy: 8, site: true },
    ]);
    const farm = [...world.entities.values()].find((entity) => entity.proto === 'farm');

    expect(farm?.kind).toBe('site');
    run(world, 3000, () => {
      for (const worker of logisticians(world)) expect(worker.job?.to ?? world.townHallId).toBe(world.townHallId);
    });

    expect(world.entities.get(farm!.id)?.kind).toBe('farm');
    expect(hallOf(world).store.count('ironOre')).toBe(20);
  });

  it('rien à transporter : ils flânent autour du poste ; pendant une vague, ils rentrent avec leur charge', () => {
    const world = colony({}, [DEPOT, { proto: 'drill', ...NEAR_A, store: { ironOre: 20 } }]);
    const hall = hallOf(world);

    // Ils viennent de la mairie, libres : le temps de rejoindre la foreuse.
    for (let i = 0; i < 600 && !logisticians(world).some((worker) => worker.job?.carried); i += 1) world.tick();
    expect(logisticians(world).some((worker) => worker.job?.carried)).toBe(true);

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
    expect(logisticians(world).every((worker) => worker.inside)).toBe(true);
    expect(census(world)).toEqual(before);

    world.mobiles.delete(9999);
    run(world, 3000);
    expect(hallOf(world).store.count('ironOre')).toBe(20);
    // Plus rien à porter : ils sont dehors, à deux pas de leur porte.
    run(world, 300);

    const door = doorOf(depotOf(world));

    expect(logisticians(world).every((worker) => !worker.inside && worker.job === null)).toBe(true);
    expect(logisticians(world).every((worker) => Math.hypot(worker.x - door.x, worker.y - door.y) < 4 * TILE_SIZE)).toBe(true);
  });

  it('un poste tombé : ses logisticiens posent leur charge à la mairie, puis quittent la colonie', () => {
    const world = colony({}, [DEPOT, { proto: 'drill', ...NEAR_A, store: { ironOre: 20 } }]);
    const before = census(world);

    run(world, 60);
    world.entities.delete(depotOf(world).id);
    run(world, 2000);

    expect(logisticians(world)).toHaveLength(0);
    // Ce qui était en main est arrivé ; le reste attend dans la foreuse.
    expect(census(world)).toEqual(before);
  });

  it('une sauvegarde en plein transport se recharge avec ses réservations, et la suite est identique', () => {
    const world = colony({}, [
      DEPOT,
      { proto: 'drill', ...NEAR_A, store: { ironOre: 20 } },
      { proto: 'drill', ...NEAR_B, store: { ironOre: 12 } },
    ]);

    // Un instant où l'un porte sa charge pendant qu'un autre va chercher la sienne.
    const midway = (): boolean =>
      logisticians(world).some((worker) => worker.job?.carried) &&
      logisticians(world).some((worker) => worker.job && !worker.job.carried);

    for (let i = 0; i < 600 && !midway(); i += 1) world.tick();
    expect(midway()).toBe(true);

    const reloaded = decodeSave(encodeSave(world, 1));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);

    const copy = reloaded.world;

    copy.gleaning = false;

    expect(logisticians(copy)).toHaveLength(4);
    expectCoveredPromises(copy);
    expect(census(copy)).toEqual(census(world));

    run(world, 2000);
    run(copy, 2000, () => expectCoveredPromises(copy));
    expect(copy.snapshot()).toEqual(world.snapshot());
    expect(hallOf(copy).store.count('ironOre')).toBe(32);
  });

  it('même seed, même colonie : la même journée de logisticien', () => {
    const layout: Placement[] = [DEPOT, { proto: 'lumberCamp', ...NEAR_A, store: { wood: 18 } }, { proto: 'drill', ...NEAR_B, store: { ironOre: 20 } }];
    const a = colony({}, layout);
    const b = colony({}, layout);

    run(a, 2500);
    run(b, 2500);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('une vieille sauvegarde, d’avant le poste, se relit : ses ouvriers sont des porteurs', () => {
    const world = colony({}, [{ proto: 'builderHouse', dx: -6, dy: 5 }]);
    const file = JSON.parse(encodeSave(world, 1)) as { state: { mobiles: Record<string, unknown>[] } };

    file.state.mobiles = file.state.mobiles.map((mobile) => {
      const old = { ...mobile };

      delete old['logistician'];
      return old;
    });

    const reloaded = decodeSave(JSON.stringify(file));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);
    expect(workers(reloaded.world)).toHaveLength(BUILDINGS.builderHouse.workers);
    expect(workers(reloaded.world).every((worker) => !worker.logistician)).toBe(true);
  });

  it('JobBoard : sans poste pour lui, un logisticien ne se voit rien proposer hors de son rayon', () => {
    const world = colony({}, [DEPOT, { proto: 'drill', ...FAR, store: { ironOre: 20 } }]);
    const board = new JobBoard();
    const depot = depotOf(world);
    const door = doorOf(depot);

    const job = board.assign(world.entities, world.townHallId, door, door, () => true, LOGISTICIANS.carry, { kind: 'logistician', depot });

    expect(job).toBeNull();
    // Le porteur, lui, la vide : aucun poste ne la couvre.
    expect(board.assign(world.entities, world.townHallId, door, door, () => true)?.from).toBe(at(world, FAR).id);
  });
});

describe('la nurserie, destination de livraison', () => {
  const NURSERY: Placement = { proto: 'nursery', ...NEAR_A };
  const BIRTH = RECIPES.raiseChild.inputs.food;

  function nurseryOf(world: World): Nursery {
    const nursery = [...world.entities.values()].find((entity): entity is Nursery => entity.kind === 'nursery');

    if (!nursery) throw new Error('pas de nurserie');
    return nursery;
  }

  /** Les comptes, relevés un tick sur cinq : assez pour voir une fuite, sans tout recompter à chaque pas. */
  function every5(check: () => void): () => void {
    let tick = 0;

    return () => {
      tick += 1;
      if (tick % 5 === 0) check();
    };
  }

  function kids(world: World): number {
    return [...world.mobiles.values()].filter((mobile) => mobile.kind === 'kid').length;
  }

  it('demande sous son stock visé : la différence, en famine d’abord ; rien au-dessus, rien en pause', () => {
    const world = colony({}, [DEPOT, NURSERY]);
    const nursery = nurseryOf(world);
    const target = BUILDINGS.nursery.demand.food;

    expect(consumerTarget(nursery, 'food')).toBe(target);
    expect(consumerDemands(nursery)).toEqual([{ item: 'food', amount: target, priority: JOB_PRIORITY.starving }]);

    nursery.store.add('food', BIRTH + 2);
    expect(consumerDemands(nursery)).toEqual([{ item: 'food', amount: target - BIRTH - 2, priority: JOB_PRIORITY.refill }]);

    // Ce qui est déjà en route ne se demande pas deux fois.
    nursery.store.reserveIn('food', 3);
    expect(consumerDemands(nursery)).toEqual([{ item: 'food', amount: target - BIRTH - 5, priority: JOB_PRIORITY.refill }]);
    nursery.store.releaseIn('food', 3);

    nursery.store.add('food', target);
    expect(consumerDemands(nursery)).toEqual([]);

    nursery.store.remove('food', target);
    nursery.paused = true;
    expect(consumerDemands(nursery)).toEqual([]);
  });

  it('les logisticiens la nourrissent depuis la mairie, sans porteur : son stock monte, l’enfant naît — rien de perdu ni de dupliqué', () => {
    const food = BUILDINGS.nursery.demand.food + BIRTH + 4;
    const world = colony({ food }, [DEPOT, NURSERY]);
    const nursery = nurseryOf(world);
    let seen = false;

    expect(porters(world)).toHaveLength(0);
    run(world, 1500, every5(() => {
      seen ||= logisticians(world).some((worker) => worker.job?.carried && worker.job.to === nursery.id && worker.job.item === 'food');
      expect(census(world).food + BIRTH * kids(world)).toBe(food);
      expectCoveredPromises(world);
      // Jamais plus en route que ce qui manque à son stock visé.
      expect(nursery.store.count('food') + nursery.store.expected('food')).toBeLessThanOrEqual(BUILDINGS.nursery.demand.food + BIRTH);
    }));

    expect(seen).toBe(true);
    expect(kids(world)).toBe(1);
    expect(nursery.born).toBe(1);
    // Le repas pris, elle refait son stock visé.
    expect(nursery.store.count('food')).toBe(BUILDINGS.nursery.demand.food);
    expect(hallOf(world).store.count('food')).toBe(food - BIRTH - BUILDINGS.nursery.demand.food);
  });

  it('nourrir la nurserie passe avant vider un coffre plein', () => {
    const world = colony({ food: 12 }, [DEPOT, NURSERY, { proto: 'lumberCamp', ...NEAR_B, store: { wood: 20 } }]);

    for (let i = 0; i < 20 && !logisticians(world).some((worker) => worker.job); i += 1) world.tick();

    const first = logisticians(world).find((worker) => worker.job !== null);

    expect(first?.job?.to).toBe(nurseryOf(world).id);
    expect(first?.job?.priority).toBe(JOB_PRIORITY.starving);
    expect(JOB_PRIORITY.site).toBeGreaterThanOrEqual(JOB_PRIORITY.starving);
    expect(JOB_PRIORITY.refill).toBeGreaterThan(JOB_PRIORITY.empty);
  });

  it('sans nourriture nulle part, elle attend — bulle d’alerte — et les logisticiens vident le reste', () => {
    const world = colony({}, [DEPOT, NURSERY, { proto: 'lumberCamp', ...NEAR_B, store: { wood: 20 } }]);
    const nursery = nurseryOf(world);

    run(world, 600);

    expect(nursery.store.isEmpty()).toBe(true);
    expect(nursery.hungry).toBe(true);
    expect(world.problem(nursery)).toBe('starved');
    expect(world.supplyStatus(nursery)).toMatchObject({ item: 'food', inTown: 0, coming: false });
    // La logistique ne s'est pas arrêtée pour autant.
    expect(hallOf(world).store.count('wood')).toBeGreaterThan(0);

    // La nourriture arrive en ville : la livraison part, l'alerte s'efface.
    hallOf(world).store.add('food', BIRTH);
    run(world, 900);
    expect(kids(world)).toBe(1);
    expect(world.problem(nursery)).toBeNull();
  });

  it('une ferme voisine la sert directement, sans passer par la mairie', () => {
    const world = colony({}, [DEPOT, NURSERY, { proto: 'farm', dx: 6, dy: 16, store: { food: 10 }, paused: true }]);
    const nursery = nurseryOf(world);

    run(world, 1500, every5(() => {
      expect(census(world).food + BIRTH * kids(world)).toBe(10);
      expectCoveredPromises(world);
    }));

    expect(kids(world)).toBe(1);
    expect(nursery.store.count('food')).toBe(10 - BIRTH);
  });

  it('deux nurseries, un stock trop court : jamais promis deux fois, rien de perdu', () => {
    const world = colony({ food: 9 }, [DEPOT, NURSERY, { proto: 'nursery', ...NEAR_B }]);

    run(world, 1500, every5(() => {
      expect(census(world).food + BIRTH * kids(world)).toBe(9);
      expect(hallOf(world).store.available('food')).toBeGreaterThanOrEqual(0);
      expectCoveredPromises(world);
    }));
    expect(kids(world)).toBe(1);
  });

  it('une sauvegarde en pleine livraison — même d’une ancienne priorité — se recharge, et la suite est identique', () => {
    const world = colony({ food: 12 }, [DEPOT, NURSERY]);
    const nursery = nurseryOf(world);
    const carrying = (): boolean => logisticians(world).some((worker) => worker.job?.carried && worker.job.to === nursery.id);

    for (let i = 0; i < 600 && !carrying(); i += 1) world.tick();
    expect(carrying()).toBe(true);

    const reloaded = decodeSave(encodeSave(world, 1));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);
    expect(nurseryOf(reloaded.world).store.expected('food')).toBe(nursery.store.expected('food'));
    expectCoveredPromises(reloaded.world);

    // Une sauvegarde d'avant : ses jobs portent les anciennes priorités (0 à 2), toutes encore valides.
    const file = JSON.parse(encodeSave(world, 1)) as { state: { mobiles: { job?: { priority: number } | null }[] } };

    for (const mobile of file.state.mobiles) if (mobile.job) mobile.job.priority = 2;

    const old = decodeSave(JSON.stringify(file));

    if (!old.ok) throw new Error(`vieille sauvegarde refusée : ${old.reason}`);

    run(world, 1200);
    reloaded.world.gleaning = false;
    run(reloaded.world, 1200, every5(() => expectCoveredPromises(reloaded.world)));
    run(old.world, 1200);
    expect(reloaded.world.snapshot()).toEqual(world.snapshot());
    expect(kids(old.world)).toBe(1);
    expect(kids(world)).toBe(1);
  });

  it('même seed, même colonie : les mêmes livraisons', () => {
    const layout: Placement[] = [DEPOT, NURSERY, { proto: 'lumberCamp', ...NEAR_B, store: { wood: 18 } }];
    const a = colony({ food: 20 }, layout);
    const b = colony({ food: 20 }, layout);

    run(a, 2000);
    run(b, 2000);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});
