import { describe, expect, it } from 'vitest';
import { TILE_SIZE, distanceSq, floorDiv } from '../core/grid.ts';
import { mulberry32 } from '../core/rng.ts';
import { ENEMIES, WILDLIFE, WILDLIFE_SPAWN, type WildlifeId } from '../data/enemies.ts';
import { DEATH } from '../data/death.ts';
import { WEAPONS } from '../data/weapons.ts';
import { nearestFoe } from './combat.ts';
import { PLAYER_MAX_HP } from './player.ts';
import { habitatAt } from './terrain.ts';
import type { Beast, Mutant } from './types.ts';
import { densOfChunk, stepBeast } from './wildlife.ts';
import { TICKS_PER_SECOND, World } from './world.ts';

const SEEDS = [1, 7, 42, 1234, 98765];

function beasts(world: World): Beast[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Beast => mobile.kind === 'beast');
}

function beastAt(proto: WildlifeId, x: number, y: number, id = 900): Beast {
  return {
    kind: 'beast',
    id,
    proto,
    x,
    y,
    prevX: x,
    prevY: y,
    facing: 'down',
    moving: false,
    hp: WILDLIFE[proto].hp,
    age: 3,
    denId: 0,
    homeX: x,
    homeY: y,
    state: 'roam',
    dirX: 0,
    dirY: 0,
    wanderTicks: 0,
    attackCooldown: 0,
  };
}

function mutantAt(x: number, y: number, id = 800): Mutant {
  return {
    kind: 'mutant',
    id,
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
  };
}

/** Promène Adam sur un grand carré autour du départ, et laisse la faune apparaître à chaque étape. */
function roam(world: World, steps = 6, stride = 40): void {
  const startX = world.player.x;
  const startY = world.player.y;

  for (let sy = -steps; sy <= steps; sy += 2) {
    for (let sx = -steps; sx <= steps; sx += 2) {
      world.player.x = world.player.prevX = startX + sx * stride * TILE_SIZE;
      world.player.y = world.player.prevY = startY + sy * stride * TILE_SIZE;
      for (let i = 0; i < WILDLIFE_SPAWN.checkTicks; i += 1) world.tick();
    }
  }
}

/** Le centre d'une tuile d'habitat donné, en cherchant en spirale depuis l'origine. */
function findHabitat(seed: number, habitat: 'shore' | 'forest', solid: (tx: number, ty: number) => boolean): { x: number; y: number } {
  for (let radius = 0; radius < 400; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (habitatAt(seed, dx, dy) !== habitat || solid(dx, dy)) continue;
        // Une tuile au milieu de son habitat : ses quatre voisines en sont aussi.
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => habitatAt(seed, dx + ox!, dy + oy!) !== habitat || solid(dx + ox!, dy + oy!))) continue;
        return { x: (dx + 0.5) * TILE_SIZE, y: (dy + 0.5) * TILE_SIZE };
      }
    }
  }
  throw new Error(`pas de ${habitat} près de l'origine`);
}

describe('tanières', () => {
  it('ne mettent les crabes que sur la rive, et les loups qu’en forêt', () => {
    // Les gardiens n'ont pas de tanière : leur base les loge.
    const count: Record<WildlifeId, number> = { crab: 0, wolf: 0, guardian: 0, spitter: 0, chief: 0, greatWolf: 0, giantCrab: 0, colossus: 0, sludgeKing: 0 };

    for (const seed of SEEDS) {
      for (let cy = -4; cy <= 4; cy += 1) {
        for (let cx = -4; cx <= 4; cx += 1) {
          for (const den of densOfChunk(seed, cx, cy)) {
            count[den.species] += 1;
            expect(habitatAt(seed, den.tx, den.ty), `${den.species} en (${den.tx}, ${den.ty})`).toBe(WILDLIFE[den.species].habitat);
          }
        }
      }
    }
    // Les deux espèces existent bel et bien sur ces cartes.
    expect(count.crab).toBeGreaterThan(10);
    expect(count.wolf).toBeGreaterThan(10);
    expect(count.guardian + count.spitter + count.chief).toBe(0);
  });

  it('sont les mêmes pour la même seed, et différentes pour une autre', () => {
    expect(densOfChunk(7, 2, -3)).toEqual(densOfChunk(7, 2, -3));

    const all = (seed: number): string =>
      JSON.stringify([-2, -1, 0, 1, 2].flatMap((cx) => densOfChunk(seed, cx, 1)));

    expect(all(7)).not.toBe(all(8));
  });
});

