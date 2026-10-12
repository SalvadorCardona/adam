import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, REPAIR, buildingLevel, type BuildingId } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { ENEMIES, QUEEN, WAVE_STRENGTH, nightBosses, queenWave } from '../data/enemies.ts';
import type { ItemId } from '../data/items.ts';
import { isTargetable } from './combat.ts';
import { CYCLE_TICKS } from './dayNight.ts';
import { queenPhase } from './enemies.ts';
import { deserialize, serialize } from './save.ts';
import type { Building, EntityId, Mutant, Tower } from './types.ts';
import { World, repairCost } from './world.ts';

/**
 * Un chantier achevé d'office : son coût dans le sac, Adam à portée le temps
 * de « Transférer », puis il revient où il était. Ces tests portent sur la
 * défense, pas sur la récolte.
 */
function finish(world: World, id: EntityId): Building {
  const site = world.entities.get(id);

  if (site?.kind !== 'site') throw new Error(`#${id} n'est pas un chantier`);
  for (const [item, amount] of Object.entries(BUILDINGS[site.proto].cost) as [ItemId, number][]) {
    world.player.inventory.add(item, amount - (site.delivered[item] ?? 0));
  }

  const { x, y } = world.player;

  world.player.x = (site.tx + site.width / 2) * TILE_SIZE;
  world.player.y = (site.ty + site.height + 0.5) * TILE_SIZE;
  world.push({ type: 'transferToSite', id });
  world.tick();
  world.player.x = world.player.prevX = x;
  world.player.y = world.player.prevY = y;

  const built = world.entities.get(id);

  if (!built || built.kind === 'site') throw new Error('le chantier ne s’est pas achevé');
  return built;
}

function hallOf(world: World): Building {
  const hall = world.entities.get(world.townHallId);

  if (!hall || hall.kind === 'site') throw new Error('pas de mairie debout');
  return hall;
}

/** La mairie debout, Adam juste en dessous, qui pousse contre elle s'il marche vers le haut. */
function worldWithTownHall(seed: number): World {
  const world = new World(seed);
  const hall = finish(world, world.townHallId);

  world.player.x = world.player.prevX = (hall.tx + hall.width / 2) * TILE_SIZE;
  world.player.y = world.player.prevY = (hall.ty + hall.height + 0.5) * TILE_SIZE;
  return world;
}

/** Pose et achève `building` en (tx, ty), Adam à portée le temps de poser ; `null` si la case est refusée. */
function placeAt(world: World, building: BuildingId, tx: number, ty: number): Building | null {
  const { x, y } = world.player;

  // À portée le temps de poser.
  world.player.x = (tx + 0.5) * TILE_SIZE;
  world.player.y = (ty + 3.5) * TILE_SIZE;
  if (world.canPlace(building, tx, ty) !== null) {
    world.player.x = x;
    world.player.y = y;
    return null;
  }

  const before = new Set(world.entities.keys());

  world.push({ type: 'placeBuilding', building, tx, ty });
  world.tick();
  world.player.x = world.player.prevX = x;
  world.player.y = world.player.prevY = y;

  const id = [...world.entities.keys()].find((key) => !before.has(key));

  if (id === undefined) throw new Error('le chantier n’a pas été ouvert');
  return finish(world, id);
}

/**
 * Pose `count` tours de guet au plus près de la mairie, en laissant libre
 * l'anneau autour d'elle où se tient Adam.
 */
function addTowers(world: World, count: number): void {
  const hall = hallOf(world);
  const cx = hall.tx + hall.width / 2;
  const cy = hall.ty + hall.height / 2;
  const spots: [number, number][] = [];

  for (let dy = -6; dy <= 6; dy += 1) {
    for (let dx = -6; dx <= 6; dx += 1) spots.push([hall.tx + dx, hall.ty + dy]);
  }
  spots.sort(([ax, ay], [bx, by]) => Math.hypot(ax + 1 - cx, ay + 1 - cy) - Math.hypot(bx + 1 - cx, by + 1 - cy));

  let placed = 0;

  for (const [tx, ty] of spots) {
    if (placed === count) return;
    if (tx >= hall.tx - 2 && tx <= hall.tx + hall.width && ty >= hall.ty - 2 && ty <= hall.ty + hall.height + 1) continue;
    if (placeAt(world, 'watchtower', tx, ty)) placed += 1;
  }
  if (placed < count) throw new Error('pas assez de place pour les tours');
}

