import { describe, expect, it } from 'vitest';
import { TILE_SIZE, worldToTile } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { WEAPONS } from '../data/weapons.ts';
import { WEATHER, WEATHER_CALENDAR, WEATHER_IDS, type WeatherId } from '../data/weather.ts';
import { NO_WIND, shoot, stepArrow } from './combat.ts';
import { stepMutant } from './enemies.ts';
import { BUILD_REACH_TILES } from './player.ts';
import type { Entity, EntityId, Mutant } from './types.ts';
import { nextWeather, spoilsNight, weatherAt, weatherOfSlot, type WeatherSpell } from './weather.ts';
import { World } from './world.ts';
import { SLOW } from './sweep.ts';

const { slotTicks, announceTicks, calmSlots } = WEATHER_CALENDAR;

/**
 * Le premier créneau de la seed qui tire la météo `id`, et qui ne gâche
 * aucune nuit d'un cycle levé à `cycleStart` : le monde l'effacerait.
 */
function slotWith(seed: number, id: WeatherId, cycleStart = 0): WeatherSpell {
  for (let slot = calmSlots; slot < 400; slot += 1) {
    const spell = weatherOfSlot(seed, slot);

    if (spell?.id === id && !spoilsNight(spell, cycleStart, WEATHER_CALENDAR.waveMarginTicks)) return spell;
  }
  throw new Error(`pas de ${id} dans la seed ${seed}`);
}

/** Place Adam sur une tuile libre collée à l'emprise, et renvoie l'axe qui pousse vers elle. */
function standNextTo(world: World, tx: number, ty: number, width: number, height: number): { x: number; y: number } {
  const candidates: [number, number, number, number][] = [];

  for (let x = tx; x < tx + width; x += 1) {
    candidates.push([x, ty + height, 0, -1], [x, ty - 1, 0, 1]);
  }
  for (let y = ty; y < ty + height; y += 1) {
    candidates.push([tx + width, y, -1, 0], [tx - 1, y, 1, 0]);
  }

  for (const [x, y, axisX, axisY] of candidates) {
    if (world.isSolid(x, y)) continue;

    world.player.x = (x + 0.5) * TILE_SIZE;
    world.player.y = (y + 0.5) * TILE_SIZE;
    return { x: axisX, y: axisY };
  }
  throw new Error('emprise cernée');
}

/** Remplit le sac avec le coût, livre le chantier et appuie sur « Construire ». */
function completeSite(world: World, id: EntityId): Entity {
  const site = world.entities.get(id);

  if (site?.kind !== 'site') throw new Error(`#${id} n'est pas un chantier`);

  for (const [item, amount] of Object.entries(BUILDINGS[site.proto].cost) as [ItemId, number][]) {
    world.player.inventory.add(item, amount);
  }
  world.push({ type: 'setMoveAxis', ...standNextTo(world, site.tx, site.ty, site.width, site.height) });

  for (let i = 0; i < 400; i += 1) {
    world.tick();

    // Le dernier objet livré achève le chantier.
    if (world.entities.get(id)?.kind !== 'site') break;
  }
  world.push({ type: 'setMoveAxis', x: 0, y: 0 });
  world.tick();

  const built = world.entities.get(id);

  if (!built || built.kind === 'site') throw new Error('le chantier ne s’est pas achevé');
  return built;
}

/** Pose et achève une nurserie à portée d'Adam. */
function buildNursery(world: World): Entity {
  const origin = worldToTile(world.player.x, world.player.y);

  for (let dy = -BUILD_REACH_TILES; dy <= BUILD_REACH_TILES; dy += 1) {
    for (let dx = -BUILD_REACH_TILES; dx <= BUILD_REACH_TILES; dx += 1) {
      const tx = origin.tx + dx;
      const ty = origin.ty + dy;

      if (world.canPlace('nursery', tx, ty) !== null) continue;

      const before = new Set(world.entities.keys());

      world.push({ type: 'placeBuilding', building: 'nursery', tx, ty });
      world.tick();

      const id = [...world.entities.keys()].find((key) => !before.has(key));

      if (id === undefined) throw new Error('le chantier n’a pas été ouvert');
      return completeSite(world, id);
    }
  }
  throw new Error('aucune case posable à portée');
}