describe('apparition', () => {
  it.each(SEEDS)('fait naître les bêtes sur leur habitat, hors de la vue d’Adam et loin de la mairie (seed %i)', (seed) => {
    const world = new World(seed);
    const hall = world.entities.get(world.townHallId)!;
    const hallX = (hall.tx + hall.width / 2) * TILE_SIZE;
    const hallY = (hall.ty + hall.height / 2) * TILE_SIZE;
    const seen = new Set<number>();
    let spawned = 0;

    const check = (): void => {
      for (const beast of beasts(world)) {
        // Les gardiens sortent de leur base, pas d'une tanière (`enemyBases.test.ts`).
        if (seen.has(beast.id) || beast.guardOf !== undefined) continue;
        seen.add(beast.id);
        spawned += 1;

        const tx = floorDiv(beast.x, TILE_SIZE);
        const ty = floorDiv(beast.y, TILE_SIZE);
        const near = WILDLIFE_SPAWN.minPlayerDistance * TILE_SIZE - TILE_SIZE;
        const hallClear = WILDLIFE_SPAWN.townHallClearance * TILE_SIZE - TILE_SIZE;

        expect(habitatAt(seed, tx, ty)).toBe(WILDLIFE[beast.proto].habitat);
        expect(distanceSq(beast.x, beast.y, world.player.x, world.player.y)).toBeGreaterThanOrEqual(near * near);
        expect(distanceSq(beast.x, beast.y, hallX, hallY)).toBeGreaterThanOrEqual(hallClear * hallClear);
      }
    };

    const startX = world.player.x;
    const startY = world.player.y;

    for (let sy = -4; sy <= 4; sy += 2) {
      for (let sx = -4; sx <= 4; sx += 2) {
        world.player.x = world.player.prevX = startX + sx * 40 * TILE_SIZE;
        world.player.y = world.player.prevY = startY + sy * 40 * TILE_SIZE;
        for (let i = 0; i < WILDLIFE_SPAWN.checkTicks; i += 1) {
          world.tick();
          check();
        }
      }
    }
    expect(spawned).toBeGreaterThan(0);
  });

  it('ne dépasse jamais le plafond', () => {
    for (const seed of SEEDS) {
      const world = new World(seed);

      roam(world);
      expect(beasts(world).length).toBeLessThanOrEqual(WILDLIFE_SPAWN.cap);
    }
  });

  it('laisse le départ paisible : aucun loup près du point d’apparition', () => {
    for (const seed of SEEDS) {
      const world = new World(seed);
      const limit = (WILDLIFE_SPAWN.townHallClearance - WILDLIFE.wolf.leashRadius) * TILE_SIZE;
      const startX = world.player.x;
      const startY = world.player.y;

      // Une minute de flânerie sans bouger d'un pouce.
      for (let i = 0; i < 60 * TICKS_PER_SECOND; i += 1) {
        world.tick();

        for (const beast of beasts(world)) {
          if (beast.proto !== 'wolf') continue;
          expect(distanceSq(beast.x, beast.y, startX, startY)).toBeGreaterThan(limit * limit);
        }
      }
      expect(world.player.hp).toBe(PLAYER_MAX_HP);
    }
  });

  it('est déterministe : même seed, mêmes commandes, mêmes bêtes', () => {
    const run = (seed: number): string => {
      const world = new World(seed);

      roam(world, 4);
      world.push({ type: 'setMoveAxis', x: 1, y: 0.3 });
      for (let i = 0; i < 200; i += 1) world.tick();

      return JSON.stringify(beasts(world).map(({ id, proto, x, y, hp, state }) => ({ id, proto, x, y, hp, state })));
    };

    expect(run(42)).toBe(run(42));
    expect(run(42)).not.toBe(run(43));
  });

  it('garde les crabes sur la rive, même en flânant longtemps', () => {
    for (const seed of SEEDS) {
      const world = new World(seed);

      roam(world, 4);
      for (let i = 0; i < 30 * TICKS_PER_SECOND; i += 1) world.tick();

      for (const beast of beasts(world)) {
        if (beast.proto !== 'crab') continue;
        expect(habitatAt(seed, floorDiv(beast.x, TILE_SIZE), floorDiv(beast.y, TILE_SIZE))).toBe('shore');
      }
    }
  });
});

