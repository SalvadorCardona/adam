import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { AGES, COLONY } from '../data/inhabitants.ts';
import type { ItemId } from '../data/items.ts';
import { NEEDS } from '../data/needs.ts';
import { RECIPES, recipeOf } from '../data/recipes.ts';
import { doorOf } from './jobs.ts';
import { canGrow, deprivedNeed, drainNeeds, fullNeeds, needState, needsPace, pacedTick, stuntingNeed, urgentNeed } from './needs.ts';
import { freshNeeds } from './needs.ts';
import { decodeSave, encodeSave, type SavedEntity } from './save.ts';
import { isWalkable, terrainAt, touchesWater } from './terrain.ts';
import type { Entity, Kid, Mobile, Worker } from './types.ts';
import { World } from './world.ts';

type Stock = Partial<Record<ItemId, number>>;

const HUNGER = NEEDS.hunger;

/** Une seed dont la mairie a une plaine sans eau au sud. */
function landSeed(): { world: World; hx: number; hy: number } {
  for (let seed = 1; seed < 400; seed += 1) {
    const world = new World(seed);
    const hall = world.entities.get(world.townHallId)!;
    let dry = true;

    for (let ty = hall.ty - 1; ty < hall.ty + 16 && dry; ty += 1) {
      for (let tx = hall.tx - 10; tx < hall.tx + 10 && dry; tx += 1) {
        if (!isWalkable(terrainAt(world.seed, tx, ty))) dry = false;
      }
    }
    if (dry) return { world, hx: hall.tx, hy: hall.ty };
  }
  throw new Error('aucune seed testable — la génération de terrain a changé');
}

/** Une colonie posée d'un coup : mairie (et son stock), nurserie, maison des constructeurs, un enfant de 12 ans. */
function colony(town: Stock): World {
  const { world, hx, hy } = landSeed();
  const state = world.snapshot();
  let nextId = state.nextId;
  const at = (proto: 'nursery' | 'builderHouse', dx: number, dy: number) => ({
    id: nextId++,
    proto,
    tx: hx + dx,
    ty: hy + dy,
    width: BUILDINGS[proto].width,
    height: BUILDINGS[proto].height,
  });
  const built = { hp: 100, level: 1, paused: false };
  const nursery = at('nursery', -5, 5);
  const entities: SavedEntity[] = [
    { kind: 'townHall', id: world.townHallId, proto: 'townHall', tx: hx, ty: hy, width: 3, height: 3, store: town, ...built, hp: BUILDINGS.townHall.hp, staff: 0 },
    // En pause : elle n'appelle pas la nourriture de la ville pour ses naissances.
    { ...nursery, kind: 'nursery', store: {}, ...built, paused: true, staff: BUILDINGS.nursery.workers, nextBirthTick: state.tick + 1_000_000, born: 1, hungry: false },
    { ...at('builderHouse', 2, 6), kind: 'house', store: {}, ...built, staff: BUILDINGS.builderHouse.workers },
  ];
  const x = (nursery.tx + 1) * TILE_SIZE;
  const y = (nursery.ty + nursery.height + 1) * TILE_SIZE;
  const mobiles: Mobile[] = [
    { kind: 'kid', id: state.nextMobileId, sex: 'female', age: 12, x, y, prevX: x, prevY: y, facing: 'down', moving: false, homeId: nursery.id, homeX: x, homeY: y, dirX: 0, dirY: 0, wanderTicks: 0, ...freshNeeds() },
  ];

  // Adam à l'écart, immobile.
  state.player = { ...state.player, x: (hx - 20) * TILE_SIZE, y: (hy - 20) * TILE_SIZE };
  state.entities = entities;
  state.nextId = nextId;
  state.mobiles = mobiles;
  state.nextMobileId += mobiles.length;
  state.tick = Math.max(state.tick, 1);
  state.cycleStartTick = state.tick;
  return World.restore(state);
}

function kid(world: World): Kid {
  return [...world.mobiles.values()].find((mobile): mobile is Kid => mobile.kind === 'kid')!;
}

function workers(world: World): Worker[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Worker => mobile.kind === 'worker' && !mobile.free);
}

