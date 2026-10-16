import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { REPAIR, buildingLevel } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { ENEMIES, QUEEN, WAVE_STRENGTH, nightBosses, queenWave } from '../data/enemies.ts';
import type { ItemId } from '../data/items.ts';
import { isTargetable } from './combat.ts';
import { raidCapacity } from './enemyBases.ts';
import { queenPhase } from './enemies.ts';
import { earlyCap } from './waves.ts';
import { deserialize, serialize } from './save.ts';
import type { Mutant } from './types.ts';
import { repairCost } from './world.ts';
import { addTowers, centerOf, hallOf, jumpToNight, placeQueen, towersOf, worldWithTownHall } from './defenseKit.ts';

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


describe('Reine des flaques — calendrier', () => {
  it('sort aux nuits 10, 15, 20 ; la nuit 6 garde son gros mutant', () => {
    expect(nightBosses(10).queen).toBe(1);
    expect(queenWave(10)).not.toBeNull();
    expect(queenWave(15)).not.toBeNull();
    expect(queenWave(20)).not.toBeNull();

    for (const night of [1, 4, 5, 6, 9, 11, 14, 16]) expect(queenWave(night), `nuit ${night}`).toBeNull();
    expect(nightBosses(6).brute).toBe(1);
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

describe('sortie de grâce', () => {
  const SEEDS = [1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13, 42, 99, 100, 1234];

  it('le plafond monte d’un ou deux par nuit, sans saut de plus de ×1,6', () => {
    const caps = WAVE_STRENGTH.earlyCaps;

    expect(caps.length).toBeGreaterThanOrEqual(8);
    expect(caps.slice(0, WAVE_STRENGTH.graceNights + 1)).toEqual([2, 3, 4, 4]);
    caps.slice(1).forEach((cap, k) => {
      expect(cap - caps[k]!, `nuit ${k + 2}`).toBeGreaterThanOrEqual(0);
      expect(cap - caps[k]!, `nuit ${k + 2}`).toBeLessThanOrEqual(2);
      expect(cap / caps[k]!, `nuit ${k + 2}`).toBeLessThanOrEqual(1.6);
    });
  });

  it('la vague la plus forte que les bases permettent, nuits 1 à 8, ne saute jamais de plus de ×1,6', () => {
    for (const seed of SEEDS) {
      const { enemyBases } = worldWithTownHall(seed);
      // Les bases pleines, plafond commun appliqué : le plus que la carte puisse lâcher cette nuit-là.
      const ceiling = (night: number): number =>
        Math.min(earlyCap(night), enemyBases.reduce((sum, base) => sum + raidCapacity(base.level, night), 0)) +
        Object.values(nightBosses(night)).reduce((sum, n) => sum + n, 0);
      const counts = Array.from({ length: 8 }, (_, k) => ceiling(k + 1));

      counts.slice(1).forEach((count, k) => {
        if (counts[k] === 0) return;
        expect(count / counts[k]!, `graine ${seed}, nuit ${k + 2} : ${counts.join(', ')}`).toBeLessThanOrEqual(1.6);
      });
    }
  });

  it('Ève prévient au crépuscule de la première nuit sans grâce, et de celle-là seule', () => {
    const world = worldWithTownHall(42);
    const warned: number[] = [];

    world.events.on('graceEnding', ({ night }) => warned.push(night));
    for (const night of [2, 3, 4, 5]) {
      jumpToNight(world, night, DAY_CYCLE.dusk);
      world.tick();
    }
    expect(warned).toEqual([WAVE_STRENGTH.graceNights + 1]);
  });
});
