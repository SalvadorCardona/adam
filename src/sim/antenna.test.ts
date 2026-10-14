import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { SURVIVORS } from '../data/dayNight.ts';
import type { ItemId } from '../data/items.ts';
import { ACT_ONE_CHAPTER, CHAPTERS, OBJECTIVES } from '../data/objectives.ts';
import { floorMissing } from './antenna.ts';
import { CYCLE_TICKS, clockAt } from './dayNight.ts';
import { chapterObjectives, currentChapter, goalProgress } from './objectives.ts';
import { decodeSave, encodeSave } from './save.ts';
import type { Antenna, EntityId } from './types.ts';
import { World } from './world.ts';

/** L'objectif « Bâtir l'Antenne », seul de son chapitre, le dernier. */
const ANTENNA_OBJECTIVE = OBJECTIVES.find((objective) => objective.goals.some((goal) => goal.type === 'build' && goal.building === 'antenna'))!;
const ANTENNA_CHAPTER = ANTENNA_OBJECTIVE.chapter;

/** La partie au début du chapitre `chapter` : ceux d'avant finis, leurs objectifs cochés. */
function atChapter(world: World, chapter: number): void {
  world.chapter = chapter;
  for (const objective of OBJECTIVES) if (objective.chapter < chapter) world.objectivesDone.add(objective.id);
  world.chapterBase = { ...world.stats, produced: { ...world.stats.produced } };
}