/** Pose un chantier : Adam s'en approche le temps de la pose, puis retourne à l'écart. */
function place(world: World, tx: number, ty: number): void {
  const { x, y } = world.player;

  world.player.x = world.player.prevX = tx * TILE_SIZE;
  world.player.y = world.player.prevY = (ty + 3) * TILE_SIZE;
  world.push({ type: 'placeBuilding', building: 'watchtower', tx, ty });
  world.tick();
  world.player.x = world.player.prevX = x;
  world.player.y = world.player.prevY = y;
  expect([...world.entities.values()].some((entity) => entity.kind === 'site' && entity.proto === 'watchtower')).toBe(true);
}

function run(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) world.tick();
}

/** Avance l'horloge jusqu'au tick qui précède l'aube, sans traverser la nuit et ses vagues. */
function toDawn(world: World): void {
  const clock = world.clock()!;

  world.cycleStartTick -= DAY_CYCLE.day + DAY_CYCLE.dusk + DAY_CYCLE.night - clock.offset - 1;
  world.tick();
  expect(world.clock()?.phase).toBe('dawn');
}

describe('jauges', () => {
  it('baissent avec le temps, plus vite au travail qu’au repos', () => {
    const resting = fullNeeds();
    const working = fullNeeds();

    for (let i = 0; i < 600; i += 1) {
      drainNeeds(resting, false);
      drainNeeds(working, true);
    }
    expect(resting.hunger).toBeCloseTo(1 - 600 / HUNGER.restTicks);
    expect(working.hunger).toBeCloseTo(1 - 600 / HUNGER.workTicks);
    expect(working.hunger).toBeLessThan(resting.hunger);
  });

  it('disent rassasié, a faim, affamé — et l’allure qui va avec', () => {
    expect(needState('hunger', 1)).toBe('sated');
    expect(needState('hunger', HUNGER.seekBelow - 0.01)).toBe('wanting');
    expect(needState('hunger', HUNGER.weakBelow - 0.01)).toBe('deprived');
    expect(urgentNeed({ hunger: 1, thirst: 1 })).toBeNull();
    expect(urgentNeed({ hunger: 0.2, thirst: 1 })).toBe('hunger');
    expect(needsPace({ hunger: 0.2, thirst: 1 })).toBe(1);
    expect(needsPace({ hunger: HUNGER.weakBelow / 2, thirst: 1 })).toBe(HUNGER.weakPace);
    expect(needsPace({ hunger: 0, thirst: 1 })).toBe(0);
    expect(canGrow({ hunger: 1, thirst: 1 })).toBe(true);
    expect(canGrow({ hunger: 0.2, thirst: 1 })).toBe(false);
  });

  it('un affamé à mi-allure ne compte qu’un tick sur deux', () => {
    const counted = Array.from({ length: 100 }, (_, tick) => pacedTick(tick, 0.5)).filter(Boolean).length;

    expect(counted).toBe(50);
    expect(pacedTick(7, 1)).toBe(true);
  });
});

