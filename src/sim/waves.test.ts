import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, RUIN, type BuildingId } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { ENEMIES, WAVE_BOUNTY, WAVE_STRENGTH, WAVE_WARNING, isBossNight } from '../data/enemies.ts';
import type { ItemId } from '../data/items.ts';
import { OBJECTIVES } from '../data/objectives.ts';
import { CYCLE_TICKS } from './dayNight.ts';
import { breed, raidCapacity, raidTicks } from './enemyBases.ts';
import type { Building, EnemyBase, EntityId, Mutant } from './types.ts';
import { eraOf, projectedRaiders, reinforcements, waveBounty } from './waves.ts';
import { World, type WaveForecast } from './world.ts';

/** Un chantier achevé d'office : son coût dans le sac, Adam à portée le temps de « Transférer ». */
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

function worldWithTownHall(seed = 42): World {
  const world = new World(seed);

  finish(world, world.townHallId);
  return world;
}

/** Pose et achève `building` à la première case libre autour de (tx, ty), dans un rayon `reach`. */
function buildNear(world: World, building: BuildingId, tx: number, ty: number, reach = 6): Building {
  const { x, y } = world.player;

  for (let r = 0; r <= reach; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        world.player.x = (tx + dx + 0.5) * TILE_SIZE;
        world.player.y = (ty + dy + 3.5) * TILE_SIZE;
        if (world.canPlace(building, tx + dx, ty + dy) !== null) continue;

        const before = new Set(world.entities.keys());

        world.push({ type: 'placeBuilding', building, tx: tx + dx, ty: ty + dy });
        world.tick();
        world.player.x = world.player.prevX = x;
        world.player.y = world.player.prevY = y;

        const id = [...world.entities.keys()].find((key) => !before.has(key));

        if (id === undefined) throw new Error('le chantier n’a pas été ouvert');
        return finish(world, id);
      }
    }
  }
  world.player.x = x;
  world.player.y = y;
  throw new Error(`pas de place pour : ${building}`);
}

