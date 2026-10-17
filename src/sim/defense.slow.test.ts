import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, buildingLevel, type BuildingId } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { WAVE_STRENGTH } from '../data/enemies.ts';
import { CYCLE_TICKS } from './dayNight.ts';
import type { World} from './world.ts';
import { repairCost } from './world.ts';
import { addFactory, addTowers, guard, hallOf, jumpToNight, playThroughNight, queenOf, towersOf, worldWithTownHall } from './defenseKit.ts';

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

  it('Adam au loin, la mairie plie sans tomber pendant les nuits de grâce', () => {
    const world = worldWithTownHall(3);
    const hall = hallOf(world);
    const max = buildingLevel(hall.proto, hall.level).hp;
    let lowest = max;

    // Adam part loin, hors de portée de son arc : rien ne défend la mairie.
    world.player.x = world.player.prevX = (hall.tx + 60) * TILE_SIZE;
    world.player.y = world.player.prevY = (hall.ty + 60) * TILE_SIZE;
    for (let night = 1; night <= WAVE_STRENGTH.earlyCaps.length; night += 1) {
      playThroughNight(world, night, () => {
        lowest = Math.min(lowest, hallOf(world).hp);
      });
      expect(world.defeated).toBe(false);
    }
    expect(lowest).toBeGreaterThanOrEqual(Math.ceil(max * WAVE_STRENGTH.graceHallFloor));
    expect(lowest).toBeLessThan(max);
  }, 120_000);
});