describe('faim', () => {
  it('baisse avec le temps de jeu pour chaque ouvrier et chaque enfant', () => {
    const world = colony({ food: 10 });

    run(world, 200);
    for (const mobile of [kid(world), ...workers(world)]) {
      expect(mobile.needs.hunger).toBeLessThan(1);
      expect(mobile.needs.hunger).toBeGreaterThan(0.9);
    }
  });

  it('un ouvrier qui a faim va manger à la mairie, remonte sa jauge, et la ville compte un repas de moins', () => {
    const world = colony({ food: 10 });
    const worker = workers(world)[0]!;
    let met = 0;

    world.events.on('needMet', ({ id }) => {
      if (id === worker.id) met += 1;
    });
    worker.needs.hunger = HUNGER.seekBelow - 0.05;

    for (let i = 0; i < 20 * 30 && met === 0; i += 1) {
      world.tick();
      if (worker.meal) expect(world.townStock()!.available('food')).toBe(10 - HUNGER.meal);
    }

    const door = doorOf(world.warehouse()!);

    expect(met).toBe(1);
    expect(worker.needs.hunger).toBe(1);
    expect(worker.meal).toBeNull();
    expect(Math.hypot(worker.x - door.x, worker.y - door.y)).toBeLessThan(1);
    expect(world.townStock()!.count('food')).toBe(10 - HUNGER.meal);
  });

  it('interrompt son transport pour manger, puis le reprend : rien de perdu', () => {
    const world = colony({ food: 10, stone: 0 });

    // Un chantier proche à livrer en pierre, de la pierre en ville : les porteurs partent.
    world.townStock()!.add('stone', 30);
    const hall = world.warehouse()!;

    place(world, hall.tx + 6, hall.ty - 4);
    for (let i = 0; i < 20 * 20 && !workers(world).some((mobile) => mobile.job); i += 1) world.tick();

    const worker = workers(world).find((mobile) => mobile.job)!;

    expect(worker.job).not.toBeNull();

    const job = { ...worker.job! };

    worker.needs.hunger = HUNGER.seekBelow - 0.05;
    for (let i = 0; i < 20 * 30 && worker.needs.hunger < 1; i += 1) world.tick();

    expect(worker.needs.hunger).toBe(1);
    // Il a gardé son job — ses réservations avec — et repart le finir.
    expect(worker.job).toMatchObject({ from: job.from, to: job.to, item: job.item, amount: job.amount });
  });

  it('sans nourriture, il ralentit sous le seuil, puis s’arrête à bout', () => {
    const world = colony({});
    const hall = world.warehouse()!;

    // Rien à manger en ville : on donne aux porteurs une destination lointaine pour les voir marcher.
    place(world, hall.tx + 12, hall.ty + 8);
    world.townStock()!.add('stone', 30);
    for (let i = 0; i < 20 * 20 && !workers(world).some((mobile) => mobile.job); i += 1) world.tick();

    const worker = workers(world).find((mobile) => mobile.job)!;

    expect(worker).toBeDefined();

    const stride = (): number => {
      const { x, y } = worker;

      world.tick();
      return Math.hypot(worker.x - x, worker.y - y);
    };

    const fed = stride();

    worker.needs.hunger = HUNGER.weakBelow / 2;
    const weak = stride();

    expect(fed).toBeGreaterThan(0);
    expect(weak).toBeCloseTo(fed * HUNGER.weakPace, 5);
    expect(worker.meal).toBeNull();

    worker.needs.hunger = 0;
    const { x, y } = worker;

    run(world, 100);
    expect([worker.x, worker.y]).toEqual([x, y]);
    expect(worker.moving).toBe(false);
    // Le job attend : il le reprendra rassasié.
    expect(worker.job).not.toBeNull();

    // De quoi manger arrive en ville : il se traîne jusqu'à la mairie, et repart.
    world.townStock()!.add('food', 5);
    for (let i = 0; i < 20 * 60 && worker.needs.hunger < 1; i += 1) world.tick();
    expect(worker.needs.hunger).toBe(1);
  });

  it('un enfant affamé ne grandit pas à l’aube ; rassasié, il prend son année', () => {
    const hungry = colony({});

    kid(hungry).needs.hunger = HUNGER.seekBelow - 0.1;
    toDawn(hungry);
    expect(kid(hungry).age).toBe(12);

    const fed = colony({});

    toDawn(fed);
    expect(kid(fed).age).toBe(12 + AGES.yearsPerCycle);
  });

  it('un enfant qui a faim va manger à la mairie lui aussi', () => {
    const world = colony({ food: 3 });
    const child = kid(world);

    child.needs.hunger = HUNGER.seekBelow - 0.05;
    for (let i = 0; i < 20 * 60 && child.needs.hunger < 1; i += 1) world.tick();

    expect(child.needs.hunger).toBe(1);
    expect(world.townStock()!.count('food')).toBe(3 - HUNGER.meal);
  });

  it('la mairie bâtie, la ville a de quoi nourrir ses premiers ouvriers', () => {
    const world = new World(7);
    const hall = world.entities.get(world.townHallId)!;

    if (hall.kind !== 'site') throw new Error('la mairie n’est pas en chantier');
    // Tout livré sauf une pierre : Adam l'apporte, le chantier s'achève.
    hall.delivered = { ...BUILDINGS.townHall.cost, stone: BUILDINGS.townHall.cost.stone - 1 };
    world.player.inventory.add('stone', 1);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    expect(world.townStock()?.count('food')).toBe(COLONY.startingStock.food);
    expect(world.townStock()?.count('water')).toBe(COLONY.startingStock.water);
  });
});

