import { describe, expect, it } from 'vitest';
import { DAY_CYCLE, DAY_DIAL } from '../data/dayNight.ts';
import { WAVES } from '../data/enemies.ts';
import { CYCLE_TICKS, DIAL_ARCS, clockAt, darkness, dayDial, isWaveTick, ticksToDawn, ticksToNextWave, ticksToNight } from './dayNight.ts';
import { World } from './world.ts';

const NIGHTFALL = DAY_CYCLE.day + DAY_CYCLE.dusk;

describe('horloge du jour et de la nuit', () => {
  it('enchaîne jour, crépuscule, nuit et aube, puis recommence', () => {
    expect(clockAt(0)).toMatchObject({ phase: 'day', cycle: 1, elapsed: 0, left: DAY_CYCLE.day });
    expect(clockAt(DAY_CYCLE.day - 1).phase).toBe('day');
    expect(clockAt(DAY_CYCLE.day)).toMatchObject({ phase: 'dusk', elapsed: 0 });
    expect(clockAt(NIGHTFALL)).toMatchObject({ phase: 'night', elapsed: 0, cycle: 1 });
    expect(clockAt(NIGHTFALL + DAY_CYCLE.night)).toMatchObject({ phase: 'dawn', elapsed: 0 });
    expect(clockAt(CYCLE_TICKS)).toMatchObject({ phase: 'day', elapsed: 0, cycle: 2 });
  });

  it('assombrit au crépuscule et éclaircit à l’aube, sans saut', () => {
    expect(darkness(clockAt(0))).toBe(0);
    expect(darkness(clockAt(DAY_CYCLE.day))).toBe(0);
    expect(darkness(clockAt(DAY_CYCLE.day + DAY_CYCLE.dusk / 2))).toBeCloseTo(0.5);
    expect(darkness(clockAt(NIGHTFALL))).toBe(1);
    expect(darkness(clockAt(NIGHTFALL + DAY_CYCLE.night))).toBe(1);
    expect(darkness(clockAt(CYCLE_TICKS - 1))).toBeCloseTo(1 / DAY_CYCLE.dawn);
  });

  it('ne lance les vagues que la nuit, et compte juste jusqu’à la prochaine', () => {
    const waveTicks: number[] = [];

    for (let tick = 0; tick < CYCLE_TICKS * 2; tick += 1) {
      if (isWaveTick(clockAt(tick))) waveTicks.push(tick);
    }

    const perCycle = Array.from({ length: WAVES.perNight }, (_, k) => NIGHTFALL + WAVES.firstAt + k * WAVES.interval);

    expect(waveTicks).toEqual([...perCycle, ...perCycle.map((tick) => tick + CYCLE_TICKS)]);

    for (const tick of [0, 100, NIGHTFALL - 1, NIGHTFALL + 1, CYCLE_TICKS - 1]) {
      const left = ticksToNextWave(clockAt(tick));

      expect(isWaveTick(clockAt(tick + left))).toBe(true);
      for (let t = tick; t < tick + left; t += 1) expect(isWaveTick(clockAt(t))).toBe(false);
    }

    expect(ticksToNight(clockAt(0))).toBe(NIGHTFALL);
    expect(ticksToNight(clockAt(NIGHTFALL + 1))).toBe(0);
    expect(ticksToNight(clockAt(CYCLE_TICKS - 1))).toBe(NIGHTFALL + 1);
  });
});

describe('aube avancée', () => {
  const early = { cycle: 1, offset: NIGHTFALL + 400 };

  it('raccourcit la nuit puis garde l’aube jusqu’au lever du jour, à l’heure', () => {
    expect(clockAt(NIGHTFALL + 100, early)).toMatchObject({ phase: 'night', left: 300, dawnOffset: early.offset });
    expect(clockAt(early.offset - 1, early)).toMatchObject({ phase: 'night', left: 1 });
    expect(clockAt(early.offset, early)).toMatchObject({ phase: 'dawn', elapsed: 0, cycle: 1 });
    expect(clockAt(NIGHTFALL + DAY_CYCLE.night + 5, early)).toMatchObject({ phase: 'dawn', elapsed: DAY_CYCLE.night + 5 - 400 });
    expect(clockAt(CYCLE_TICKS - 1, early).phase).toBe('dawn');
    expect(clockAt(CYCLE_TICKS, early)).toMatchObject({ phase: 'day', cycle: 2, elapsed: 0 });
    // Une aube avancée d'un autre cycle ne change rien.
    expect(clockAt(CYCLE_TICKS + NIGHTFALL + 100, early)).toEqual(clockAt(CYCLE_TICKS + NIGHTFALL + 100));
  });

  it('fait lire le cadran sur l’aube et le compte à rebours juste', () => {
    const late = clockAt(NIGHTFALL + DAY_CYCLE.night + 50, early);

    expect(darkness(late)).toBe(0);
    expect(dayDial(late).day).toBe(2);
    expect(dayDial(late).progress).toBeLessThan(DIAL_ARCS[0]!.to);
    expect(ticksToNight(late)).toBe(CYCLE_TICKS - late.offset + NIGHTFALL);
    expect(ticksToDawn(clockAt(NIGHTFALL + 100, early))).toBe(300);
  });
});