/** Un mutant posé à la main, déjà sorti de terre, à (x, y). */
function placeMutant(world: World, x: number, y: number, id = 91_000): Mutant {
  const mutant: Mutant = {
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

  world.mobiles.set(id, mutant);
  return mutant;
}

/** Une base de niveau 1, en réserve vide, compte de départ `brood`. */
function freshBase(brood = 0, level = 1): EnemyBase {
  return { id: 1, tx: 0, ty: 0, level, hp: 100, raiders: 0, brood, guards: 0, spitters: 0, chief: 0, mend: 0, fire: 0 };
}

/** Adam loin de tout : ni son arc ni les gardiens ne touchent aux vagues. */
function away(world: World): void {
  world.player.x += 200 * TILE_SIZE;
}

describe('planification des vagues', () => {
  it('déroule d’avance la production d’une base, exactement comme le jour la fait', () => {
    for (const night of [1, 3, 8, 13]) {
      for (const level of [1, 2, 3]) {
        for (const [brood, dayTicks] of [
          [0, DAY_CYCLE.day],
          [1234, DAY_CYCLE.day / 2],
          [8000, 17],
          [0, 0],
        ] as const) {
          const base = freshBase(brood, level);
          const forecast = projectedRaiders(base, night, dayTicks);

          for (let i = 0; i < dayTicks; i += 1) breed(base, night);
          expect(forecast, `nuit ${night}, niveau ${level}, compte ${brood}, ${dayTicks} ticks`).toBe(base.raiders);
        }
      }
    }
  });

  it('une base abattue ne prévoit rien, une base pleine garde sa réserve', () => {
    expect(projectedRaiders({ ...freshBase(), hp: 0, raiders: 2 }, 3, DAY_CYCLE.day)).toBe(0);
    expect(projectedRaiders({ ...freshBase(), raiders: raidCapacity(1, 3) }, 3, DAY_CYCLE.day)).toBe(raidCapacity(1, 3));
  });

  it('chaque nuit, la vague s’annonce WAVE_WARNING.leadTicks avant de sortir, avec l’effectif qui sortira', () => {
    const world = worldWithTownHall();
    const announced: (WaveForecast & { at: number })[] = [];
    const started: { night: number; count: number; at: number }[] = [];
    const hall = hallOf(world);

    hall.hp = 1_000_000;
    away(world);
    world.events.on('waveAnnounced', (forecast) => announced.push({ ...forecast, at: world.tickCount }));
    world.events.on('waveStarted', ({ night, count }) => started.push({ night, count, at: world.tickCount }));

    // Avant la fenêtre, rien ; dedans, le HUD a de quoi compter.
    const nightfall = world.cycleStartTick + DAY_CYCLE.day + DAY_CYCLE.dusk;

    while (world.tickCount < nightfall - WAVE_WARNING.leadTicks - 1) world.tick();
    expect(world.waveForecast()).toBeNull();
    world.tick();
    expect(world.waveForecast()).toMatchObject({ night: 1, ticks: WAVE_WARNING.leadTicks, urgent: false });

    while (started.length < 5) world.tick();

    expect(started.map(({ night }) => night)).toEqual([1, 2, 3, 4, 5]);
    for (const wave of started) {
      const before = announced.find(({ night }) => night === wave.night);

      expect(before, `nuit ${wave.night} annoncée`).toBeDefined();
      expect(wave.at - before!.at).toBe(WAVE_WARNING.leadTicks);
      expect(before!.count, `nuit ${wave.night}`).toBe(wave.count);
      expect(before!.boss).toBe(isBossNight(wave.night));
    }
  }, 120_000);

  it('passe en urgence dans les dernières secondes, et se tait la nuit venue', () => {
    const world = worldWithTownHall();
    const nightfall = world.cycleStartTick + DAY_CYCLE.day + DAY_CYCLE.dusk;

    away(world);
    while (world.tickCount < nightfall - WAVE_WARNING.urgentTicks) world.tick();
    expect(world.waveForecast()?.urgent).toBe(true);
    while (world.tickCount < nightfall + 1) world.tick();
    expect(world.waveForecast()).toBeNull();
  }, 60_000);

  it('sans base debout, aucune annonce : la nuit est calme', () => {
    const world = worldWithTownHall();
    let announced = 0;

    for (const base of world.enemyBases) base.hp = 0;
    world.events.on('waveAnnounced', () => (announced += 1));
    for (let i = 0; i < CYCLE_TICKS; i += 1) world.tick();
    expect(announced).toBe(0);
  }, 60_000);
});

describe('montée en difficulté', () => {
  it('une base de premier anneau envoie plus de monde avec les nuits', () => {
    const counts = [1, 3, 5, 9, 13, 21].map((night) => projectedRaiders(freshBase(), night, DAY_CYCLE.day));

    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]!);
    expect(counts.at(-1)).toBeGreaterThan(counts[0]!);
  });

  it('les anneaux lointains s’éveillent plus tard', () => {
    expect(projectedRaiders(freshBase(0, 2), 1, DAY_CYCLE.day)).toBe(0);
    expect(projectedRaiders(freshBase(raidTicks(2, 12) - 5, 2), 12, 10)).toBe(1);
  });

  it('les renforts : rien pour une jeune colonie, puis l’ère et la taille de la ville', () => {
    const { perEra, freeBuildings, buildingsPerRaider, maxReinforcements } = WAVE_STRENGTH;

    expect(reinforcements(0, 1)).toBe(0);
    expect(reinforcements(0, freeBuildings)).toBe(0);
    expect(reinforcements(0, freeBuildings + buildingsPerRaider)).toBe(1);
    expect(reinforcements(1, freeBuildings)).toBe(perEra);
    expect(reinforcements(2, freeBuildings + 2 * buildingsPerRaider)).toBe(2 * perEra + 2);
    expect(reinforcements(2, 10_000)).toBe(maxReinforcements);
  });

  it('l’ère : l’acte I, puis sa fin, puis le Signal', () => {
    const actOne = OBJECTIVES.findIndex((objective) => 'banner' in objective);

    expect(eraOf(0, false)).toBe(0);
    expect(eraOf(actOne, false)).toBe(0);
    expect(eraOf(actOne + 1, false)).toBe(1);
    expect(eraOf(OBJECTIVES.length, true)).toBe(2);
  });

  it('l’acte I fini, la vague compte ses renforts et ils sortent de la base de tête', () => {
    const world = worldWithTownHall();
    const night = world.clock()!.cycle;
    const before = world.raidSize(night).count;

    world.objective = OBJECTIVES.findIndex((objective) => 'banner' in objective) + 1;
    expect(world.era()).toBe(1);
    expect(world.waveReinforcements()).toBe(WAVE_STRENGTH.perEra);
    expect(world.raidSize(night).count).toBe(before + WAVE_STRENGTH.perEra);

    let count = 0;

    hallOf(world).hp = 1_000_000;
    away(world);
    world.events.on('waveStarted', (event) => (count = event.count));
    while (count === 0 && world.tickCount < world.cycleStartTick + CYCLE_TICKS) world.tick();
    expect(count).toBeGreaterThanOrEqual(WAVE_STRENGTH.perEra);
  }, 60_000);

  it('la ville qui grandit attire des renforts — les palissades ne comptent pas', () => {
    const world = worldWithTownHall();
    const hall = hallOf(world);
    const size = world.townSize();

    world.researchDone.push('fortification');
    buildNear(world, 'palisade', hall.tx - 3, hall.ty);
    expect(world.townSize()).toBe(size);
    buildNear(world, 'archerTower', hall.tx + 5, hall.ty);
    expect(world.townSize()).toBe(size + 1);
  });

  it('la prime d’une vague repoussée grandit avec les nuits, et une nuit de chef paie plus', () => {
    const first = new Map(waveBounty(1));
    const later = new Map(waveBounty(9));
    const boss = new Map(waveBounty(5));

    expect(first).toEqual(new Map(Object.entries(WAVE_BOUNTY.items)));
    for (const [item, amount] of first) expect(later.get(item)).toBeGreaterThan(amount);
    for (const [item, amount] of Object.entries(WAVE_BOUNTY.boss)) expect(boss.get(item as ItemId)).toBeGreaterThanOrEqual(amount);
    expect(first.has('ironPlate')).toBe(false);
  });
});