/**
 * L'usine isolée du playtest : une ferme et une carrière posées à l'écart
 * de la mairie, de part et d'autre, là où rien ne les défend.
 */
function addFactory(world: World): Building[] {
  const hall = hallOf(world);
  const factory: Building[] = [];

  for (const [building, side] of [['farm', 1], ['quarry', -1]] as const) {
    let built: Building | null = null;

    for (let distance = 9; distance <= 14 && !built; distance += 1) {
      for (let dy = -4; dy <= 4 && !built; dy += 1) built = placeAt(world, building, hall.tx + side * distance, hall.ty + dy);
    }
    if (!built) throw new Error(`pas de place pour : ${building}`);
    factory.push(built);
  }
  return factory;
}

/** Une tour de guet collée à ce bâtiment : sous la mairie, ou à côté sinon. */
function guard(world: World, building: Building, count: number): void {
  let placed = 0;

  for (const [dx, dy] of [[0, 2], [0, -2], [2, 0], [-2, 0], [2, 2], [-2, 2], [2, -2], [-2, -2]] as const) {
    if (placed < count && placeAt(world, 'watchtower', building.tx + dx, building.ty + dy)) placed += 1;
  }
  if (placed < count) throw new Error(`pas de place pour garder #${building.id}`);
}

/** Joue jusqu'à l'aube de la nuit `night`, ou jusqu'à la défaite. */
function playThroughNight(world: World, night: number, between: () => void = () => {}): void {
  for (let i = 0; i < 20 * 60 * 5 * (night + 1) && !world.defeated; i += 1) {
    world.tick();
    between();
    if (world.night === night && world.clock()?.phase === 'dawn') return;
  }
}


describe('réparer', () => {
  it('répare un bâtiment abîmé qu’Adam heurte avec du bois dans le sac, avant que la mairie n’avale le reste', () => {
    const world = worldWithTownHall(7);
    const hall = hallOf(world);
    const repaired: number[] = [];

    world.events.on('playerRepaired', ({ amount, fromBag }) => repaired.push(amount, fromBag));
    const max = buildingLevel(hall.proto, hall.level).hp;

    hall.hp = max - 3 * REPAIR.hp;
    world.player.inventory.add('wood', 5);

    // Adam est juste sous la mairie : il pousse vers le haut.
    world.push({ type: 'setMoveAxis', x: 0, y: -1 });
    for (let i = 0; i < 40; i += 1) world.tick();

    expect(repaired).toEqual([3, 3]);
    expect(hall.hp).toBe(max);
    // Le bois en trop est parti en ville, comme tout le sac.
    expect(world.player.inventory.count('wood')).toBe(0);
    expect(world.townStock()!.available('wood')).toBeGreaterThanOrEqual(2);
  });

  it('ne prend rien pour réparer quand le bâtiment est intact', () => {
    const world = worldWithTownHall(7);
    const repaired: number[] = [];

    world.events.on('playerRepaired', ({ amount }) => repaired.push(amount));
    world.player.inventory.add('wood', 5);
    world.push({ type: 'setMoveAxis', x: 0, y: -1 });
    for (let i = 0; i < 40; i += 1) world.tick();

    expect(repaired).toEqual([]);
  });

  it('« Réparer » pose d’un coup le bois qu’il faut, le sac puis la ville, sans dépasser le maximum', () => {
    const world = worldWithTownHall(7);
    const hall = hallOf(world);
    const max = buildingLevel(hall.proto, hall.level).hp;

    hall.hp = max - 4 * REPAIR.hp - 3;
    expect(repairCost(hall)).toBe(5);
    world.player.inventory.add('wood', 2);
    world.townStock()!.add('wood', 10 - world.townStock()!.available('wood'));

    world.push({ type: 'repairBuilding', id: hall.id });
    world.tick();

    expect(hall.hp).toBe(max);
    expect(world.player.inventory.count('wood')).toBe(0);
    expect(world.townStock()!.available('wood')).toBe(7);
  });

  it('refuse de réparer un bâtiment intact, sans bois, ou de loin', () => {
    const world = worldWithTownHall(7);
    const hall = hallOf(world);
    const reasons: string[] = [];

    world.events.on('repairRejected', ({ reason }) => reasons.push(reason));
    world.townStock()!.remove('wood', world.townStock()!.available('wood'));

    world.push({ type: 'repairBuilding', id: hall.id });
    world.tick();

    hall.hp = 10;
    world.push({ type: 'repairBuilding', id: hall.id });
    world.tick();

    world.player.inventory.add('wood', 1);
    world.player.x += 40 * TILE_SIZE;
    world.push({ type: 'repairBuilding', id: hall.id });
    world.tick();

    expect(reasons).toEqual(['intact', 'noMaterial', 'outOfReach']);
    expect(hall.hp).toBe(10);
  });
});