describe('cadran de l’horloge du HUD', () => {
  const DAWN = NIGHTFALL + DAY_CYCLE.night;

  it('partage le cadran selon les vraies durées des phases, en partant de l’aube', () => {
    expect(DIAL_ARCS.map(({ phase }) => phase)).toEqual(['dawn', 'day', 'dusk', 'night']);
    expect(DIAL_ARCS[0]!.from).toBe(0);
    expect(DIAL_ARCS.at(-1)!.to).toBeCloseTo(1);
    for (const arc of DIAL_ARCS) expect(arc.to - arc.from).toBeCloseTo(DAY_CYCLE[arc.phase] / CYCLE_TICKS);
    for (let i = 1; i < DIAL_ARCS.length; i += 1) expect(DIAL_ARCS[i]!.from).toBe(DIAL_ARCS[i - 1]!.to);
  });

  it('place l’aiguille dans l’arc de la phase en cours, et la fait avancer', () => {
    let last = -1;

    for (let tick = 0; tick < CYCLE_TICKS; tick += 50) {
      const clock = clockAt(tick);
      const dial = dayDial(clock);
      const arc = DIAL_ARCS.find(({ phase }) => phase === clock.phase)!;

      expect(dial.phase).toBe(clock.phase);
      expect(dial.progress).toBeGreaterThanOrEqual(arc.from);
      expect(dial.progress).toBeLessThan(arc.to);
      // L'aiguille ne recule qu'en repassant en haut, à l'aube.
      if (clock.phase !== 'dawn' || last < DIAL_ARCS[0]!.to) expect(dial.progress).toBeGreaterThan(last);
      last = dial.progress;
    }
    expect(dayDial(clockAt(DAWN)).progress).toBe(0);
  });

  it('numérote le jour, un de plus à chaque aube', () => {
    expect(dayDial(clockAt(0)).day).toBe(1);
    expect(dayDial(clockAt(NIGHTFALL)).day).toBe(1);
    expect(dayDial(clockAt(DAWN - 1)).day).toBe(1);
    expect(dayDial(clockAt(DAWN)).day).toBe(2);
    expect(dayDial(clockAt(CYCLE_TICKS)).day).toBe(2);
    expect(dayDial(clockAt(CYCLE_TICKS + DAWN)).day).toBe(3);
  });

  it('compte jusqu’à la nuit le jour, jusqu’à l’aube la nuit, et prévient avant la tombée', () => {
    expect(dayDial(clockAt(0))).toMatchObject({ night: false, left: NIGHTFALL, warning: false });
    expect(dayDial(clockAt(NIGHTFALL - DAY_DIAL.nightWarning - 1)).warning).toBe(false);
    expect(dayDial(clockAt(NIGHTFALL - DAY_DIAL.nightWarning))).toMatchObject({ warning: true, left: DAY_DIAL.nightWarning });
    expect(dayDial(clockAt(DAY_CYCLE.day))).toMatchObject({ phase: 'dusk', night: false, warning: true });
    expect(dayDial(clockAt(NIGHTFALL + 20))).toMatchObject({ night: true, left: DAY_CYCLE.night - 20, warning: false });
    expect(dayDial(clockAt(DAWN))).toMatchObject({ night: false, left: DAY_CYCLE.dawn + NIGHTFALL });
  });
});

describe('nuit calme (« Passer la nuit »)', () => {
  it('ni le jour, ni tant qu’un mutant rôde ; oui une fois la vague abattue', () => {
    const world = new World(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();
    expect(world.calmNight()).toBe(false);

    while (world.clock()?.phase !== 'night') world.tick();
    world.tick();

    const mutants = [...world.mobiles.values()].filter((mobile) => mobile.kind === 'mutant');

    expect(world.calmNight()).toBe(mutants.length === 0);
    for (const mutant of mutants) world.mobiles.delete(mutant.id);
    expect(world.calmNight()).toBe(true);

    while (world.clock()?.phase === 'night') world.tick();
    expect(world.calmNight()).toBe(false);
  });
});
