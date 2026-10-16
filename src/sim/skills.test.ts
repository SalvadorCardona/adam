import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { ENEMIES } from '../data/enemies.ts';
import type { ItemId } from '../data/items.ts';
import { CLEAN_NIGHT, COMBO, HUNTERS, VOLLEY } from '../data/skills.ts';
import type { Arrow, Building, EntityId, Mutant } from './types.ts';
import { CYCLE_TICKS } from './dayNight.ts';
import { deserialize, serialize } from './save.ts';
import { World } from './world.ts';

const NIGHTFALL = DAY_CYCLE.day + DAY_CYCLE.dusk;

/** Les parties privées du monde que ces tests pilotent à la main. */
interface Inner {
  bountyNight: number | null;
  spawnWave(wave: number): void;
  hurtMutant(mutant: Mutant, damage: number, vx: number, vy: number): void;
}

function inner(world: World): Inner {
  return world as unknown as Inner;
}

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

/** Une colonie avec sa mairie, la nuit `night` tombée depuis un tick, personne ne sort des bases. */
function nightWorld(night = 1): World {
  const world = new World(42);

  finish(world, world.townHallId);
  for (const base of world.enemyBases) base.hp = 0;
  world.cycleStartTick = world.tickCount - (night - 1) * (NIGHTFALL + DAY_CYCLE.night + DAY_CYCLE.dawn) - NIGHTFALL + 1;
  world.tick();
  expect(world.clock()!.phase).toBe('night');
  expect(world.night).toBe(night);
  return world;
}

let nextId = 91_000;

function placeMutant(world: World, x: number, y: number, extra: Partial<Mutant> = {}): Mutant {
  const mutant: Mutant = {
    kind: 'mutant',
    id: nextId++,
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
    ...extra,
  };

  world.mobiles.set(mutant.id, mutant);
  return mutant;
}

function arrows(world: World): Arrow[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Arrow => mobile.kind === 'arrow');
}

function kill(world: World, mutant: Mutant): void {
  inner(world).hurtMutant(mutant, 999, 1, 0);
}

describe('la Volée d’Adam', () => {
  it('lance trois flèches en éventail vers la direction visée, puis se recharge', () => {
    const world = nightWorld();
    const casts: number[] = [];

    world.events.on('skillCast', ({ dx }) => casts.push(dx));
    expect(world.skill()).toMatchObject({ unlocked: true, ready: true, left: 0 });
    world.push({ type: 'castSkill', dx: 1, dy: 0 });
    world.tick();

    const fan = arrows(world);

    expect(fan).toHaveLength(VOLLEY.arrows);
    expect(casts).toHaveLength(1);
    // Au centre, droit vers l'est ; les deux autres de part et d'autre.
    const angles = fan.map((arrow) => Math.atan2(arrow.vy, arrow.vx)).sort((a, b) => a - b);

    expect(angles[1]).toBeCloseTo(0, 5);
    expect(angles[2]! - angles[1]!).toBeCloseTo((VOLLEY.spreadDegrees * Math.PI) / 180, 5);
    expect(angles[1]! - angles[0]!).toBeCloseTo((VOLLEY.spreadDegrees * Math.PI) / 180, 5);

    // En recharge, une seconde volée est ignorée.
    expect(world.skill().ready).toBe(false);
    world.push({ type: 'castSkill', dx: 1, dy: 0 });
    world.tick();
    expect(casts).toHaveLength(1);
    expect(world.skill().left).toBeLessThan(VOLLEY.cooldownTicks);

    for (let i = 0; i < VOLLEY.cooldownTicks; i += 1) world.tick();
    expect(world.skill().ready).toBe(true);
  });

  it('vise l’ennemi le plus proche sans direction, et ne part pas en plein jour', () => {
    const world = nightWorld();
    const foe = placeMutant(world, world.player.x - 4 * TILE_SIZE, world.player.y);

    world.push({ type: 'castSkill', dx: 0, dy: 0 });
    world.tick();
    expect(arrows(world).some((arrow) => arrow.vx < 0)).toBe(true);
    expect(foe.hp).toBeLessThanOrEqual(ENEMIES.mutant.hp);

    const day = new World(7);

    finish(day, day.townHallId);
    day.push({ type: 'castSkill', dx: 1, dy: 0 });
    day.tick();
    expect(arrows(day)).toHaveLength(0);
    expect(day.skillOn()).toBe(false);
  });
});