describe('alerte de la ville', () => {
  it('se lève quand quelqu’un a faim et qu’il n’y a plus rien à manger', () => {
    const world = colony({});

    expect(world.needAlert()).toBeNull();
    workers(world)[0]!.needs.hunger = HUNGER.seekBelow - 0.05;
    expect(world.needAlert()).toMatchObject({ need: 'hunger', item: 'food', wanting: 1, minutes: 0 });
    expect(world.wantingInhabitants().map((mobile) => mobile.id)).toEqual([workers(world)[0]!.id]);

    world.townStock()!.add('food', 50);
    expect(world.needAlert()).toBeNull();
  });
});

describe('faim — sauvegarde', () => {
  it('les jauges et le repas en route se sauvegardent ; la part réservée se rejoue', () => {
    const world = colony({ food: 10 });
    const worker = workers(world)[0]!;

    worker.needs.hunger = HUNGER.seekBelow - 0.05;
    for (let i = 0; i < 40 && !worker.meal; i += 1) world.tick();
    expect(worker.meal).toBe('hunger');

    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);

    const loaded = decoded.world.mobiles.get(worker.id) as Worker;

    expect(loaded.needs.hunger).toBeCloseTo(worker.needs.hunger);
    expect(loaded.meal).toBe('hunger');
    expect(decoded.world.townStock()!.available('food')).toBe(10 - HUNGER.meal);
  });

  it('une ancienne sauvegarde, sans jauges, démarre avec des habitants rassasiés', () => {
    const world = colony({ food: 10 });
    const file = JSON.parse(encodeSave(world, 0)) as { state: { mobiles: Record<string, unknown>[] } };

    for (const mobile of file.state.mobiles) {
      delete mobile['needs'];
      delete mobile['meal'];
    }

    const decoded = decodeSave(JSON.stringify(file));

    if (!decoded.ok) throw new Error(decoded.reason);

    const people = [...decoded.world.mobiles.values()].filter((mobile) => mobile.kind === 'kid' || mobile.kind === 'worker');

    expect(people.length).toBeGreaterThan(1);
    for (const mobile of people) expect(mobile).toMatchObject({ needs: { hunger: 1 }, meal: null });
  });
});

const THIRST = NEEDS.thirst;