/*
 * L'équilibre, mesuré, en nuits. La défaite doit venir d'un choix du joueur —
 * négliger les tours, partir trop loin — et plus de l'usure. Adam reste
 * planté sous la mairie : son arc tire seul, il ne répare pas ; Ève, arrivée
 * après la nuit 3, répare entre deux vagues.
 */
describe('courbe des nuits', () => {
  const SEEDS = [7, 42, 99];

  it.each(SEEDS)('seed %i : Adam immobile et deux tours passent la nuit 9, jusqu’à la Reine', (seed) => {
    const world = worldWithTownHall(seed);

    addTowers(world, 2);
    playThroughNight(world, 9);

    expect(world.defeated).toBe(false);
    expect(world.night).toBe(9);
  }, 60_000);

  it.each(SEEDS)('seed %i : une seule tour tient les premières nuits, mais la mairie tombe avant l’aube de la nuit 10', (seed) => {
    const world = worldWithTownHall(seed);

    addTowers(world, 1);
    playThroughNight(world, 10);

    expect(world.defeated).toBe(true);
    expect(world.night).toBeGreaterThanOrEqual(8);
  }, 60_000);

  it.each(SEEDS)('seed %i : deux tours et des réparations passent la nuit 10 en bonne santé', (seed) => {
    const world = worldWithTownHall(seed);
    const hall = hallOf(world);
    let lowest = hall.hp;

    addTowers(world, 2);
    world.player.inventory.add('wood', 30);
    playThroughNight(world, 10, () => {
      lowest = Math.min(lowest, hall.hp);
      if (world.tickCount % 100 === 0 && repairCost(hall) > 0) world.push({ type: 'repairBuilding', id: hall.id });
    });

    expect(world.defeated).toBe(false);
    expect(world.night).toBe(10);
    expect(lowest).toBeGreaterThan(BUILDINGS.townHall.hp / 3);
  }, 60_000);
});

/*
 * Le test « AFK » du playtest : la mairie, une tour, une ferme et une
 * carrière à l'écart, Adam qui ne bouge pas. Les vagues visent aussi
 * l'usine : six nuits ne passent plus sans y laisser des plumes. Bien
 * gardée, elle tient.
 */
describe('l’usine la nuit', () => {
  it('AFK — seed 42 : mairie, une tour, six nuits sans bouger, et l’usine ou la mairie y laisse des plumes', () => {
    const world = worldWithTownHall(42);
    const hall = hallOf(world);
    const factory = addFactory(world);
    const hurt = new Set<BuildingId>();
    let lowest = hall.hp;

    addTowers(world, 1);
    world.events.on('buildingDamaged', ({ id }) => {
      const building = factory.find((entity) => entity.id === id);

      if (building) hurt.add(building.proto);
    });
    playThroughNight(world, 6, () => (lowest = Math.min(lowest, hall.hp)));

    expect(world.night).toBe(6);
    expect(hurt.size > 0 || lowest < 0.6 * BUILDINGS.townHall.hp).toBe(true);
  }, 60_000);

  it('seed 42 : quatre tours bien placées — deux par bâtiment isolé — et rien n’est détruit en six nuits', () => {
    const world = worldWithTownHall(42);
    const destroyed: BuildingId[] = [];

    for (const building of addFactory(world)) guard(world, building, 2);
    world.events.on('buildingDestroyed', ({ proto }) => destroyed.push(proto));
    playThroughNight(world, 6);

    expect(world.defeated).toBe(false);
    expect(world.night).toBe(6);
    expect(destroyed).toEqual([]);
  }, 60_000);
});