describe('comportement', () => {
  const SEED = 7;
  const never = (): boolean => false;

  it('un loup charge Adam dans son rayon, puis rentre à la forêt quand il s’éloigne', () => {
    const home = findHabitat(SEED, 'forest', never);
    const wolf = beastAt('wolf', home.x, home.y);
    const rng = mulberry32(1);
    const adam = { x: home.x + (WILDLIFE.wolf.aggroRadius - 1) * TILE_SIZE, y: home.y };

    stepBeast(wolf, adam, never, SEED, rng, 1 / TICKS_PER_SECOND);
    expect(wolf.state).toBe('chase');
    expect(wolf.x).toBeGreaterThan(home.x);

    // Adam file : au-delà du rayon d'abandon, le loup rentre chez lui.
    adam.x = home.x + (WILDLIFE.wolf.giveUpRadius + 2) * TILE_SIZE;
    stepBeast(wolf, adam, never, SEED, rng, 1 / TICKS_PER_SECOND);
    expect(wolf.state).toBe('return');

    for (let i = 0; i < 200 && wolf.state === 'return'; i += 1) stepBeast(wolf, adam, never, SEED, rng, 1 / TICKS_PER_SECOND);
    expect(wolf.state).toBe('roam');
    expect(distanceSq(wolf.x, wolf.y, home.x, home.y)).toBeLessThanOrEqual(TILE_SIZE * TILE_SIZE);
  });

  it('un loup au contact mord, puis attend sa cadence', () => {
    const home = findHabitat(SEED, 'forest', never);
    const wolf = beastAt('wolf', home.x, home.y);
    const adam = { x: home.x + 16, y: home.y };
    const rng = mulberry32(1);
    const strikes: boolean[] = [];

    for (let i = 0; i <= WILDLIFE.wolf.attackTicks; i += 1) strikes.push(stepBeast(wolf, adam, never, SEED, rng, 0.05).strikes);

    expect(strikes[0]).toBe(true);
    expect(strikes.filter(Boolean)).toHaveLength(2);
  });

  it('un crabe ne pince que de près, et ne quitte jamais le sable pour poursuivre', () => {
    const home = findHabitat(SEED, 'shore', never);
    const crab = beastAt('crab', home.x, home.y);
    const rng = mulberry32(1);

    // Hors de son petit rayon : il ne s'occupe pas d'Adam.
    stepBeast(crab, { x: home.x + (WILDLIFE.crab.aggroRadius + 1) * TILE_SIZE, y: home.y }, never, SEED, rng, 0.05);
    expect(crab.state).toBe('roam');

    // Adam tout près, puis qui recule sur l'herbe : le crabe le suit jusqu'au bord du sable, pas au-delà.
    for (let i = 0; i < 100; i += 1) {
      stepBeast(crab, { x: home.x + TILE_SIZE * 1.5, y: home.y + TILE_SIZE * 1.5 }, never, SEED, rng, 0.05);
      expect(habitatAt(SEED, floorDiv(crab.x, TILE_SIZE), floorDiv(crab.y, TILE_SIZE))).toBe('shore');
    }
  });
});

