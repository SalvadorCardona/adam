import { describe, expect, it } from 'vitest';
import { TILE_SIZE, distanceSq } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { TEST_SCENARIOS } from '../data/testScenario.ts';
import { ENEMIES, WILDLIFE_SPAWN } from '../data/enemies.ts';
import { PIG_FARM, PIGS } from '../data/pigs.ts';
import { decodeSave, encodeSave, type SavedEntity } from './save.ts';
import { habitatAt } from './terrain.ts';
import type { Mutant, Pig, PigPen } from './types.ts';
import { pigSpotsOfChunk } from './pigs.ts';
import { stageScenario } from './testScenario.ts';
import { World } from './world.ts';

const SEED = 21;

interface Layout {
  world: World;
  penId: number;
  pen: { tx: number; ty: number };
}

/** Un carré de terre libre de 15 × 15 cases, à 20 cases de la mairie au moins : le terrain d'essai d'Adam et de ses cochons. */
function openGround(world: World, hall: { tx: number; ty: number }): { tx: number; ty: number } {
  for (let radius = 20; radius < 120; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;

        const tx = hall.tx + dx;
        const ty = hall.ty + dy;
        let free = true;

        for (let ox = -7; ox <= 7 && free; ox += 1) {
          for (let oy = -7; oy <= 7 && free; oy += 1) free = !world.isSolid(tx + ox, ty + oy);
        }
        if (free) return { tx, ty };
      }
    }
  }
  throw new Error('aucune clairière — la génération de terrain a changé');
}

/** La mairie finie et, à côté, un élevage vide (ou `pigs` cochons) ; Adam loin, les mobiles à poser à la main. */
function colony(options: { pigs?: number; store?: Record<string, number>; town?: Record<string, number> } = {}): Layout {
  const world = new World(SEED);
  const state = world.snapshot();
  const hall = world.entities.get(world.townHallId)!;
  let pen: { tx: number; ty: number } | null = null;

  for (let dx = 6; dx < 14 && !pen; dx += 1) {
    if (world.canPlace('pigPen', hall.tx + dx, hall.ty) === null) pen = { tx: hall.tx + dx, ty: hall.ty };
  }
  if (!pen) throw new Error('pas de place pour l’élevage');

  const penId = state.nextId;
  const entities: SavedEntity[] = [
    { kind: 'townHall', id: world.townHallId, proto: 'townHall', tx: hall.tx, ty: hall.ty, width: 3, height: 3, store: { food: 0, water: 40, ...options.town }, hp: BUILDINGS.townHall.hp, level: 1, paused: false, staff: BUILDINGS.townHall.workers },
    { kind: 'pigPen', id: penId, proto: 'pigPen', ...pen, width: 2, height: 2, store: options.store ?? {}, hp: BUILDINGS.pigPen.hp, level: 1, paused: false, staff: 0, pigs: options.pigs ?? 0, endTick: 0, blocked: true },
  ];

  const field = openGround(world, hall);

  state.player = { ...state.player, x: (field.tx + 0.5) * TILE_SIZE, y: (field.ty + 0.5) * TILE_SIZE };
  state.entities = entities;
  state.nextId = penId + 1;
  state.mobiles = [];
  return { world: World.restore(state), penId, pen };
}

function pigAt(world: World, x: number, y: number, state: Pig['state'] = 'wild'): Pig {
  const id = 7000 + world.mobiles.size;
  const pig: Pig = { kind: 'pig', id, x, y, prevX: x, prevY: y, facing: 'down', moving: false, state, denId: 0, homeX: x, homeY: y, dirX: 0, dirY: 0, wanderTicks: 0, tame: 0, loose: 0, fleeTicks: 0 };

  world.mobiles.set(id, pig);
  return pig;
}

type Privates = {
  dens: Map<number, { members: number; readyTick: number }>;
  restart(pen: PigPen): void;
  damageBuilding(id: number, amount: number): void;
};

/** Les rouages que le jeu ne montre pas : l'état d'un point de cochon, le réveil d'un élevage, un coup qui l'abat. */
const inside = (world: World): Privates => world as unknown as Privates;