/* ------------------------------------------------------------ la Reine */

function towersOf(world: World): Tower[] {
  return [...world.entities.values()].filter((entity): entity is Tower => entity.kind === 'tower');
}

function queenOf(world: World): Mutant | undefined {
  return [...world.mobiles.values()].find((mobile): mobile is Mutant => mobile.kind === 'mutant' && mobile.proto === 'queen');
}

function centerOf(entity: { tx: number; ty: number; width: number; height: number }): { x: number; y: number } {
  return { x: (entity.tx + entity.width / 2) * TILE_SIZE, y: (entity.ty + entity.height / 2) * TILE_SIZE };
}

/** Une Reine posée à la main, sortie de terre, à (x, y), avec `hp` points de vie. */
function placeQueen(world: World, x: number, y: number, hp: number = ENEMIES.queen.hp, id = 90_000): Mutant {
  const queen: Mutant = {
    kind: 'mutant',
    id,
    proto: 'queen',
    x,
    y,
    prevX: x,
    prevY: y,
    facing: 'down',
    moving: false,
    hp,
    age: 100,
    attackCooldown: 0,
    emerge: 0,
    queen: { phase: 1, layTicks: QUEEN.layTicks, prey: null },
  };

  world.mobiles.set(id, queen);
  return queen;
}

/** Avance l'horloge : le prochain tick est `before` ticks avant la tombée de la nuit `night`. */
function jumpToNight(world: World, night: number, before: number): void {
  world.cycleStartTick = world.tickCount + 1 - ((night - 1) * CYCLE_TICKS + DAY_CYCLE.day + DAY_CYCLE.dusk - before);
  world.night = night - 1;
}

describe('Reine des flaques — calendrier', () => {
  it('sort aux nuits 10, 15, 20 ; la nuit 5 garde son gros mutant', () => {
    expect(nightBosses(10).queen).toBe(1);
    expect(queenWave(10)).not.toBeNull();
    expect(queenWave(15)).not.toBeNull();
    expect(queenWave(20)).not.toBeNull();

    for (const night of [1, 4, 5, 6, 9, 11, 14, 16]) expect(queenWave(night), `nuit ${night}`).toBeNull();
    expect(nightBosses(5).brute).toBe(1);
    expect(nightBosses(9).queen ?? 0).toBe(0);
  });

  it('s’annonce la veille au crépuscule, puis le bandeau compte jusqu’à sa sortie', () => {
    const world = worldWithTownHall(42);
    const announced: number[] = [];

    world.events.on('queenAnnounced', ({ night }) => announced.push(night));
    // Le crépuscule de la nuit 9 tombe au prochain tick.
    jumpToNight(world, 9, DAY_CYCLE.dusk);
    world.tick();
    expect(announced).toEqual([10]);
    expect(world.queenCountdown()).toBeNull();

    jumpToNight(world, 10, DAY_CYCLE.dusk - 1);
    world.tick();
    const first = world.queenCountdown();

    world.tick();
    expect(first).not.toBeNull();
    expect(world.queenCountdown()).toBe(first! - 1);
  });
});