describe('soif', () => {
  it('baisse plus vite que la faim, au travail comme au repos', () => {
    const resting = fullNeeds();
    const working = fullNeeds();

    for (let i = 0; i < 600; i += 1) {
      drainNeeds(resting, false);
      drainNeeds(working, true);
    }
    expect(resting.thirst).toBeCloseTo(1 - 600 / THIRST.restTicks);
    expect(working.thirst).toBeLessThan(resting.thirst);
    expect(resting.thirst).toBeLessThan(resting.hunger);
    expect(working.thirst).toBeLessThan(working.hunger);
  });

  it('baisse avec le temps de jeu pour chaque ouvrier et chaque enfant', () => {
    const world = colony({ food: 10, water: 10 });

    run(world, 200);
    for (const mobile of [kid(world), ...workers(world)]) {
      expect(mobile.needs.thirst).toBeLessThan(1);
      expect(mobile.needs.thirst).toBeLessThan(mobile.needs.hunger);
    }
  });

  it('un ouvrier assoiffé va boire à la mairie, remonte sa jauge, et la ville compte une eau de moins', () => {
    const world = colony({ water: 10 });
    const worker = workers(world)[0]!;
    let drank = 0;

    world.events.on('needMet', ({ id, need }) => {
      if (id === worker.id && need === 'thirst') drank += 1;
    });
    worker.needs.thirst = THIRST.seekBelow - 0.05;

    for (let i = 0; i < 20 * 30 && drank === 0; i += 1) {
      world.tick();
      if (worker.meal) expect(world.townStock()!.available('water')).toBe(10 - THIRST.meal);
    }

    expect(drank).toBe(1);
    expect(worker.needs.thirst).toBe(1);
    expect(worker.meal).toBeNull();
    expect(world.townStock()!.count('water')).toBe(10 - THIRST.meal);
  });

  it('sans eau, il ralentit sous le seuil, puis s’arrête à bout — et repart quand l’eau arrive', () => {
    const world = colony({ food: 50 });
    const hall = world.warehouse()!;

    place(world, hall.tx + 12, hall.ty + 8);
    world.townStock()!.add('stone', 30);
    for (let i = 0; i < 20 * 20 && !workers(world).some((mobile) => mobile.job); i += 1) world.tick();

    const worker = workers(world).find((mobile) => mobile.job)!;

    expect(worker).toBeDefined();

    const stride = (): number => {
      const { x, y } = worker;

      world.tick();
      return Math.hypot(worker.x - x, worker.y - y);
    };

    const fresh = stride();

    worker.needs.thirst = THIRST.weakBelow / 2;
    const weak = stride();

    expect(weak).toBeCloseTo(fresh * THIRST.weakPace, 5);
    expect(worker.meal).toBeNull();

    worker.needs.thirst = 0;
    const { x, y } = worker;

    run(world, 100);
    expect([worker.x, worker.y]).toEqual([x, y]);
    expect(worker.moving).toBe(false);
    expect(worker.job).not.toBeNull();

    world.townStock()!.add('water', 5);
    for (let i = 0; i < 20 * 60 && worker.needs.thirst < 1; i += 1) world.tick();
    expect(worker.needs.thirst).toBe(1);
  });

  it('assoiffé et affamé, il comble d’abord le besoin le plus bas', () => {
    const needs = { hunger: HUNGER.seekBelow - 0.05, thirst: THIRST.seekBelow - 0.2 };

    expect(urgentNeed(needs)).toBe('thirst');
    expect(deprivedNeed({ hunger: 0.1, thirst: 0.05 })).toBe('thirst');
    expect(deprivedNeed({ hunger: 0.05, thirst: 1 })).toBe('hunger');
    expect(deprivedNeed(fullNeeds())).toBeNull();
  });

  it('sans nourriture, l’affamé le plus bas va boire : personne ne meurt de soif avec de l’eau en ville', () => {
    const world = colony({ water: 140 });
    const deaths: string[] = [];
    let drank = 0;

    world.events.on('needMet', ({ need }) => {
      if (need === 'thirst') drank += 1;
    });
    world.events.on('workerStarved', ({ need }) => {
      deaths.push(need);
    });
    for (const worker of workers(world)) {
      worker.needs.hunger = 0.01;
      worker.needs.thirst = 0.2;
    }
    run(world, 20 * 60);
    expect(drank).toBeGreaterThan(0);
    expect(deaths).not.toContain('thirst');
  });

  it('un enfant assoiffé ne grandit pas à l’aube', () => {
    const world = colony({});
    let stunted: string | null = null;

    world.events.on('growthStunted', ({ need }) => {
      stunted = need;
    });
    kid(world).needs.thirst = THIRST.seekBelow - 0.1;
    toDawn(world);
    expect(kid(world).age).toBe(12);
    expect(stunted).toBe('thirst');
    expect(stuntingNeed({ hunger: 1, thirst: 0.1 })).toBe('thirst');
  });

  it('l’alerte dit que l’eau va manquer, et son tap montre les assoiffés', () => {
    const world = colony({ food: 50 });
    const worker = workers(world)[0]!;

    expect(world.needAlert()).toBeNull();
    worker.needs.thirst = THIRST.seekBelow - 0.05;
    expect(world.needAlert()).toMatchObject({ need: 'thirst', item: 'water', wanting: 1, minutes: 0 });
    expect(world.wantingInhabitants('thirst').map((mobile) => mobile.id)).toEqual([worker.id]);
    expect(world.wantingInhabitants('hunger')).toEqual([]);

    world.townStock()!.add('water', 50);
    expect(world.needAlert()).toBeNull();
  });

  it('la nouvelle partie part avec de l’eau et de la nourriture, réglées dans les données', () => {
    expect(COLONY.startingStock.water).toBeGreaterThan(0);
    expect(COLONY.startingStock.food).toBeGreaterThan(0);

    // Dix ouvriers au travail, sans puits : l'eau de départ tient plusieurs minutes, le temps d'en bâtir un.
    const drinksPerMinute = (COLONY.startingWorkers * 20 * 60) / (THIRST.workTicks * (1 - THIRST.seekBelow));

    expect(COLONY.startingStock.water / drinksPerMinute).toBeGreaterThanOrEqual(5);
  });
});