/** Une tuile d'où Adam peut marcher vers l'est sans rien heurter pendant six tuiles. */
function openGround(world: World, fromX: number, fromY: number): { tx: number; ty: number } {
  for (let ty = fromY; ty < fromY + 200; ty += 1) {
    for (let tx = fromX; tx < fromX + 200; tx += 1) {
      let clear = true;

      for (let dy = -1; dy <= 1 && clear; dy += 1) {
        for (let dx = -1; dx <= 6 && clear; dx += 1) clear = !world.isSolid(tx + dx, ty + dy);
      }
      if (clear) return { tx, ty };
    }
  }
  throw new Error('aucune plaine — la génération de terrain a changé');
}

function mutantAt(x: number, y: number): Mutant {
  return { kind: 'mutant', id: 1, proto: 'mutant', x, y, prevX: x, prevY: y, facing: 'down', moving: false, hp: 3, age: 30, attackCooldown: 0, emerge: 0 };
}

describe('calendrier météo', () => {
  it('donne la même météo au même moment pour la même seed, et une autre pour une autre seed', () => {
    const ticks = Array.from({ length: 400 }, (_, i) => i * 97);
    const read = (seed: number): string => ticks.map((tick) => weatherAt(seed, tick)?.id ?? '-').join(',');

    expect(read(42)).toBe(read(42));
    expect(read(42)).not.toBe(read(43));
  });

  it('laisse le début de partie au calme', () => {
    for (let seed = 1; seed < 50; seed += 1) {
      for (let tick = 0; tick < calmSlots * slotTicks; tick += 50) expect(weatherAt(seed, tick)).toBeNull();
    }
  });

  it('tient chaque météo dans son créneau, avec la place de l’annonce de chaque côté', () => {
    for (let slot = calmSlots; slot < 300; slot += 1) {
      const spell = weatherOfSlot(9, slot);

      if (!spell) continue;
      expect(spell.start - slot * slotTicks).toBeGreaterThanOrEqual(announceTicks);
      expect((slot + 1) * slotTicks - spell.end).toBeGreaterThanOrEqual(announceTicks);
      expect(spell.end - spell.start).toBe(WEATHER[spell.id].durationTicks);
      expect(Math.hypot(spell.windX, spell.windY)).toBeCloseTo(1);
    }
  });

  it('tire toutes les météos, l’arc-en-ciel plus rarement, et laisse du calme', () => {
    const counts = new Map<string, number>();

    for (let slot = calmSlots; slot < 2000; slot += 1) {
      const id = weatherOfSlot(5, slot)?.id ?? 'calm';

      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const id of WEATHER_IDS) expect(counts.get(id), id).toBeGreaterThan(0);
    expect(counts.get('calm')).toBeGreaterThan(0);
    expect(counts.get('rainbow')!).toBeLessThan(counts.get('acidRain')!);
  });

  it('voit venir la prochaine météo', () => {
    const spell = slotWith(3, 'wind');

    expect(nextWeather(3, spell.start - 1)).toEqual(spell);
  });

  it('efface une météo rude qui tomberait sur une nuit, marge et annonce comprises', () => {
    const rain = slotWith(11, 'acidRain');
    const margin = WEATHER_CALENDAR.waveMarginTicks;
    const nightOffset = DAY_CYCLE.day + DAY_CYCLE.dusk;
    // Le lever du premier jour tel que la nuit 1 tombe à `night`.
    const startFor = (night: number): number => night - nightOffset;

    // Mairie en chantier : pas de nuit à gâcher.
    expect(spoilsNight(rain, 0, margin)).toBe(false);
    // La nuit tombe pendant la pluie, juste après, ou dans la marge avant.
    expect(spoilsNight(rain, startFor(rain.start + 10), margin)).toBe(true);
    expect(spoilsNight(rain, startFor(rain.end + margin - 1), margin)).toBe(true);
    expect(spoilsNight(rain, startFor(rain.end + margin), margin)).toBe(false);
    // L'aube finit juste avant l'annonce : la pluie peut tomber.
    expect(spoilsNight(rain, startFor(rain.start - announceTicks - (DAY_CYCLE.night + DAY_CYCLE.dawn)), margin)).toBe(false);
    expect(spoilsNight(rain, startFor(rain.start - announceTicks - (DAY_CYCLE.night + DAY_CYCLE.dawn) + 1), margin)).toBe(true);
    // Le vent n'est pas une « mauvaise chose » : il souffle la nuit comme le jour.
    const wind = slotWith(11, 'wind');

    expect(spoilsNight(wind, startFor(wind.start + 10), margin)).toBe(false);
  });
});