describe('Reine des flaques — phases', () => {
  it('reste en phase 1 à la moitié de ses PV, passe en phase 2 en dessous', () => {
    const world = worldWithTownHall(42);
    const half = placeQueen(world, 0, 0, ENEMIES.queen.hp * 0.5);
    const below = placeQueen(world, 0, 0, Math.floor(ENEMIES.queen.hp * 0.49 * 100) / 100, 90_001);

    expect(below.hp / ENEMIES.queen.hp).toBeCloseTo(0.49);
    expect(queenPhase(half)).toBe(1);
    expect(queenPhase(below)).toBe(2);
  });

  it('pond deux larves toutes les huit secondes en phase 1', () => {
    const world = worldWithTownHall(42);
    const hall = hallOf(world);
    const queen = placeQueen(world, hall.tx * TILE_SIZE - 12 * TILE_SIZE, hall.ty * TILE_SIZE);
    const larvae = (): number => [...world.mobiles.values()].filter((m) => m.kind === 'mutant' && m.proto === 'larva').length;

    for (let i = 0; i < QUEEN.layTicks - 1; i += 1) world.tick();
    expect(larvae()).toBe(0);
    world.tick();
    expect(larvae()).toBe(QUEEN.brood);
    expect(queen.queen!.phase).toBe(1);
  });

  it('à 49 % de ses PV, plonge et ressort à quatre cases de la tour la plus proche, puis la frappe', () => {
    const world = worldWithTownHall(42);

    addTowers(world, 2);

    const hall = hallOf(world);
    const queen = placeQueen(world, (hall.tx - 10) * TILE_SIZE, hall.ty * TILE_SIZE, ENEMIES.queen.hp * 0.49);
    const nearest = towersOf(world).sort(
      (a, b) => Math.hypot(centerOf(a).x - queen.x, centerOf(a).y - queen.y) - Math.hypot(centerOf(b).x - queen.x, centerOf(b).y - queen.y),
    )[0]!;
    const hits: number[] = [];

    world.events.on('buildingDamaged', ({ id }) => hits.push(id));
    world.tick();

    expect(queen.queen).toMatchObject({ phase: 2, prey: nearest.id });
    expect(queen.emerge).toBe(QUEEN.burrowTicks);
    expect(isTargetable(queen)).toBe(false);
    expect(Math.hypot(queen.x - centerOf(nearest).x, queen.y - centerOf(nearest).y) / TILE_SIZE).toBeCloseTo(QUEEN.surfaceDistance);

    for (let i = 0; i < QUEEN.burrowTicks + 20 * 15 && !hits.includes(nearest.id); i += 1) {
      // Hors d'atteinte des arcs le temps de l'essai : on regarde où elle va.
      queen.hp = ENEMIES.queen.hp * 0.49;
      world.tick();
    }
    expect(hits).toContain(nearest.id);
  });

  it('sa mort lâche un cœur radioactif et une à trois plaques de fer', () => {
    const world = worldWithTownHall(42);
    const dropped: ItemId[] = [];
    const slain: number[] = [];

    world.events.on('lootDropped', ({ item }) => dropped.push(item));
    world.events.on('queenSlain', ({ id }) => slain.push(id));

    const queen = placeQueen(world, world.player.x + 3 * TILE_SIZE, world.player.y, 1);

    for (let i = 0; i < 200 && world.mobiles.has(queen.id); i += 1) world.tick();

    expect(world.mobiles.has(queen.id)).toBe(false);
    expect(slain).toEqual([queen.id]);
    expect(dropped.filter((item) => item === 'radCore')).toHaveLength(1);

    const plates = dropped.filter((item) => item === 'ironPlate').length;

    expect(plates).toBeGreaterThanOrEqual(1);
    expect(plates).toBeLessThanOrEqual(3);
  });

  it('se sauvegarde et se recharge en pleine phase 2, et reprend à l’identique', () => {
    const world = worldWithTownHall(42);

    addTowers(world, 2);

    const hall = hallOf(world);
    const queen = placeQueen(world, (hall.tx - 10) * TILE_SIZE, hall.ty * TILE_SIZE, ENEMIES.queen.hp * 0.4);

    for (let i = 0; i < 20; i += 1) world.tick();
    expect(queen.queen!.phase).toBe(2);
    expect(queen.emerge).toBeGreaterThan(0);

    const restored = deserialize(JSON.parse(JSON.stringify(serialize(world))));
    const copy = restored.mobiles.get(queen.id) as Mutant;

    expect(copy).toEqual(queen);

    for (let i = 0; i < 20 * 10; i += 1) {
      world.tick();
      restored.tick();
    }
    expect(restored.mobiles.get(queen.id)).toEqual(world.mobiles.get(queen.id));
    expect(towersOf(restored).map((tower) => tower.hp)).toEqual(towersOf(world).map((tower) => tower.hp));
  });

  it('repart à l’aube si elle est encore debout', () => {
    const world = worldWithTownHall(42);
    const hall = hallOf(world);
    const queen = placeQueen(world, (hall.tx - 12) * TILE_SIZE, hall.ty * TILE_SIZE);

    // L'aube de la nuit 10 se lève au prochain tick.
    jumpToNight(world, 10, -DAY_CYCLE.night);
    world.tick();

    expect(world.clock()?.phase).toBe('dawn');
    expect(world.mobiles.has(queen.id)).toBe(false);
  });
});