function penOf(world: World, id: number): PigPen {
  const pen = world.entities.get(id);

  if (pen?.kind !== 'pigPen') throw new Error('pas d’élevage');
  return pen;
}

function run(world: World, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i += 1) {
    world.tick();
    each?.();
  }
}

/** Adam à `tiles` tuiles à droite du point. */
function beside(world: World, pig: { x: number; y: number }, tiles: number): void {
  world.player.x = world.player.prevX = pig.x + tiles * TILE_SIZE;
  world.player.y = world.player.prevY = pig.y;
}

describe('cochons sauvages', () => {
  it('n’apparaissent qu’en forêt, hors des arbres, et restent rares', () => {
    let spots = 0;
    let chunks = 0;

    for (const seed of [1, 7, 42, 1234]) {
      for (let cy = -6; cy <= 6; cy += 1) {
        for (let cx = -6; cx <= 6; cx += 1) {
          chunks += 1;
          for (const spot of pigSpotsOfChunk(seed, cx, cy)) {
            spots += 1;
            expect(habitatAt(seed, spot.tx, spot.ty)).toBe('forest');
          }
        }
      }
    }
    expect(spots).toBeGreaterThan(0);
    // Moins d'un point pour deux chunks : une trouvaille, pas un troupeau.
    expect(spots / chunks).toBeLessThan(0.5);
    expect(pigSpotsOfChunk(7, 2, -3)).toEqual(pigSpotsOfChunk(7, 2, -3));
  });

  it('sont paisibles : ils ne blessent pas Adam, et son arc ne les vise pas', () => {
    const { world } = colony();
    const pig = pigAt(world, world.player.x + 3 * TILE_SIZE, world.player.y);
    const hp = world.player.hp;

    run(world, 200);
    expect(world.player.hp).toBe(hp);
    expect(world.player.target).toBeNull();
    expect([...world.mobiles.values()].some((mobile) => mobile.kind === 'arrow')).toBe(false);
    expect(world.mobiles.get(pig.id)).toBeDefined();
  });

  it('naissent en forêt, hors de la vue d’Adam et loin de la mairie, jamais plus de un par point', () => {
    const world = new World(SEED);
    const hall = world.entities.get(world.townHallId)!;
    const startX = world.player.x;
    const startY = world.player.y;
    const seen = new Set<number>();

    for (let sy = -6; sy <= 6; sy += 2) {
      for (let sx = -6; sx <= 6; sx += 2) {
        world.player.x = world.player.prevX = startX + sx * 40 * TILE_SIZE;
        world.player.y = world.player.prevY = startY + sy * 40 * TILE_SIZE;
        for (let i = 0; i < WILDLIFE_SPAWN.checkTicks; i += 1) world.tick();
        for (const pig of world.pigs()) {
          if (seen.has(pig.id)) continue;
          seen.add(pig.id);
          expect(pig.state).toBe('wild');
          expect(habitatAt(SEED, Math.floor(pig.homeX / TILE_SIZE), Math.floor(pig.homeY / TILE_SIZE))).toBe('forest');
          expect(Math.hypot(pig.x - world.player.x, pig.y - world.player.y)).toBeGreaterThanOrEqual(WILDLIFE_SPAWN.minPlayerDistance * TILE_SIZE - TILE_SIZE);
          expect(Math.hypot(pig.x - (hall.tx + 1.5) * TILE_SIZE, pig.y - (hall.ty + 1.5) * TILE_SIZE)).toBeGreaterThan(PIGS.wild.townHallClearance * TILE_SIZE);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(0);
    // Un seul cochon par point : le point occupé n'en refait pas.
    const homes = [...world.pigs()].filter((pig) => pig.denId !== 0).map((pig) => pig.denId);

    expect(new Set(homes).size).toBe(homes.length);
  }, 60_000);

  it('un point vidé par un cochon apprivoisé se repeuple plus tard (réglage de la config)', () => {
    const { world } = colony();
    const pig = pigAt(world, world.player.x + 1 * TILE_SIZE, world.player.y);

    pig.denId = 123456;
    inside(world).dens.set(123456, { members: 1, readyTick: 0 });
    run(world, PIGS.tame.ticks + 1);
    expect(pig.state).toBe('follow');

    const spot = inside(world).dens.get(123456)!;

    expect(spot.members).toBe(0);
    expect(spot.readyTick - world.tickCount).toBeGreaterThan(PIGS.wild.respawnTicks - 10);
  });
});

describe('apprivoisement', () => {
  it('Adam reste près du cochon un instant : il le suit', () => {
    const { world } = colony();
    const pig = pigAt(world, world.player.x + 1.5 * TILE_SIZE, world.player.y);
    let tamed = 0;

    world.events.on('pigTamed', () => (tamed += 1));
    run(world, PIGS.tame.ticks - 5);
    expect(pig.state).toBe('wild');
    run(world, 10);
    expect(pig.state).toBe('follow');
    expect(tamed).toBe(1);
  });

  it('de loin, rien : et la jauge retombe quand Adam s’éloigne', () => {
    const { world } = colony();
    const pig = pigAt(world, world.player.x + 1.5 * TILE_SIZE, world.player.y);

    run(world, 15);
    expect(pig.tame).toBeGreaterThan(0);
    beside(world, pig, 8);
    run(world, 40);
    expect(pig.tame).toBe(0);
    expect(pig.state).toBe('wild');
  });

  it('un seul cochon suit Adam à la fois', () => {
    const { world } = colony();
    const first = pigAt(world, world.player.x + 1 * TILE_SIZE, world.player.y);
    const second = pigAt(world, world.player.x - 1 * TILE_SIZE, world.player.y);

    run(world, PIGS.tame.ticks * 3);
    expect([first.state, second.state].filter((state) => state === 'follow')).toHaveLength(1);
  });
});

describe('suivi', () => {
  it('le cochon apprivoisé suit Adam qui marche', () => {
    const { world } = colony();
    const pig = pigAt(world, world.player.x + 1.5 * TILE_SIZE, world.player.y, 'follow');

    for (let i = 0; i < 30; i += 1) {
      world.player.x += 0.25 * TILE_SIZE;
      world.player.prevX = world.player.x;
      run(world, 1);
    }
    run(world, 40);
    expect(pig.state).toBe('follow');
    expect(Math.hypot(pig.x - world.player.x, pig.y - world.player.y)).toBeLessThanOrEqual((PIGS.follow.distance + 1) * TILE_SIZE);
  });

  it('s’il est laissé trop loin, il s’enfuit puis redevient sauvage — sans disparaître', () => {
    const { world } = colony();
    const pig = pigAt(world, world.player.x + 1.5 * TILE_SIZE, world.player.y, 'follow');
    let fled = '';

    world.events.on('pigFled', ({ reason }) => (fled = reason));
    beside(world, pig, PIGS.follow.looseDistance + 10);
    run(world, PIGS.follow.patienceTicks + 1);
    expect(pig.state).toBe('flee');
    expect(fled).toBe('lost');
    run(world, PIGS.flee.ticks + 1);
    expect(pig.state).toBe('wild');
    expect(world.mobiles.get(pig.id)).toBe(pig);
    // Retrouvé, il se laisse apprivoiser de nouveau.
    beside(world, pig, 1);
    run(world, PIGS.tame.ticks + 1);
    expect(pig.state).toBe('follow');
  });

  it('un mutant ou une bête qui approche l’effraie', () => {
    const { world } = colony();
    const pig = pigAt(world, world.player.x + 1.5 * TILE_SIZE, world.player.y, 'follow');
    const mutant: Mutant = {
      kind: 'mutant',
      id: 8000,
      proto: 'mutant',
      x: pig.x + 2 * TILE_SIZE,
      y: pig.y,
      prevX: pig.x + 2 * TILE_SIZE,
      prevY: pig.y,
      facing: 'down',
      moving: false,
      hp: ENEMIES.mutant.hp,
      age: 30,
      attackCooldown: 0,
      emerge: 0,
    };
    let fled = '';

    world.events.on('pigFled', ({ reason }) => (fled = reason));
    world.mobiles.set(mutant.id, mutant);
    run(world, 2);
    expect(pig.state).toBe('flee');
    expect(fled).toBe('scare');
    // Il file à l'opposé du danger.
    expect(pig.dirX).toBeLessThan(0);
  });
});

describe('élevage', () => {
  it('le cochon qui suit Adam y entre ; l’élevage lance son cycle', () => {
    const { world, penId, pen } = colony();
    const target = { x: (pen.tx + 1) * TILE_SIZE, y: (pen.ty + 1) * TILE_SIZE };
    // Adam s'arrête au bord de l'enclos, le cochon sur ses talons.
    world.player.x = world.player.prevX = target.x + 2.6 * TILE_SIZE;
    world.player.y = world.player.prevY = target.y;

    const pig = pigAt(world, target.x + 4 * TILE_SIZE, target.y, 'follow');
    let penned = 0;

    world.events.on('pigPenned', ({ pigs }) => (penned = pigs));
    run(world, 60);

    expect(penOf(world, penId).pigs).toBe(1);
    expect(penned).toBe(1);
    expect(world.mobiles.has(pig.id)).toBe(false);
    expect(penOf(world, penId).blocked).toBe(false);
    expect(penOf(world, penId).endTick).toBeGreaterThan(world.tickCount);
  });

  it('sans cochon, il ne produit rien et une bulle le dit', () => {
    const { world, penId } = colony();

    run(world, PIG_FARM.cycleTicks + 200);
    expect(penOf(world, penId).store.count('meat')).toBe(0);
    expect(world.problem(penOf(world, penId))).toBe('noPig');
  });

  it('avec un cochon, il donne de la viande à chaque cycle', () => {
    const { world, penId } = colony({ pigs: 1 });

    inside(world).restart(penOf(world, penId));
    expect(world.problem(penOf(world, penId))).toBeNull();
    run(world, PIG_FARM.cycleTicks + 5);
    expect(penOf(world, penId).store.count('meat')).toBe(PIG_FARM.meatPerPig);
    run(world, PIG_FARM.cycleTicks);
    expect(penOf(world, penId).store.count('meat')).toBe(PIG_FARM.meatPerPig * 2);
  });

  it('un cochon de plus, plus de viande', () => {
    const { world, penId } = colony({ pigs: 2 });

    inside(world).restart(penOf(world, penId));
    run(world, PIG_FARM.cycleTicks + 5);
    expect(penOf(world, penId).store.count('meat')).toBe(PIG_FARM.meatPerPig * 2);
  });

  it('du grain en ville accélère le cycle, et en prend', () => {
    const { world, penId } = colony({ pigs: 1, town: { food: 100 } });
    const { amount, speed } = PIG_FARM.feed;

    inside(world).restart(penOf(world, penId));
    const fedTicks = Math.ceil(PIG_FARM.cycleTicks * speed);

    run(world, fedTicks + 5);
    expect(penOf(world, penId).store.count('meat')).toBe(PIG_FARM.meatPerPig);
    expect(world.townStock()!.count('food')).toBeLessThanOrEqual(100 - amount);
  });

  it('sans grain de trop en ville, le cycle garde sa durée', () => {
    const { world, penId } = colony({ pigs: 1, town: { food: 0 } });

    inside(world).restart(penOf(world, penId));
    run(world, Math.ceil(PIG_FARM.cycleTicks * PIG_FARM.feed.speed) + 5);
    expect(penOf(world, penId).store.count('meat')).toBe(0);
  });

  it('coffre plein, il s’endort ; vidé, il repart', () => {
    const { world, penId } = colony({ pigs: 1, store: { meat: BUILDINGS.pigPen.storage - 1 } });

    inside(world).restart(penOf(world, penId));
    run(world, PIG_FARM.cycleTicks + 5);
    expect(penOf(world, penId).blocked).toBe(true);
    expect(world.problem(penOf(world, penId))).toBe('storeFull');
    world.withdraw(penId, 'meat', 100);
    expect(penOf(world, penId).blocked).toBe(false);
  });

  it('abattu, il lâche ses cochons, qui s’enfuient avant de se calmer', () => {
    const { world, penId } = colony({ pigs: 2 });
    let escaped = 0;

    world.events.on('pigsEscaped', ({ count }) => (escaped = count));
    inside(world).damageBuilding(penId, 9999);
    expect(escaped).toBe(2);
    expect([...world.pigs()].filter((pig) => pig.state === 'flee')).toHaveLength(2);
    run(world, PIGS.flee.ticks + 5);
    expect([...world.pigs()].every((pig) => pig.state === 'wild')).toBe(true);
  });
});

/** La partie écrite puis relue, comme au rechargement de la page. */
function reload(world: World): World {
  const decoded = decodeSave(encodeSave(world, 0));

  if (!decoded.ok) throw new Error('sauvegarde illisible');
  return decoded.world;
}

describe('sauvegarde', () => {
  it('garde le cochon qui suit Adam et ceux de l’élevage', () => {
    const { world, penId } = colony({ pigs: 2 });
    const pig = pigAt(world, world.player.x + 2 * TILE_SIZE, world.player.y, 'follow');

    pig.loose = 17;
    inside(world).restart(penOf(world, penId));
    run(world, 30);

    const loaded = reload(world);
    const back = loaded.followingPig()!;

    expect(back).toMatchObject({ id: pig.id, state: 'follow', loose: pig.loose });
    expect(penOf(loaded, penId)).toMatchObject({ pigs: 2, blocked: false });
    expect(penOf(loaded, penId).endTick).toBe(penOf(world, penId).endTick);
    // Le cycle continue après le rechargement.
    run(loaded, PIG_FARM.cycleTicks + 5);
    expect(penOf(loaded, penId).store.count('meat')).toBeGreaterThan(0);
  });

  it('une ancienne sauvegarde, sans cochon, se charge sans erreur', () => {
    expect(() => reload(new World(SEED))).not.toThrow();
  });

  it('refuse un élevage qui loge plus de cochons que sa capacité', () => {
    const { world } = colony({ pigs: PIG_FARM.capacity });
    const saved = JSON.parse(encodeSave(world, 0)) as { state: { entities: { kind: string; pigs?: number }[] } };

    saved.state.entities.find((entity) => entity.kind === 'pigPen')!.pigs = PIG_FARM.capacity + 1;
    expect(decodeSave(JSON.stringify(saved)).ok).toBe(false);
  });
});

describe('distance', () => {
  it('le cochon sauvage reste dans sa laisse en flânant', () => {
    const { world } = colony();
    const pig = pigAt(world, world.player.x + 10 * TILE_SIZE, world.player.y);

    run(world, 400);
    expect(distanceSq(pig.x, pig.y, pig.homeX, pig.homeY)).toBeLessThanOrEqual(((PIGS.wild.leashRadius + 1) * TILE_SIZE) ** 2);
  });
});

describe('la boucle forêt → base', () => {
  it('on trouve un cochon, on l’apprivoise, il suit Adam jusqu’à l’élevage, qui donne ensuite de la viande', () => {
    const world = stageScenario(TEST_SCENARIOS.pigs);
    const pig = [...world.pigs()][0]!;
    const pen = [...world.entities.values()].find((entity): entity is PigPen => entity.kind === 'pigPen')!;
    const door = { x: (pen.tx + pen.width / 2) * TILE_SIZE, y: (pen.ty + pen.height + 1) * TILE_SIZE };

    // Le cochon est sauvage, tout près : Adam reste là un instant.
    expect(pig.state).toBe('wild');
    beside(world, pig, 1.5);
    run(world, PIGS.tame.ticks + 2);
    expect(pig.state).toBe('follow');

    // Adam rentre à la base, d'un pas régulier, le cochon sur ses talons.
    for (let guard = 0; guard < 2000 && penOf(world, pen.id).pigs === 0; guard += 1) {
      const dx = door.x - world.player.x;
      const dy = door.y - world.player.y;
      const length = Math.hypot(dx, dy);

      if (length > 6) {
        world.player.x = world.player.prevX = world.player.x + (dx / length) * 5;
        world.player.y = world.player.prevY = world.player.y + (dy / length) * 5;
      }
      world.tick();
    }
    expect(penOf(world, pen.id).pigs).toBe(1);
    expect(world.mobiles.has(pig.id)).toBe(false);

    run(world, PIG_FARM.cycleTicks + 5);
    expect(penOf(world, pen.id).store.count('meat')).toBeGreaterThanOrEqual(PIG_FARM.meatPerPig);
  }, 30_000);
});