describe('puits', () => {
  /** La plus proche emprise de puits posable au bord de l'eau, autour de la mairie. */
  function shoreSpot(world: World): { tx: number; ty: number } {
    const hall = world.warehouse()!;
    let best: { tx: number; ty: number; distance: number } | null = null;

    for (let dy = -70; dy <= 70; dy += 1) {
      for (let dx = -70; dx <= 70; dx += 1) {
        const tx = hall.tx + dx;
        const ty = hall.ty + dy;
        const land = [0, 1].every((y) => [0, 1].every((x) => isWalkable(terrainAt(world.seed, tx + x, ty + y))));

        if (!land || !touchesWater(world.seed, tx, ty, 2, 2)) continue;
        if (best === null || dx * dx + dy * dy < best.distance) best = { tx, ty, distance: dx * dx + dy * dy };
      }
    }
    if (!best) throw new Error('aucun bord d’eau près de la mairie — la génération de terrain a changé');
    return best;
  }

  /** Pose le puits à côté de la mairie et le bâtit d'un « Transférer », Adam à côté. */
  function buildWell(world: World): Entity {
    const { tx, ty } = shoreSpot(world);

    world.revealAround(tx, ty, 6);
    for (let y = ty - 1; y <= ty + 2; y += 1) for (let x = tx - 1; x <= tx + 2; x += 1) world.resources.clear(x, y);
    world.player.x = world.player.prevX = (tx + 1) * TILE_SIZE;
    world.player.y = world.player.prevY = (ty + 3.5) * TILE_SIZE;
    expect(world.canPlace('well', tx, ty)).toBeNull();
    world.push({ type: 'placeBuilding', building: 'well', tx, ty });
    world.tick();

    const site = [...world.entities.values()].find((entity) => entity.proto === 'well')!;

    for (const [item, amount] of Object.entries(BUILDINGS.well.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
    world.push({ type: 'transferToSite', id: site.id });
    world.tick();
    return world.entities.get(site.id)!;
  }

  function waterOf(world: World): number {
    let water = 0;

    for (const entity of world.entities.values()) if (entity.kind !== 'site') water += entity.store.count('water');
    for (const mobile of world.mobiles.values()) {
      if (mobile.kind === 'worker' && mobile.job?.carried && mobile.job.item === 'water') water += mobile.job.amount;
    }
    return water;
  }

  it('tire de l’eau dans son coffre, au bord de l’eau, à la cadence de sa recette', () => {
    const world = colony({ food: 50 });

    // Un ouvrier libre pour le treuil.
    world.colonists += BUILDINGS.well.workers;

    const well = buildWell(world);

    expect(well.kind).toBe('quarry');
    expect(recipeOf('well')).toBe(RECIPES.drawWater);

    const before = waterOf(world);

    run(world, RECIPES.drawWater.duration);
    expect(waterOf(world) - before).toBeGreaterThanOrEqual(RECIPES.drawWater.outputs.water);
  });

  it('ne se pose qu’au bord de l’eau', () => {
    const world = colony({ food: 50 });
    const { tx, ty } = shoreSpot(world);
    const hall = world.warehouse()!;

    world.revealAround(tx, ty, 6);
    world.revealAround(hall.tx + 5, hall.ty + 1, 6);
    world.player.x = world.player.prevX = (tx + 1) * TILE_SIZE;
    world.player.y = world.player.prevY = (ty + 3.5) * TILE_SIZE;
    for (let y = ty - 1; y <= ty + 2; y += 1) for (let x = tx - 1; x <= tx + 2; x += 1) world.resources.clear(x, y);
    expect(world.canPlace('well', tx, ty)).toBeNull();

    // Au milieu de la plaine, à sec : refusé, quelle que soit la portée.
    world.player.x = world.player.prevX = (hall.tx + 6) * TILE_SIZE;
    world.player.y = world.player.prevY = (hall.ty + 4.5) * TILE_SIZE;
    for (let y = hall.ty; y <= hall.ty + 3; y += 1) for (let x = hall.tx + 4; x <= hall.tx + 7; x += 1) world.resources.clear(x, y);
    expect(world.canPlace('well', hall.tx + 5, hall.ty + 1)).toBe('shore');
  });

  it('sans ouvrier, il ne tire rien', () => {
    const world = colony({ food: 50 });
    const well = buildWell(world);

    if (well.kind === 'site') throw new Error('le puits ne s’est pas achevé');
    world.push({ type: 'setWorkers', id: well.id, count: 0 });
    run(world, 3 * RECIPES.drawWater.duration);
    expect(well.store.count('water')).toBe(0);
  });
});

describe('soif — sauvegarde', () => {
  it('la jauge de soif et la gorgée en route se sauvegardent', () => {
    const world = colony({ water: 10 });
    const worker = workers(world)[0]!;

    worker.needs.thirst = THIRST.seekBelow - 0.05;
    for (let i = 0; i < 40 && !worker.meal; i += 1) world.tick();
    expect(worker.meal).toBe('thirst');

    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);

    const loaded = decoded.world.mobiles.get(worker.id) as Worker;

    expect(loaded.needs.thirst).toBeCloseTo(worker.needs.thirst);
    expect(loaded.meal).toBe('thirst');
    expect(decoded.world.townStock()!.available('water')).toBe(10 - THIRST.meal);
  });

  it('une sauvegarde d’avant l’eau : un petit stock en ville, et des habitants désaltérés', () => {
    const world = colony({ food: 10, wood: 4 });
    const file = JSON.parse(encodeSave(world, 0)) as { version: number; state: { mobiles: Record<string, unknown>[] } };

    // Une version 8 : ni eau, ni soif.
    file.version = 8;
    for (const mobile of file.state.mobiles) {
      if (mobile['needs']) delete (mobile['needs'] as Record<string, unknown>)['thirst'];
    }

    const decoded = decodeSave(JSON.stringify(file));

    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.world.townStock()!.toJSON()).toEqual({ food: 10, wood: 4, water: COLONY.startingStock.water });

    const people = [...decoded.world.mobiles.values()].filter((mobile) => mobile.kind === 'kid' || mobile.kind === 'worker');

    expect(people.length).toBeGreaterThan(1);
    for (const mobile of people) expect(mobile).toMatchObject({ needs: { thirst: 1 } });
  });
});