/*
 * La Reine, mesurée : Adam planté sous la mairie, la nuit 10 jouée de son
 * crépuscule à son aube. Deux tours de base ne se couvrent pas assez : elle
 * en rase une. Quatre tours renforcées la descendent avant le jour.
 */
describe('Reine des flaques — équilibre', () => {
  /** Joue la nuit 10 depuis son crépuscule ; renvoie les tours qu'elle a rasées et si elle est tombée. */
  function queenNight(world: World): { razed: number; slain: boolean } {
    let razed = 0;
    let slain = false;

    world.events.on('buildingDestroyed', ({ id, proto }) => {
      const queen = queenOf(world);

      if (proto === 'watchtower' && queen?.queen?.prey === id) razed += 1;
    });
    world.events.on('queenSlain', () => (slain = true));

    jumpToNight(world, 10, DAY_CYCLE.dusk);
    for (let i = 0; i < DAY_CYCLE.dusk + DAY_CYCLE.night + 1 && !world.defeated; i += 1) world.tick();
    expect(world.clock()?.phase === 'dawn' || world.defeated).toBe(true);
    return { razed, slain };
  }

  it('seed 42, la mairie et deux tours de base : elle rase au moins une tour', () => {
    const world = worldWithTownHall(42);

    addTowers(world, 2);
    expect(queenNight(world).razed).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('seed 42, la mairie et quatre tours renforcées : elle tombe avant l’aube', () => {
    const world = worldWithTownHall(42);

    addTowers(world, 4);
    for (const tower of towersOf(world)) {
      tower.level = 2;
      tower.hp = buildingLevel(tower.proto, 2).hp;
    }
    expect(queenNight(world).slain).toBe(true);
  }, 60_000);
});

/*
 * La grâce des premières nuits : l'effectif ne tient plus au nombre de bases
 * proches (de un à huit mutants la nuit 2 selon la carte), et un joueur neuf
 * passe la nuit 1 sans tour.
 */
describe('premières nuits', () => {
  const SEEDS = [1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13, 42, 99, 100, 1234];
  const SPREAD = 3;

  /** L'effectif annoncé au crépuscule de chacune des `nights` premières nuits, mairie debout, sans tour. */
  function raidsOf(seed: number, nights: number): number[] {
    const world = worldWithTownHall(seed);
    const counts: number[] = [];

    for (let i = 0; i < CYCLE_TICKS * (nights + 1) && counts.length < nights; i += 1) {
      world.tick();

      const clock = world.clock();

      if (clock?.phase === 'dusk' && clock.cycle === counts.length + 1) counts.push(world.raidSize(clock.cycle).count);
    }
    return counts;
  }

  it('les nuits 1 à 3 plafonnent l’effectif, et il varie peu d’une carte à l’autre', () => {
    const all = SEEDS.map((seed) => raidsOf(seed, 3));

    for (const [index, cap] of WAVE_STRENGTH.earlyCaps.entries()) {
      const night = all.map((counts) => counts[index]!);

      expect(Math.max(...night)).toBeLessThanOrEqual(cap);
      expect(Math.max(...night) - Math.min(...night)).toBeLessThanOrEqual(SPREAD);
    }
  }, 120_000);

  it('l’annonce longue donne le même effectif que la vague', () => {
    const world = worldWithTownHall(1234);
    let announced = 0;

    world.events.on('waveAnnounced', (forecast) => {
      announced = forecast.count;
    });
    for (let i = 0; i < CYCLE_TICKS && world.clock()?.phase !== 'dusk'; i += 1) world.tick();

    expect(announced).toBeGreaterThan(0);
    expect(announced).toBe(world.raidSize(1).count);
  }, 60_000);

  it.each(SEEDS)('seed %i : sans tour, Adam sous la mairie passe la nuit 1', (seed) => {
    const world = worldWithTownHall(seed);

    playThroughNight(world, 1);

    expect(world.defeated).toBe(false);
    expect(world.night).toBe(1);
  }, 60_000);
});
