import { describe, expect, it } from 'vitest';
import { TILE_SIZE, coordKey } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { COLONY } from '../data/inhabitants.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { ENEMIES } from '../data/enemies.ts';
import { LUMBERJACKS, WANDER } from '../data/workers.ts';
import { doorOf } from './jobs.ts';
import { inCutRange, pickTree, treesInRange } from './lumberjacks.ts';
import { ResourceIndex } from './resources.ts';
import { decodeSave, encodeSave, type SavedEntity } from './save.ts';
import { isBuildable, isWalkable, resourceAt, terrainAt } from './terrain.ts';
import type { LumberCamp, Lumberjack, TownHall, Worker } from './types.ts';
import { World } from './world.ts';

interface Spot {
  seed: number;
  /** La mairie, finie, là où la seed l'a mise. */
  hall: { tx: number; ty: number };
  /** Une emprise de 2 × 2 libre, au bord d'un bois. */
  camp: { tx: number; ty: number };
  /** Une emprise libre pour une maison des constructeurs. */
  house: { tx: number; ty: number } | null;
}

/** L'emprise est-elle constructible, nue, et hors de la mairie ? */
function free(seed: number, tx: number, ty: number, taken: { tx: number; ty: number; size: number }[]): boolean {
  for (let y = ty; y < ty + 2; y += 1) {
    for (let x = tx; x < tx + 2; x += 1) {
      if (!isBuildable(terrainAt(seed, x, y)) || resourceAt(seed, x, y)) return false;
      if (taken.some((box) => x >= box.tx - 1 && x < box.tx + box.size + 1 && y >= box.ty - 1 && y < box.ty + box.size + 1)) return false;
    }
  }
  return true;
}

/** Aucune eau entre les deux emprises : les porteurs y vont en ligne droite. */
function dryBetween(seed: number, a: { tx: number; ty: number }, b: { tx: number; ty: number }): boolean {
  for (let ty = Math.min(a.ty, b.ty) - 2; ty <= Math.max(a.ty, b.ty) + 4; ty += 1) {
    for (let tx = Math.min(a.tx, b.tx) - 2; tx <= Math.max(a.tx, b.tx) + 4; tx += 1) {
      if (!isWalkable(terrainAt(seed, tx, ty))) return false;
    }
  }
  return true;
}

/**
 * Une seed où la mairie a, à moins de dix cases, une emprise libre avec au
 * moins douze arbres dans le rayon de coupe — et de la place pour une maison.
 */
function forestSpot(): Spot {
  for (let seed = 1; seed < 300; seed += 1) {
    const world = new World(seed);
    const site = world.entities.get(world.townHallId)!;
    const hall = { tx: site.tx, ty: site.ty };
    const resources = new ResourceIndex(seed);

    for (let dy = -10; dy <= 10; dy += 1) {
      for (let dx = -10; dx <= 10; dx += 1) {
        const camp = { tx: hall.tx + dx, ty: hall.ty + dy };
        const taken = [{ ...hall, size: 3 }];

        if (!free(seed, camp.tx, camp.ty, taken) || !dryBetween(seed, hall, camp)) continue;

        const probe = { ...camp, id: 0, proto: 'lumberCamp', width: 2, height: 2 } as unknown as LumberCamp;

        if (treesInRange(probe, resources).length < 12) continue;

        let house: Spot['house'] = null;

        for (let hy = -6; hy <= 6 && !house; hy += 1) {
          for (let hx = -6; hx <= 6 && !house; hx += 1) {
            const spot = { tx: hall.tx + hx, ty: hall.ty + hy };

            if (free(seed, spot.tx, spot.ty, [...taken, { ...camp, size: 2 }]) && dryBetween(seed, hall, spot)) house = spot;
          }
        }
        if (house) return { seed, hall, camp, house };
      }
    }
  }
  throw new Error('aucune seed boisée — la génération de terrain a changé');
}

const SPOT = forestSpot();