describe('météo dans le monde', () => {
  it('annonce la météo dix secondes à l’avance, puis la commence et l’achève', () => {
    const world = new World(21);
    const spell = slotWith(21, 'fog');
    const log: string[] = [];

    world.events.on('weatherAnnounced', ({ id, seconds }) => log.push(`${world.tickCount}:annonce:${id}:${seconds}`));
    world.events.on('weatherStarted', ({ id }) => log.push(`${world.tickCount}:début:${id}`));
    world.events.on('weatherEnded', ({ id }) => log.push(`${world.tickCount}:fin:${id}`));

    world.tickCount = spell.start - announceTicks - 5;
    while (world.tickCount < spell.end + 5) world.tick();

    expect(log).toEqual([
      `${spell.start - announceTicks}:annonce:fog:10`,
      `${spell.start}:début:fog`,
      `${spell.end}:fin:fog`,
    ]);
    expect(world.weather()).toBeNull();
  });

  it('ralentit Adam sous la pluie acide, sauf à l’abri près de la mairie', () => {
    const seed = 7;
    const stride = (world: World): number => {
      const before = world.player.x;

      world.tick();
      return world.player.x - before;
    };

    const dry = new World(seed);

    completeSite(dry, dry.townHallId);
    const wet = new World(seed);

    completeSite(wet, wet.townHallId);
    const rain = slotWith(seed, 'acidRain', wet.cycleStartTick);

    wet.tickCount = rain.start + 10;

    // Loin de la mairie, au milieu d'une plaine : on n'y teste que la vitesse.
    const open = openGround(dry, 150, 150);

    for (const world of [dry, wet]) {
      world.player.x = world.player.prevX = (open.tx + 0.5) * TILE_SIZE;
      world.player.y = world.player.prevY = (open.ty + 0.5) * TILE_SIZE;
      world.push({ type: 'setMoveAxis', x: 1, y: 0 });
      world.tick();
    }
    expect(stride(wet) / stride(dry)).toBeCloseTo(WEATHER.acidRain.playerSpeed);

    const hall = wet.entities.get(wet.townHallId)!;

    wet.player.x = (hall.tx + hall.width / 2) * TILE_SIZE;
    wet.player.y = (hall.ty + hall.height + 1) * TILE_SIZE;
    expect(wet.sheltered(wet.player.x, wet.player.y)).toBe(true);
    expect(stride(wet)).toBeCloseTo(stride(dry));
  });

  it('ronge les bâtiments abîmés hors de l’abri, un PV toutes les cinq secondes, sans les achever', () => {
    const seed = 7;
    const world = new World(seed);

    completeSite(world, world.townHallId);
    const rain = slotWith(seed, 'acidRain', world.cycleStartTick);
    world.player.x += 12 * TILE_SIZE;
    const nursery = buildNursery(world);
    const hall = world.entities.get(world.townHallId)!;

    if (nursery.kind === 'site' || hall.kind === 'site') throw new Error('bâtiments inachevés');
    expect(world.sheltered((nursery.tx + 1) * TILE_SIZE, (nursery.ty + 1) * TILE_SIZE)).toBe(false);

    nursery.hp = 3;
    hall.hp -= 5;
    const hallHp = hall.hp;
    const every = WEATHER.acidRain.corrosion.everyTicks;

    world.tickCount = rain.start - 1;
    for (let i = 0; i < every; i += 1) world.tick();
    expect(nursery.hp).toBe(2);

    for (let i = 0; i < every * 4; i += 1) world.tick();
    expect(nursery.hp).toBe(1);
    // La mairie abrite ce qui l'entoure, elle-même comprise.
    expect(hall.hp).toBe(hallHp);
  });

  it('épargne les bâtiments intacts', () => {
    const seed = 7;
    const world = new World(seed);
    let corroded = 0;

    completeSite(world, world.townHallId);
    const rain = slotWith(seed, 'acidRain', world.cycleStartTick);
    world.player.x += 12 * TILE_SIZE;
    buildNursery(world);
    world.events.on('buildingCorroded', () => (corroded += 1));

    world.tickCount = rain.start - 1;
    while (world.tickCount < rain.end) world.tick();
    expect(corroded).toBe(0);
  });

  it('double la récolte sous l’arc-en-ciel', () => {
    const seed = 13;
    const rainbow = slotWith(seed, 'rainbow');
    const harvest = (tick: number): number[] => {
      const world = new World(seed);
      const amounts: number[] = [];

      world.events.on('resourceHarvested', ({ amount }) => amounts.push(amount));
      world.tickCount = tick;

      // Adam se colle au premier arbre ou rocher accessible, et pousse.
      const origin = worldToTile(world.player.x, world.player.y);

      for (let dy = -8; dy <= 8 && amounts.length === 0; dy += 1) {
        for (let dx = -8; dx <= 8 && amounts.length === 0; dx += 1) {
          const tx = origin.tx + dx;
          const ty = origin.ty + dy;

          if (!world.resources.at(tx, ty)) continue;

          let axis: { x: number; y: number };

          try {
            axis = standNextTo(world, tx, ty, 1, 1);
          } catch {
            continue;
          }
          world.player.prevX = world.player.x;
          world.player.prevY = world.player.y;
          world.push({ type: 'setMoveAxis', ...axis });
          for (let i = 0; i < 40 && amounts.length === 0; i += 1) world.tick();
        }
      }
      return amounts;
    };

    // Un tick peut récolter plusieurs tuiles voisines : chaque récolte compte.
    const calm = harvest(100);
    const doubled = harvest(rainbow.start + 1);

    expect(calm.length).toBeGreaterThan(0);
    expect(doubled.length).toBeGreaterThan(0);
    for (const amount of calm) expect(amount).toBe(1);
    for (const amount of doubled) expect(amount).toBe(WEATHER.rainbow.harvestYield);
  });

  it('réduit la portée des arcs dans le brouillard', () => {
    const seed = 21;
    const fog = slotWith(seed, 'fog');
    const shots = (tick: number): number => {
      const world = new World(seed);
      let fired = 0;
      const distance = WEAPONS.bow.range * TILE_SIZE - 8;

      world.events.on('arrowShot', () => (fired += 1));
      world.tickCount = tick;
      world.mobiles.set(999, { ...mutantAt(world.player.x + distance, world.player.y), id: 999 });
      world.tick();
      return fired;
    };

    expect(shots(100)).toBe(1);
    expect(shots(fog.start + 1)).toBe(0);
  });

  it.skipIf(!SLOW)('ne fait jamais tomber la pluie acide sur une nuit de vagues, ni juste avant', () => {
    // Une seed où la pluie tombe dans les douze premiers créneaux, entre deux nuits.
    const seed = 42;
    const world = new World(seed);
    const rainy: number[] = [];
    const starts: number[] = [];

    completeSite(world, world.townHallId);
    world.events.on('waveStarted', () => starts.push(world.tickCount));
    // Pas de défaite possible : on regarde seulement le ciel des nuits.
    world.events.on('buildingDamaged', ({ id }) => {
      const hall = world.entities.get(id);

      if (hall && hall.kind !== 'site') hall.hp = BUILDINGS[hall.proto].hp;
    });

    while (world.tickCount < slotTicks * 12) {
      world.tick();

      const clock = world.clock();

      if (world.weather()?.id === 'acidRain') {
        rainy.push(world.tickCount);
        expect(clock?.phase).not.toBe('night');
        expect(clock?.phase).not.toBe('dawn');
      }
    }

    // Les vagues gardent l'heure de la nuit ; la pluie tombe quand même, le jour.
    expect(starts.length).toBeGreaterThan(5);
    expect(rainy.length).toBeGreaterThan(0);
  }, 30_000);
});