describe('les traqueurs', () => {
  it('marchent sur Adam plutôt que sur la mairie, et le frappent au contact', () => {
    const world = nightWorld(2);
    const hall = world.entities.get(world.townHallId)!;
    const hallX = (hall.tx + hall.width / 2) * TILE_SIZE;
    const hallY = (hall.ty + hall.height / 2) * TILE_SIZE;

    // Adam à l'écart de la mairie, hors de portée de l'arc des tours.
    world.player.x = world.player.prevX = hallX + 12 * TILE_SIZE;
    world.player.y = world.player.prevY = hallY;

    const hunter = placeMutant(world, world.player.x + 6 * TILE_SIZE, world.player.y, { hunts: true });
    const plain = placeMutant(world, world.player.x + 6 * TILE_SIZE, world.player.y + 2 * TILE_SIZE);
    const hp = world.player.hp;
    const before = Math.hypot(hunter.x - hallX, hunter.y - hallY);

    for (let i = 0; i < 6 * 20; i += 1) {
      world.player.x = world.player.prevX = hallX + 12 * TILE_SIZE;
      world.player.y = world.player.prevY = hallY;
      world.player.bowCooldown = 1_000;
      world.tick();
    }

    // Le traqueur est venu jusqu'à Adam (contre le sens de la mairie : il s'en est éloigné ou n'a pas dépassé Adam).
    expect(Math.hypot(hunter.x - world.player.x, hunter.y - world.player.y)).toBeLessThan(TILE_SIZE);
    expect(Math.hypot(hunter.x - hallX, hunter.y - hallY)).toBeGreaterThan(before - 8 * TILE_SIZE);
    expect(world.player.hp).toBeLessThan(hp);
    expect(world.player.hp).toBeGreaterThanOrEqual(hp - Math.ceil(6 * 20 / HUNTERS.attackTicks) * HUNTERS.damage);
    // L'assaillant ordinaire, lui, marche sur la mairie : il est passé derrière Adam.
    expect(plain.x).toBeLessThan(world.player.x);
  });

  it('retombent sur leur cible hors de vue d’Adam', () => {
    const world = nightWorld(2);
    const hall = world.entities.get(world.townHallId)!;
    const hallX = (hall.tx + hall.width / 2) * TILE_SIZE;
    const hunter = placeMutant(world, hallX + 40 * TILE_SIZE, (hall.ty + 1) * TILE_SIZE, { hunts: true });

    world.player.x = world.player.prevX = hallX - 10 * TILE_SIZE;
    world.player.bowCooldown = 1_000;
    for (let i = 0; i < 20; i += 1) {
      world.player.bowCooldown = 1_000;
      world.tick();
    }
    expect(hunter.x).toBeLessThan(hallX + 40 * TILE_SIZE);
  });

  it('sortent des bases à partir de la nuit 2, un assaillant sur quelques-uns, le même à chaque partie', () => {
    const hunters = (night: number): number[] => {
      const world = new World(42);

      finish(world, world.townHallId);
      world.night = night;
      for (const base of world.enemyBases) base.raiders = 12;
      inner(world).spawnWave(1);
      return [...world.mobiles.values()].filter((mobile): mobile is Mutant => mobile.kind === 'mutant' && mobile.hunts === true).map((m) => m.id);
    };

    expect(hunters(1)).toEqual([]);
    expect(hunters(2).length).toBeGreaterThan(0);
    expect(hunters(2)).toEqual(hunters(2));
  });

  it('survivent à la sauvegarde', () => {
    const world = nightWorld(2);

    placeMutant(world, world.player.x + 10 * TILE_SIZE, world.player.y, { hunts: true });

    const copy = deserialize(JSON.parse(JSON.stringify(serialize(world))));

    expect([...copy.mobiles.values()].filter((m) => m.kind === 'mutant' && m.hunts)).toHaveLength(1);
  });
});