interface Layout {
  /** Stock de départ du coffre de la cabane. */
  campStore?: number;
  /** Une maison des constructeurs, pour vider la cabane. */
  house?: boolean;
  /** Toutes les tuiles du rayon arrachées : plus un arbre à portée. */
  bare?: boolean;
  /** Le crépuscule, plutôt que le jour sans cycle d'une mairie tout juste finie. */
  dusk?: boolean;
}

/** Une colonie posée d'un coup : la mairie finie, la cabane, peut-être une maison — les ouvriers s'installent au chargement. */
function colony(layout: Layout = {}): World {
  const world = new World(SPOT.seed);
  const state = world.snapshot();
  let nextId = state.nextId;
  const campId = nextId++;
  const entities: SavedEntity[] = [
    { kind: 'townHall', id: world.townHallId, proto: 'townHall', ...SPOT.hall, width: 3, height: 3, store: {}, hp: BUILDINGS.townHall.hp, level: 1, paused: false, staff: BUILDINGS.townHall.workers },
    {
      kind: 'lumberCamp',
      id: campId,
      proto: 'lumberCamp',
      ...SPOT.camp,
      width: 2,
      height: 2,
      store: layout.campStore ? { wood: layout.campStore } : {},
      hp: BUILDINGS.lumberCamp.hp,
      level: 1,
      paused: false,
      staff: BUILDINGS.lumberCamp.workers,
    },
  ];

  if (layout.house && SPOT.house) {
    entities.push({ kind: 'house', id: nextId++, proto: 'builderHouse', ...SPOT.house, width: 2, height: 2, store: {}, hp: BUILDINGS.builderHouse.hp, level: 1, paused: false, staff: BUILDINGS.builderHouse.workers });
  }

  if (layout.bare) {
    const resources = new ResourceIndex(SPOT.seed);
    const camp = entities[1] as unknown as LumberCamp;

    for (const tree of treesInRange(camp, resources)) resources.clear(tree.tx, tree.ty);
    state.resources = resources.toJSON();
  }

  if (layout.dusk) {
    state.tick = 100_000;
    state.cycleStartTick = state.tick - DAY_CYCLE.day - 5;
  }

  // Adam loin, immobile : ce sont les bûcherons qu'on regarde.
  state.player = { ...state.player, x: (SPOT.hall.tx - 40) * TILE_SIZE, y: (SPOT.hall.ty - 40) * TILE_SIZE };
  state.entities = entities;
  state.nextId = nextId;
  state.mobiles = [];
  return World.restore(state);
}

function campOf(world: World): LumberCamp {
  const camp = [...world.entities.values()].find((entity): entity is LumberCamp => entity.kind === 'lumberCamp');

  if (!camp) throw new Error('pas de cabane');
  return camp;
}

function hallOf(world: World): TownHall {
  const hall = world.entities.get(world.townHallId);

  if (hall?.kind !== 'townHall') throw new Error('pas de mairie');
  return hall;
}

function lumberjacks(world: World): Lumberjack[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Lumberjack => mobile.kind === 'lumberjack');
}

function porters(world: World): Worker[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Worker => mobile.kind === 'worker' && !mobile.free);
}

/** Tout le bois du monde de test : cabane, mairie, bras des bûcherons, charges des porteurs. */
function woodCensus(world: World): number {
  let wood = 0;

  for (const entity of world.entities.values()) {
    if (entity.kind !== 'site') wood += entity.store.count('wood');
  }
  for (const lumberjack of lumberjacks(world)) wood += lumberjack.load;
  for (const porter of porters(world)) {
    if (porter.job?.carried && porter.job.item === 'wood') wood += porter.job.amount;
  }
  return wood;
}

function run(world: World, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i += 1) {
    world.tick();
    each?.();
  }
}