describe('tir automatique', () => {
  it('vise l’ennemi le plus proche, mutant ou bête', () => {
    const crab = beastAt('crab', 70, 0);
    const mutant = mutantAt(40, 30);
    const wolf = beastAt('wolf', -120, 0, 901);

    expect(nearestFoe([crab, mutant, wolf], 0, 0, WEAPONS.bow.range)).toBe(mutant);
    expect(nearestFoe([crab, wolf], 0, 0, WEAPONS.bow.range)).toBe(crab);
    expect(nearestFoe([wolf], 0, 0, 2)).toBeNull();
  });

  it('Adam tire seul sur la bête la plus proche, la marque, et l’abat', () => {
    const world = new World(SEEDS[1]!);
    const { player } = world;
    const near = beastAt('crab', player.x + 3 * TILE_SIZE, player.y, 9001);
    const far = mutantAt(player.x - 5 * TILE_SIZE, player.y, 9002);
    const shots: { x: number; y: number }[] = [];
    let died: WildlifeId | null = null;

    // Une bête posée à la main : elle n'a pas de tanière et, sur l'herbe, ne bouge pas.
    near.state = 'return';
    near.homeX = near.x;
    near.homeY = near.y;
    world.mobiles.set(near.id, near);
    world.mobiles.set(far.id, far);
    world.events.on('arrowShot', (shot) => shots.push(shot));
    world.events.on('beastDied', ({ proto }) => (died = proto));

    world.tick();
    expect(player.target).toBe(near.id);
    expect(shots).toHaveLength(1);

    for (let i = 0; i < 40 && died === null; i += 1) world.tick();
    expect(died).toBe('crab');

    // Le crabe tombé, la cible passe au mutant.
    world.tick();
    expect(player.target).toBe(far.id);
  });

  it('ne vise rien quand rien n’est à portée', () => {
    const world = new World(SEEDS[1]!);
    const { player } = world;

    world.mobiles.set(9003, mutantAt(player.x + (WEAPONS.bow.range + 3) * TILE_SIZE, player.y, 9003));
    world.tick();
    expect(player.target).toBeNull();
  });
});

describe('Adam blessé', () => {
  it('perd des points de vie sous les crocs, puis tombe et ne se relève qu’après le décompte, remis sur pied', () => {
    const world = new World(SEEDS[2]!);
    const { player } = world;
    const wolf = beastAt('wolf', player.x + 20, player.y, 9004);
    const hurt: number[] = [];
    let knocked = false;
    let risen = false;

    wolf.state = 'chase';
    wolf.homeX = player.x;
    wolf.homeY = player.y;
    world.mobiles.set(wolf.id, wolf);
    world.events.on('playerHurt', ({ hp }) => hurt.push(hp));
    world.events.on('playerKnockedOut', () => (knocked = true));
    world.events.on('playerRespawned', () => (risen = true));

    // L'arc riposte : on retire la bête du jeu de l'arc en lui laissant des points de vie à revendre.
    wolf.hp = 1000;

    for (let i = 0; i < 20 * WILDLIFE.wolf.attackTicks && !knocked; i += 1) world.tick();

    expect(hurt[0]).toBe(PLAYER_MAX_HP - WILDLIFE.wolf.damage);
    expect(knocked).toBe(true);
    expect(world.dead).toBe(true);
    expect(world.respawnSeconds()).toBe(DEATH.respawnSeconds);

    // À terre : ni pas, ni coup de plus, et le monde tourne.
    const fallenAt = { x: player.x, y: player.y };
    const tickAtFall = world.tickCount;

    world.push({ type: 'setMoveAxis', x: 1, y: 0 });
    for (let i = 0; i < DEATH.respawnSeconds * 20 - 2; i += 1) world.tick();
    expect(world.dead).toBe(true);
    expect(risen).toBe(false);
    expect(player.x).toBe(fallenAt.x);
    expect(player.y).toBe(fallenAt.y);
    expect(player.hp).toBe(0);
    expect(world.tickCount).toBe(tickAtFall + DEATH.respawnSeconds * 20 - 2);

    world.tick();
    expect(risen).toBe(true);
    expect(world.dead).toBe(false);
    expect(player.hp).toBe(PLAYER_MAX_HP);
  });

  it('la mort se sauvegarde : recharger ne raccourcit pas l’attente', () => {
    const world = new World(SEEDS[2]!);

    // Chute directe : un coup de plus que ses points de vie.
    (world as unknown as { hurtPlayer(by: number, damage: number): void }).hurtPlayer(9005, PLAYER_MAX_HP);
    for (let i = 0; i < 100; i += 1) world.tick();

    const left = world.respawnTicks;
    const copy = World.restore(JSON.parse(JSON.stringify(world.snapshot())));
    expect(left).toBeGreaterThan(0);
    expect(copy.respawnTicks).toBe(left);
    expect(copy.dead).toBe(true);
  });

  it('récupère au calme', () => {
    const world = new World(SEEDS[2]!);

    world.player.hp = PLAYER_MAX_HP - 3;
    for (let i = 0; i < 20 * TICKS_PER_SECOND; i += 1) world.tick();
    expect(world.player.hp).toBe(PLAYER_MAX_HP);
  });
});