describe('le combo de nuit', () => {
  it('monte avec les mutants abattus d’affilée et fait gagner un multiplicateur', () => {
    const world = nightWorld();
    const seen: { count: number; multiplier: number }[] = [];

    world.events.on('comboGrew', (event) => seen.push(event));
    expect(world.combo()).toBeNull();
    for (let i = 0; i < COMBO.killsPerStep; i += 1) {
      kill(world, placeMutant(world, world.player.x + 20 * TILE_SIZE, world.player.y));
      world.tick();
    }
    expect(seen.map((event) => event.count)).toEqual([1, 2, 3]);
    expect(world.combo()).toMatchObject({ count: 3, multiplier: 1 + COMBO.stepMultiplier });

    // Trop lent : il retombe à un.
    for (let i = 0; i < COMBO.windowTicks; i += 1) world.tick();
    expect(world.combo()).toBeNull();
    kill(world, placeMutant(world, world.player.x + 20 * TILE_SIZE, world.player.y));
    expect(world.combo()).toMatchObject({ count: 1, multiplier: 1 });
  });

  it('tombe quand un bâtiment est frappé, bonus compris', () => {
    const world = nightWorld();
    const hall = world.entities.get(world.townHallId)!;
    const broken: number[] = [];

    world.events.on('comboBroken', ({ count }) => broken.push(count));
    for (let i = 0; i < 4; i += 1) kill(world, placeMutant(world, world.player.x + 20 * TILE_SIZE, world.player.y));
    expect(world.combo()?.count).toBe(4);

    // Un mutant au pied de la mairie la frappe.
    placeMutant(world, (hall.tx + hall.width / 2) * TILE_SIZE, (hall.ty + hall.height + 0.2) * TILE_SIZE);
    for (let i = 0; i < 40 && broken.length === 0; i += 1) world.tick();
    expect(broken).toEqual([4]);
    expect(world.combo()).toBeNull();
  });

  it('verse son Prestige à l’aube, et rien sans combo', () => {
    const world = nightWorld();
    const paid: { prestige: number; clean: boolean }[] = [];

    world.events.on('comboPaid', (event) => paid.push(event));
    for (let i = 0; i < 6; i += 1) kill(world, placeMutant(world, world.player.x + 20 * TILE_SIZE, world.player.y));
    // ×1 pour les deux premiers, ×1,5 pour les trois suivants, ×2 au sixième : 3 × 0,5 + 1 = 2,5, arrondi.
    const before = world.prestige;

    world.cycleStartTick = world.tickCount - NIGHTFALL - DAY_CYCLE.night + 1;
    for (let i = 0; i < 4; i += 1) world.tick();
    expect(world.clock()!.phase).toBe('dawn');
    expect(paid).toHaveLength(1);
    expect(paid[0]!.prestige).toBeGreaterThan(0);
    expect(world.prestige - before).toBeGreaterThanOrEqual(paid[0]!.prestige);
    expect(world.combo()).toBeNull();
  });
});

describe('la nuit nette', () => {
  it('raccourcit la nuit quand la vague est abattue toute, et paie son butin à l’aube', () => {
    const world = nightWorld();
    const shortened: number[] = [];
    const dawns: number[] = [];

    world.events.on('nightShortened', ({ ticks }) => shortened.push(ticks));
    world.events.on('dawnBroke', () => dawns.push(world.tickCount));

    const foe = placeMutant(world, world.player.x + 20 * TILE_SIZE, world.player.y);

    inner(world).bountyNight = 1;
    expect(world.clock()!.left).toBeGreaterThan(CLEAN_NIGHT.remainTicks);
    kill(world, foe);
    expect(shortened).toEqual([CLEAN_NIGHT.remainTicks]);
    expect(world.clock()!.left).toBe(CLEAN_NIGHT.remainTicks);
    expect(world.clock()!.phase).toBe('night');

    const plates = world.townStock()?.count('ironPlate') ?? 0;
    const killedAt = world.tickCount;

    for (let i = 0; i < CLEAN_NIGHT.remainTicks + 5; i += 1) world.tick();
    expect(dawns).toHaveLength(1);
    expect(dawns[0]! - killedAt).toBeLessThanOrEqual(CLEAN_NIGHT.remainTicks + 1);
    expect(world.townStock()!.count('ironPlate')).toBe(plates + CLEAN_NIGHT.reward.ironPlate);
    // L'aube dure jusqu'à l'heure normale du lever : le cycle, donc la météo, ne bouge pas.
    expect(world.clock()!.phase).toBe('dawn');
    expect(world.dayDial()!.day).toBe(2);
    for (let i = world.tickCount; i < world.cycleStartTick + CYCLE_TICKS - 1; i += 1) world.tick();
    expect(world.clock()!.phase).toBe('dawn');
    world.tick();
    expect(world.clock()).toMatchObject({ phase: 'day', cycle: 2, elapsed: 0 });
  });

  it('ne raccourcit pas une nuit où aucune vague n’est sortie', () => {
    const world = nightWorld();
    const left = world.clock()!.left;

    kill(world, placeMutant(world, world.player.x + 20 * TILE_SIZE, world.player.y));
    expect(world.clock()!.left).toBeLessThanOrEqual(left);
    expect(world.clock()!.left).toBeGreaterThan(CLEAN_NIGHT.remainTicks);
  });
});

describe('sauvegarde', () => {
  it('garde la recharge, le combo et la nuit nette', () => {
    const world = nightWorld();

    world.push({ type: 'castSkill', dx: 1, dy: 0 });
    world.tick();
    for (let i = 0; i < 4; i += 1) kill(world, placeMutant(world, world.player.x + 20 * TILE_SIZE, world.player.y));
    inner(world).bountyNight = 1;
    kill(world, placeMutant(world, world.player.x + 20 * TILE_SIZE, world.player.y));

    const copy = deserialize(JSON.parse(JSON.stringify(serialize(world))));

    expect(copy.skill()).toEqual(world.skill());
    expect(copy.skill().ready).toBe(false);
    expect(copy.combo()).toEqual(world.combo());
    expect(copy.combo()?.count).toBe(5);
    expect(copy.clock()!.left).toBe(CLEAN_NIGHT.remainTicks);
    expect(copy.checksum()).toBe(world.checksum());
  });
});