describe('famine', () => {
  const THIRST_DEATH = NEEDS.thirst.deathTicks;

  it('un ouvrier à bout de soif, sans eau en ville, meurt après son délai : la colonie compte un ouvrier de moins', () => {
    const world = colony({ food: 50 });
    const worker = workers(world)[0]!;
    const warnings: number[] = [];
    const deaths: { name: string; need: string }[] = [];

    world.events.on('starving', ({ id, seconds }) => {
      if (id === worker.id) warnings.push(seconds);
    });
    world.events.on('workerStarved', ({ id, name, need }) => {
      if (id === worker.id) deaths.push({ name, need });
    });

    const before = world.colonists;

    worker.needs.thirst = 0;
    run(world, THIRST_DEATH - 2);
    expect(world.mobiles.has(worker.id)).toBe(true);
    expect(warnings).toEqual([THIRST_DEATH / 20]);
    expect(deaths).toEqual([]);

    run(world, 2);
    expect(world.mobiles.has(worker.id)).toBe(false);
    expect(deaths).toHaveLength(1);
    expect(deaths[0]!.need).toBe('thirst');
    expect(deaths[0]!.name).not.toBe('');
    expect(world.colonists).toBe(before - 1);
  });

  it('boire à temps remet le compte à rebours à rien', () => {
    const world = colony({ food: 50 });
    const worker = workers(world)[0]!;

    worker.needs.thirst = 0;
    run(world, THIRST_DEATH - 400);
    world.townStock()!.add('water', 5);
    for (let i = 0; i < 20 * 60 && worker.needs.thirst < 1; i += 1) world.tick();
    expect(worker.needs.thirst).toBe(1);
    expect(world.mobiles.has(worker.id)).toBe(true);

    // Il retombe à zéro : un délai entier de nouveau, pas ce qui restait.
    run(world, 1);
    worker.needs.thirst = 0;
    world.townStock()!.remove('water', world.townStock()!.count('water'));
    run(world, THIRST_DEATH - 2);
    expect(world.mobiles.has(worker.id)).toBe(true);
  });

  it('la faim tue aussi, plus lentement que la soif', () => {
    expect(NEEDS.hunger.deathTicks).toBeGreaterThan(NEEDS.thirst.deathTicks);

    const world = colony({ water: 50 });
    const worker = workers(world)[0]!;
    let cause: string | null = null;

    world.events.on('workerStarved', ({ id, need }) => {
      if (id === worker.id) cause = need;
    });
    worker.needs.hunger = 0;
    run(world, NEEDS.hunger.deathTicks);
    expect(cause).toBe('hunger');
    expect(world.mobiles.has(worker.id)).toBe(false);
  });

  it('un enfant à bout ne meurt pas', () => {
    const world = colony({});
    const child = kid(world);

    child.needs.hunger = 0;
    child.needs.thirst = 0;
    run(world, NEEDS.hunger.deathTicks + 20);
    expect(world.mobiles.has(child.id)).toBe(true);
  });

  it('un porteur qui meurt rend ses réservations : le job est refait par un autre', () => {
    const world = colony({ food: 50, water: 50 });
    const hall = world.warehouse()!;

    place(world, hall.tx + 6, hall.ty - 4);
    world.townStock()!.add('stone', 30);
    for (let i = 0; i < 20 * 20 && !workers(world).some((mobile) => mobile.job); i += 1) world.tick();

    const worker = workers(world).find((mobile) => mobile.job)!;

    world.townStock()!.remove('water', 50);
    worker.needs.thirst = 0;
    run(world, THIRST_DEATH + 1);
    expect(world.mobiles.has(worker.id)).toBe(false);
    // Sa réservation est rendue : la pierre redevient disponible pour un autre porteur.
    world.townStock()!.add('water', 50);
    for (let i = 0; i < 20 * 30 && !workers(world).some((other) => other.job?.item === 'stone'); i += 1) world.tick();
    expect(workers(world).some((other) => other.job?.item === 'stone')).toBe(true);
  });

  it('une jauge à zéro avant la mairie ne tue personne : rien ne baisse tant qu’elle n’est pas bâtie', () => {
    const world = new World(100);
    const free = [...world.mobiles.values()].filter((mobile): mobile is Worker => mobile.kind === 'worker');

    run(world, 20 * 60 * 5);
    for (const worker of free) expect(worker.needs.hunger).toBe(1);
  });

  it('les ouvriers d’une ancienne sauvegarde, sans jauges, repartent pleins et survivent au délai', () => {
    const world = colony({ food: 50, water: 50 });
    const file = JSON.parse(encodeSave(world, 0)) as { state: { mobiles: Record<string, unknown>[] } };

    for (const mobile of file.state.mobiles) delete mobile['needs'];

    const decoded = decodeSave(JSON.stringify(file));

    if (!decoded.ok) throw new Error(decoded.reason);

    const loaded = decoded.world;
    const before = workers(loaded).length;

    for (const worker of workers(loaded)) expect(worker.needs).toEqual(fullNeeds());
    run(loaded, NEEDS.hunger.deathTicks + 20);
    expect(workers(loaded)).toHaveLength(before);
  });
});