/** La mairie bâtie d'un coup, sans passer par le sac. */
function withTownHall(seed = 7): World {
  const world = new World(seed);
  const site = world.entities.get(world.townHallId)!;

  if (site.kind !== 'site') throw new Error('la mairie n’est pas un chantier');
  for (const [item, amount] of Object.entries(BUILDINGS.townHall.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
  world.push({ type: 'transferToSite', id: site.id });
  world.tick();
  if (world.entities.get(world.townHallId)?.kind !== 'townHall') throw new Error('la mairie ne s’est pas achevée');
  return world;
}

/** L'acte I fini, le Signal préparé : la partie en est au chapitre de l'Antenne. */
function actTwo(seed = 7): World {
  const world = withTownHall(seed);

  atChapter(world, ANTENNA_CHAPTER);
  return world;
}

/** Le centre de la mairie, en tuiles. */
function hallCenter(world: World): { cx: number; cy: number } {
  const hall = world.entities.get(world.townHallId)!;

  return { cx: hall.tx + hall.width / 2, cy: hall.ty + hall.height / 2 };
}

/** L'origine d'une antenne dont le centre est à (dx, dy) tuiles du centre de la mairie ; Adam se poste au pied. */
function antennaAt(world: World, dx: number, dy: number): { tx: number; ty: number } {
  const { cx, cy } = hallCenter(world);
  const tx = cx + dx - 1.5;
  const ty = cy + dy - 1.5;

  world.player.x = (tx + 1.5) * TILE_SIZE;
  world.player.y = (ty + 4.5) * TILE_SIZE;
  return { tx, ty };
}

/** Une case légale à 8 ou 9 cases de la mairie, dans son rayon : la ville la livre. */
function antennaSpot(world: World): { tx: number; ty: number } {
  for (let dy = -9; dy <= 9; dy += 1) {
    for (let dx = -9; dx <= 9; dx += 1) {
      const distance = Math.hypot(dx, dy);

      if (distance < 8 || distance > 9) continue;

      const at = antennaAt(world, dx, dy);

      if (world.canPlace('antenna', at.tx, at.ty) === null) return at;
    }
  }
  throw new Error('aucune case pour l’antenne');
}

/** Le premier étage posé et livré depuis la ville. */
function firstFloor(world: World): Antenna {
  const { tx, ty } = antennaSpot(world);

  world.push({ type: 'placeBuilding', building: 'antenna', tx, ty });
  world.tick();

  const site = [...world.entities.values()].find((entity) => entity.proto === 'antenna');

  if (!site) throw new Error('l’antenne n’a pas été posée');
  fill(world, BUILDINGS.antenna.cost);
  world.push({ type: 'transferToSite', id: site.id });
  world.tick();
  return antennaOf(world, site.id);
}

function antennaOf(world: World, id: EntityId): Antenna {
  const antenna = world.entities.get(id);

  if (antenna?.kind !== 'antenna') throw new Error(`#${id} n’est pas une antenne finie`);
  return antenna;
}

function fill(world: World, cost: Partial<Record<ItemId, number>>): void {
  for (const [item, amount] of Object.entries(cost) as [ItemId, number][]) world.townStock()!.add(item, amount);
}

/** L'étage suivant, déposé en ville puis transféré. */
function nextFloor(world: World, antenna: Antenna): void {
  const floor = BUILDINGS.antenna.upgrades[antenna.level - 1]!;

  fill(world, floor.cost);
  world.push({ type: 'supplyBuilding', id: antenna.id });
  world.tick();
}

/**
 * Les ticks jusqu'au début de la phase `phase` du cycle `cycle`. `calm` : les
 * mutants s'évaporent à peine sortis — la colonie, sans tour, tient la nuit.
 */
function runTo(world: World, cycle: number, phase: 'night' | 'dawn' | 'day', calm = false): void {
  for (let i = 0; i < CYCLE_TICKS * 2; i += 1) {
    const clock = clockAt(world.tickCount + 1 - world.cycleStartTick);

    world.tick();
    if (calm) for (const mobile of [...world.mobiles.values()]) if (mobile.kind === 'mutant') world.mobiles.delete(mobile.id);
    if (clock.cycle === cycle && clock.phase === phase) return;
  }
  throw new Error(`pas de ${phase} ${cycle}`);
}

describe('l’Antenne', () => {
  it('ne se pose qu’après « Tenir », la fin de l’acte I', () => {
    const world = withTownHall();

    atChapter(world, ACT_ONE_CHAPTER);
    expect(currentChapter(world)?.title).toBe(CHAPTERS[ACT_ONE_CHAPTER]!.title);
    expect(world.isUnlocked('antenna')).toBe(false);
    expect(world.canPlace('antenna', antennaAt(world, 9, 0).tx, antennaAt(world, 9, 0).ty)).toBe('locked');

    // Les cinq nuits tenues, les tours et la caserne cochées : l'acte I finit, l'Antenne se pose — sans victoire.
    let victory = false;

    world.events.on('victory', () => (victory = true));
    for (const { id } of chapterObjectives(world)) if (id !== 'nights5') world.objectivesDone.add(id);
    world.stats.nightsSurvived += 5;
    world.tick();
    expect(world.chapter).toBe(ACT_ONE_CHAPTER + 1);
    expect(world.isUnlocked('antenna')).toBe(true);
    expect(victory).toBe(false);
    expect(world.victory).toBe(false);
  });

  it('ne se pose pas à moins de 8 cases de la mairie', () => {
    const world = actTwo();
    const near = antennaAt(world, 7, 0);

    for (let ty = near.ty; ty < near.ty + 3; ty += 1) for (let tx = near.tx; tx < near.tx + 3; tx += 1) world.resources.clear(tx, ty);

    expect(world.canPlace('antenna', near.tx, near.ty)).toBe('nearHall');
    world.push({ type: 'placeBuilding', building: 'antenna', ...near });
    world.tick();
    expect([...world.entities.values()].some((entity) => entity.proto === 'antenna')).toBe(false);

    const far = antennaSpot(world);
    const { cx, cy } = hallCenter(world);

    expect(Math.hypot(far.tx + 1.5 - cx, far.ty + 1.5 - cy)).toBeGreaterThanOrEqual(BUILDINGS.antenna.hallDistance);
    expect(world.canPlace('antenna', far.tx, far.ty)).toBeNull();
  });

  it('monte d’un étage quand tout est livré, et pas sans cœur radioactif', () => {
    const world = actTwo();
    const antenna = firstFloor(world);
    const progress = (): { have: number; need: number } => goalProgress(world, ANTENNA_OBJECTIVE.goals[0]!);

    expect(antenna.level).toBe(1);
    expect(progress()).toEqual({ have: 1, need: 3 });

    // Tout l'étage 2, sauf le cœur : l'antenne attend, le coffre garde le reste.
    const { radCore, ...rest } = BUILDINGS.antenna.upgrades[0].cost;

    fill(world, rest);
    world.push({ type: 'supplyBuilding', id: antenna.id });
    world.tick();
    expect(antenna.level).toBe(1);
    expect(floorMissing(antenna)).toBe(radCore);
    expect(antenna.store.count('ironPlate')).toBe(rest.ironPlate);

    // Le cœur, heurté depuis le sac : l'étage monte.
    world.player.inventory.add('radCore', radCore);
    world.push({ type: 'supplyBuilding', id: antenna.id });
    world.tick();
    expect(antenna.level).toBe(2);
    expect(antenna.store.total()).toBe(0);
    expect(antenna.hp).toBe(BUILDINGS.antenna.upgrades[0].hp);
    expect(progress()).toEqual({ have: 2, need: 3 });
  });

  it('attire toutes les vagues de la nuit qui suit un étage fini', () => {
    const world = actTwo();

    // Le jour 1 : l'étage est fini avant la nuit 1, c'est elle qui marche sur l'antenne.
    const antenna = firstFloor(world);
    const targets: string[] = [];
    let waves = 0;

    expect(world.lureNight).toBe(1);
    world.events.on('waveStarted', ({ night, targetProto }) => {
      if (night !== 1) return;
      waves += 1;
      targets.push(targetProto);
      // Chaque base envoie les siens sur elle, pas seulement la plus proche.
      for (const mobile of world.mobiles.values()) if (mobile.kind === 'mutant') targets.push(String(mobile.target === antenna.id ? 'antenna' : mobile.target));
    });
    runTo(world, 1, 'dawn');
    expect(waves).toBe(1);
    expect(targets.length).toBeGreaterThan(2);
    expect(targets.every((proto) => proto === 'antenna')).toBe(true);

    // Une nuit sans étage fini : les vagues reprennent leurs cibles habituelles.
    expect(world.lureNight).toBe(1);
    expect(world.entities.has(antenna.id)).toBe(true);
  });

  it('vise l’antenne la nuit suivante quand l’étage s’achève en pleine nuit', () => {
    const world = actTwo();
    const antenna = firstFloor(world);

    runTo(world, 1, 'night');
    nextFloor(world, antennaOf(world, antenna.id));
    expect(antennaOf(world, antenna.id).level).toBe(2);
    expect(world.lureNight).toBe(2);
  });

  it('lance le Signal au troisième étage, puis des survivants arrivent à chaque aube', () => {
    const world = actTwo();
    const antenna = firstFloor(world);
    let signals = 0;
    let victories = 0;

    world.events.on('signalSent', () => (signals += 1));
    world.events.on('victory', () => (victories += 1));
    nextFloor(world, antenna);
    nextFloor(world, antenna);
    expect(antenna.level).toBe(3);
    expect(signals).toBe(1);
    expect(victories).toBe(1);
    expect(world.victory).toBe(true);
    expect(world.nightsAfterSignal()).toBe(0);

    const arrivals: number[] = [];
    const workers = world.population().workers;

    world.events.on('survivorsArrived', ({ count }) => arrivals.push(count));
    runTo(world, 1, 'dawn', true);
    runTo(world, 2, 'dawn', true);
    expect(world.defeated).toBe(false);
    expect(arrivals).toHaveLength(2);
    for (const count of arrivals) {
      expect(count).toBeGreaterThanOrEqual(SURVIVORS.min);
      expect(count).toBeLessThanOrEqual(SURVIVORS.max);
    }

    const survivors = [...world.mobiles.values()].filter((mobile) => mobile.kind === 'worker' && mobile.survivor);
    const total = arrivals[0]! + arrivals[1]!;

    expect(survivors).toHaveLength(total);
    expect(survivors.every((worker) => worker.kind === 'worker' && worker.homeId === world.townHallId)).toBe(true);
    expect(world.population().workers).toBe(workers + total);
    expect(world.nightsAfterSignal()).toBe(2);
  });

  it('ne fait pas venir de survivants avant le Signal', () => {
    const world = actTwo();
    let arrivals = 0;

    firstFloor(world);
    world.events.on('survivorsArrived', () => (arrivals += 1));
    runTo(world, 1, 'dawn');
    expect(arrivals).toBe(0);
  });

  it('se sauvegarde et se recharge à chaque étage', () => {
    const world = actTwo();
    const antenna = firstFloor(world);
    const reload = (from: World): World => {
      const decoded = decodeSave(encodeSave(from, 0));

      if (!decoded.ok) throw new Error(`sauvegarde refusée : ${decoded.reason}`);
      return decoded.world;
    };

    for (let floor = 1; floor <= 3; floor += 1) {
      const live = antennaOf(world, antenna.id);

      // Une partie de l'étage suivant au coffre, pour vérifier qu'il suit.
      if (floor < 3) live.store.add('ironPlate', 5);

      const loaded = reload(world);
      const copy = antennaOf(loaded, antenna.id);

      expect(copy.level).toBe(floor);
      expect(copy.hp).toBe(live.hp);
      expect(copy.store.toJSON()).toEqual(live.store.toJSON());
      expect(loaded.lureNight).toBe(world.lureNight);
      expect(loaded.chapter).toBe(world.chapter);
      expect(loaded.victory).toBe(floor === 3);
      expect(loaded.signalNights).toBe(world.signalNights);

      if (floor < 3) nextFloor(world, live);
    }
  });

  it('perd son étage du haut quand les mutants l’abattent, et pas tout', () => {
    const world = actTwo();
    const antenna = firstFloor(world);
    let fell = 0;

    nextFloor(world, antenna);
    world.events.on('antennaFell', ({ floor }) => (fell = floor));
    antenna.hp = 1;
    // Le coup de mutant qui l'achève, porté directement par `damageBuilding`.
    (world as unknown as { damageBuilding(id: EntityId, amount: number): void }).damageBuilding(antenna.id, 5);
    expect(fell).toBe(1);
    expect(antennaOf(world, antenna.id).level).toBe(1);
  });
});