describe('bûcherons', () => {
  it('la cabane loge ses bûcherons, pris parmi les ouvriers de la colonie', () => {
    const world = colony();

    expect(lumberjacks(world)).toHaveLength(BUILDINGS.lumberCamp.workers);
    expect(lumberjacks(world).every((lumberjack) => lumberjack.homeId === campOf(world).id)).toBe(true);
    expect(world.population().workers).toBe(COLONY.startingWorkers);
    expect(world.workforce().byBuilding).toEqual([{ proto: 'lumberCamp', count: BUILDINGS.lumberCamp.workers }]);
  });

  it('ils coupent les arbres du rayon, seuls, et rangent le bois dans la cabane — sans perte ni duplication', () => {
    const world = colony();
    const camp = campOf(world);
    let chopped = 0;

    world.events.on('treeChopped', ({ tx, ty }) => {
      // Aucun arbre coupé hors du rayon.
      expect(inCutRange(camp, tx, ty), `arbre ${tx},${ty} hors du rayon`).toBe(true);
      chopped += 1;
    });

    run(world, 1500, () => expect(woodCensus(world)).toBe(chopped));

    expect(chopped).toBeGreaterThanOrEqual(LUMBERJACKS.carry * 2);
    expect(camp.store.count('wood')).toBeGreaterThan(0);
  });

  it('abat l’arbre avec la même règle qu’Adam : entamé, puis disparu', () => {
    const world = colony();
    const fallen: string[] = [];

    world.events.on('treeChopped', ({ tx, ty, remaining }) => {
      if (remaining === 0) fallen.push(coordKey(tx, ty));
    });
    run(world, 1500);

    expect(fallen.length).toBeGreaterThan(0);
    for (const key of fallen) {
      const [tx, ty] = key.split(',').map(Number) as [number, number];

      expect(world.resources.at(tx, ty)).toBeNull();
      expect(world.isSolid(tx, ty)).toBe(false);
    }
  });

  it('deux bûcherons ne visent jamais le même arbre', () => {
    const world = colony();
    let together = 0;

    run(world, 3000, () => {
      const trees = lumberjacks(world).flatMap((lumberjack) => (lumberjack.tree ? [coordKey(lumberjack.tree.tx, lumberjack.tree.ty)] : []));

      expect(new Set(trees).size, 'deux bûcherons sur le même arbre').toBe(trees.length);
      if (trees.length === 2) together += 1;
    });

    // Ils étaient bien dehors en même temps.
    expect(together).toBeGreaterThan(0);
  });

  it('va à l’arbre le plus proche de la cabane, et jamais à un arbre réservé', () => {
    const world = colony();
    const camp = campOf(world);
    const door = doorOf(camp);
    const all = treesInRange(camp, world.resources);
    const always = (): boolean => true;
    const first = pickTree(camp, door, world.resources, new Set(), always);

    expect(first).toEqual({ tx: all[0]!.tx, ty: all[0]!.ty });

    const second = pickTree(camp, door, world.resources, new Set([coordKey(first!.tx, first!.ty)]), always);

    expect(second).toEqual({ tx: all[1]!.tx, ty: all[1]!.ty });
    // Plus rien d'atteignable : aucun arbre.
    expect(pickTree(camp, door, world.resources, new Set(), () => false)).toBeNull();
  });

  it('coffre plein : ils attendent devant la cabane, puis repartent quand on le vide', () => {
    const world = colony({ campStore: BUILDINGS.lumberCamp.storage });
    const camp = campOf(world);
    const door = doorOf(camp);
    let chopped = 0;

    world.events.on('treeChopped', () => (chopped += 1));
    run(world, 400);

    expect(chopped).toBe(0);
    for (const lumberjack of lumberjacks(world)) {
      expect(lumberjack.state).toBe('wait');
      // Devant la porte, visibles.
      expect(lumberjack.inside).toBe(false);
      expect(Math.hypot(lumberjack.x - door.x, lumberjack.y - door.y)).toBeLessThan(2);
    }

    world.withdraw(camp.id, 'wood', BUILDINGS.lumberCamp.storage);
    run(world, 1200);
    expect(chopped).toBeGreaterThan(0);
  });

  it('en pause : le bûcheron rapporte le bois qu’il a, puis plus personne ne coupe ; à la reprise, ils repartent', () => {
    const world = colony();
    const camp = campOf(world);
    let chopped = 0;

    world.events.on('treeChopped', () => (chopped += 1));
    // Jusqu'à ce qu'un bûcheron ait du bois dans les bras.
    for (let i = 0; i < 2000 && !lumberjacks(world).some((lumberjack) => lumberjack.load > 0); i += 1) world.tick();
    expect(lumberjacks(world).some((lumberjack) => lumberjack.load > 0)).toBe(true);

    world.push({ type: 'pauseBuilding', id: camp.id, paused: true });
    run(world, 600);

    // Son geste fini : le bois est au coffre, rien dans les bras, et ils flânent.
    const stored = camp.store.count('wood');

    expect(stored).toBe(chopped);
    expect(lumberjacks(world).every((lumberjack) => lumberjack.load === 0 && lumberjack.state === 'idle')).toBe(true);
    run(world, 600);
    expect(chopped).toBe(stored);

    world.push({ type: 'pauseBuilding', id: camp.id, paused: false });
    run(world, 1200);
    expect(chopped).toBeGreaterThan(stored);
  });

  it('de 2 à 1 ouvrier : un seul bûcheron travaille, l’autre redevient libre', () => {
    const world = colony();
    const camp = campOf(world);

    const [first, second] = lumberjacks(world).sort((a, b) => a.id - b.id);

    world.push({ type: 'setWorkers', id: camp.id, count: 1 });
    run(world, 600);

    // Le second a rapporté son bois : un ouvrier libre de la colonie, sous le même id, plus logé à la cabane.
    expect(lumberjacks(world).map((lumberjack) => lumberjack.id)).toEqual([first!.id]);
    expect(world.mobiles.get(second!.id)).toMatchObject({ kind: 'worker', free: true, homeId: world.townHallId });

    const out = new Set<number>();

    run(world, 2000, () => {
      for (const lumberjack of lumberjacks(world)) {
        if (lumberjack.state !== 'idle') out.add(lumberjack.id);
      }
    });

    expect(out).toEqual(new Set([first!.id]));
    expect(world.staffing(camp)).toMatchObject({ wanted: 1, filled: 1 });
    expect(world.workforce()).toMatchObject({ total: COLONY.startingWorkers, assigned: 1, free: COLONY.startingWorkers - 1 });

    // Le poste rendu, un bûcheron revient à la cabane et reprend la hache.
    world.push({ type: 'setWorkers', id: camp.id, count: 2 });
    run(world, 1500, () => {
      for (const lumberjack of lumberjacks(world)) {
        if (lumberjack.state !== 'idle') out.add(lumberjack.id);
      }
    });
    expect(lumberjacks(world)).toHaveLength(2);
    expect(out.size).toBe(2);
  });

  it('les porteurs vident la cabane dans la mairie : tout le bois coupé arrive, rien de plus', () => {
    const world = colony({ house: true });
    let chopped = 0;

    // De quoi boire et manger : un bûcheron mort de soif avec son bois sur le dos le ferait disparaître du compte.
    hallOf(world).store.add('water', 400);
    hallOf(world).store.add('food', 400);
    world.events.on('treeChopped', () => (chopped += 1));
    run(world, 6000, () => expect(woodCensus(world)).toBe(chopped));

    expect(hallOf(world).store.count('wood')).toBeGreaterThan(LUMBERJACKS.carry);
  });

  it('plus d’arbres à portée : la cabane le dit, et ses bûcherons flânent devant', () => {
    const world = colony({ bare: true });
    const camp = campOf(world);
    const door = doorOf(camp);

    expect(world.treesLeft(camp)).toBe(0);
    run(world, 600);

    for (const lumberjack of lumberjacks(world)) {
      expect(lumberjack.state).toBe('idle');
      expect(lumberjack.inside).toBe(false);
      expect(Math.hypot(lumberjack.x - door.x, lumberjack.y - door.y)).toBeLessThanOrEqual(WANDER.radius * TILE_SIZE + 1);
    }
  });

  it('pendant une vague, ils rentrent avec leur bois ; ensuite, ils reprennent', () => {
    const world = colony({ house: true });
    const hall = hallOf(world);

    run(world, 300);
    expect(lumberjacks(world).some((lumberjack) => !lumberjack.inside)).toBe(true);

    const x = (hall.tx + 1.5) * TILE_SIZE;
    const y = (hall.ty - 80) * TILE_SIZE;

    world.mobiles.set(99_999, {
      kind: 'mutant',
      id: 99_999,
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

    const before = woodCensus(world);

    run(world, 500);
    expect(lumberjacks(world).every((lumberjack) => lumberjack.inside)).toBe(true);
    expect(woodCensus(world)).toBe(before);

    world.mobiles.delete(99_999);

    let chopped = 0;

    world.events.on('treeChopped', () => (chopped += 1));
    run(world, 800);
    expect(chopped).toBeGreaterThan(0);
  });

  it('au crépuscule, les bûcherons sans voyage vont dormir — sans maison, dehors devant la cabane', () => {
    const world = colony({ dusk: true });

    run(world, 250);
    for (const lumberjack of lumberjacks(world)) {
      expect(lumberjack.bed).toBeNull();
      expect(lumberjack.inside).toBe(false);
      expect(lumberjack.sleepingOut).toBe(true);
    }
  });

  it('une sauvegarde en pleine coupe se recharge avec ses arbres réservés, et la suite est identique', () => {
    const world = colony({ house: true });

    // En pleine coupe : l'un d'eux a un arbre réservé et du bois dans les bras.
    const chopping = (): boolean => lumberjacks(world).some((lumberjack) => lumberjack.state === 'chop' && lumberjack.load > 0);

    for (let i = 0; i < 2000 && !chopping(); i += 1) world.tick();
    expect(chopping()).toBe(true);

    const reloaded = decodeSave(encodeSave(world, 1));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);

    const copy = reloaded.world;

    expect(woodCensus(copy)).toBe(woodCensus(world));
    expect(campOf(copy).store.freeSpace()).toBe(campOf(world).store.freeSpace());

    run(world, 3000);
    run(copy, 3000);
    expect(copy.snapshot()).toEqual(world.snapshot());
  });

  it('même seed, mêmes commandes : la même journée de bûcheron', () => {
    const a = colony({ house: true });
    const b = colony({ house: true });

    run(a, 2500);
    run(b, 2500);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('une cabane tombée : ses bûcherons quittent la colonie et lâchent leur arbre', () => {
    const world = colony();

    run(world, 300);
    world.entities.delete(campOf(world).id);
    world.tick();

    expect(lumberjacks(world)).toHaveLength(0);
  });

  it('une vieille sauvegarde sans flânerie ni bûcheron se relit', () => {
    const world = colony({ house: true });
    const text = encodeSave(world, 1);
    const file = JSON.parse(text) as { state: { mobiles: Record<string, unknown>[] } };

    file.state.mobiles = file.state.mobiles
      .filter((mobile) => mobile['kind'] !== 'lumberjack')
      .map((mobile) => {
        const old = { ...mobile };

        delete old['wanderX'];
        delete old['wanderY'];
        delete old['wanderTicks'];
        return old;
      });

    const reloaded = decodeSave(JSON.stringify(file));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);
    // La cabane se repeuple au chargement.
    expect(lumberjacks(reloaded.world)).toHaveLength(BUILDINGS.lumberCamp.workers);
    expect(porters(reloaded.world).every((porter) => porter.wanderX === porter.x)).toBe(true);
  });
});