describe('vent', () => {
  it('courbe la flèche, que la visée compense : elle touche encore une cible immobile', () => {
    const wind = { x: 0, y: WEATHER.wind.arrowDrift };
    const target = mutantAt(160, 0);
    const calm = shoot(1, 'bow', 0, 0, target);
    const gust = shoot(2, 'bow', 0, 0, target, wind);

    // Calme, la flèche file droit ; dans le vent, elle part contre lui et revient.
    expect(calm.vy).toBe(0);
    expect(gust.vy).toBeLessThan(0);

    let hit = null;
    let lowest = 0;

    while (gust.ttl > 0 && !hit) {
      hit = stepArrow(gust, [target], wind);
      lowest = Math.min(lowest, gust.y);
    }
    expect(hit).toBe(target);
    // Une flèche droite aurait gardé y = 0 : celle-ci monte d'un bon quart de tuile avant de retomber.
    expect(lowest).toBeLessThan(-TILE_SIZE / 4);
    expect(stepArrow(calm, [target], NO_WIND)).toBeNull();
  });

  it('pousse les mutants qui marchent dans son sens, sans freiner les autres', () => {
    const walk = (windX: number): number => {
      const mutant = mutantAt(0, 0);

      stepMutant(mutant, { x: 1000, y: 0 }, () => undefined, 1 / 20, { windX, windY: 0, downwind: WEATHER.wind.mutantDownwind });
      return mutant.x;
    };
    const calm = walk(0);

    expect(walk(1)).toBeCloseTo(calm * (1 + WEATHER.wind.mutantDownwind));
    expect(walk(-1)).toBeCloseTo(calm);
  });
});