describe('défenses', () => {
  it('la palissade arrête un mutant le temps qu’il la casse ; tombée, elle redevient chantier et il passe', () => {
    const world = worldWithTownHall();
    const hall = hallOf(world);

    world.researchDone.push('fortification');

    const wall = buildNear(world, 'palisade', hall.tx - 4, hall.ty + 1, 0);
    const mutant = placeMutant(world, (wall.tx - 3 + 0.5) * TILE_SIZE, (wall.ty + 0.5) * TILE_SIZE);

    away(world);
    for (let i = 0; i < 20 * 6; i += 1) world.tick();
    expect(world.entities.get(wall.id)?.kind).toBe('wall');
    expect((world.entities.get(wall.id) as Building).hp).toBeLessThan(BUILDINGS.palisade.hp);
    expect(mutant.x).toBeLessThan(wall.tx * TILE_SIZE);

    for (let i = 0; i < 20 * 20 && world.mobiles.has(mutant.id) && mutant.x < (wall.tx + 1) * TILE_SIZE; i += 1) world.tick();

    const ruin = [...world.entities.values()].find((entity) => entity.tx === wall.tx && entity.ty === wall.ty);

    expect(ruin?.kind).toBe('site');
    expect(mutant.x).toBeGreaterThan((wall.tx + 1) * TILE_SIZE);
  }, 60_000);

  it('la tour d’archers ne tire qu’avec ses archers à leur poste', () => {
    const world = worldWithTownHall();
    const hall = hallOf(world);

    world.researchDone.push('fortification');

    // Un mutant encore dans sa flaque : la tour s'éveille à sa pose, sans rien avoir à viser.
    const mutant = placeMutant(world, (hall.tx + 6) * TILE_SIZE, (hall.ty - 5) * TILE_SIZE);

    mutant.emerge = 20 * 60;

    const tower = buildNear(world, 'archerTower', hall.tx + 5, hall.ty);
    let shots = 0;

    world.events.on('arrowShot', () => (shots += 1));
    away(world);
    world.push({ type: 'setWorkers', id: tower.id, count: 0 });
    for (let i = 0; i < 20; i += 1) world.tick();
    expect(world.staffing(tower)?.filled).toBe(0);
    mutant.emerge = 0;
    mutant.x = mutant.prevX = (tower.tx + 1) * TILE_SIZE;
    mutant.y = mutant.prevY = (tower.ty - 5) * TILE_SIZE;
    for (let i = 0; i < 20 * 2; i += 1) world.tick();
    expect(shots).toBe(0);
    mutant.emerge = 20 * 60;

    world.push({ type: 'setWorkers', id: tower.id, count: BUILDINGS.archerTower.workers });
    for (let i = 0; i < 20 * 3; i += 1) world.tick();
    expect(world.staffing(tower)?.filled).toBe(BUILDINGS.archerTower.workers);
    mutant.emerge = 0;
    for (let i = 0; i < 20 * 3; i += 1) world.tick();
    expect(shots).toBeGreaterThan(0);
  }, 60_000);

  it('un bâtiment abattu — même une tour — redevient son chantier, à moitié livré : rien ne disparaît', () => {
    const world = worldWithTownHall();
    const hall = hallOf(world);
    const tower = buildNear(world, 'watchtower', hall.tx + 5, hall.ty);
    // Il vient de l'autre côté de la tour, en marchant sur la mairie : la tour le bloque.
    placeMutant(world, (tower.tx + tower.width + 0.6) * TILE_SIZE, (tower.ty + tower.height / 2) * TILE_SIZE);
    tower.hp = 1;
    away(world);
    for (let i = 0; i < 20 * 5 && world.entities.get(tower.id) !== undefined; i += 1) world.tick();

    const ruin = [...world.entities.values()].find((entity) => entity.tx === tower.tx && entity.ty === tower.ty);

    expect(ruin?.kind).toBe('site');
    if (ruin?.kind !== 'site') return;
    expect(ruin.proto).toBe('watchtower');
    expect(ruin.delivered.wood).toBe(Math.floor(BUILDINGS.watchtower.cost.wood * RUIN.delivered));
  }, 60_000);

  it('une vague abattue toute avant l’aube paie sa prime en ville', () => {
    const world = worldWithTownHall();
    const rewards: [ItemId, number][][] = [];

    hallOf(world).hp = 1_000_000;
    away(world);
    world.events.on('waveRewarded', ({ reward }) => rewards.push(reward));

    let started = false;

    world.events.on('waveStarted', () => (started = true));
    while (!started) world.tick();

    const town = world.townStock()!;
    const wood = town.count('wood');

    // Les tours n'existent pas ici : la vague tombe d'un coup, comme sous leurs flèches.
    for (const mobile of [...world.mobiles.values()]) {
      if (mobile.kind === 'mutant') mobile.hp = 0.01;
    }
    world.player.x -= 200 * TILE_SIZE;
    for (const mobile of [...world.mobiles.values()]) {
      if (mobile.kind === 'beast') world.mobiles.delete(mobile.id);
    }
    // Plus qu'un : Adam vient à lui, son arc l'achève.
    const [last, ...others] = [...world.mobiles.values()].filter((mobile): mobile is Mutant => mobile.kind === 'mutant');

    for (const other of others) world.mobiles.delete(other.id);
    last!.emerge = 0;
    world.player.x = last!.x + 2 * TILE_SIZE;
    world.player.y = last!.y;
    for (let i = 0; i < 20 * 10 && rewards.length === 0; i += 1) world.tick();

    expect(rewards).toEqual([waveBounty(1)]);
    expect(town.count('wood')).toBeGreaterThanOrEqual(wood + WAVE_BOUNTY.items.wood);
  }, 60_000);
});
