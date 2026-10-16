/**
 * L'horloge du jour et de la nuit.
 *
 * Aucun état ici : l'heure se lit dans le nombre de ticks écoulés depuis que
 * le toit de la mairie est posé, et les durées dans `data/dayNight.ts`. Le
 * monde n'a qu'un tick de départ à garder ; une sauvegarde rechargée retombe
 * sur la même heure, et deux parties identiques sur les mêmes nuits.
 *
 * Le cycle commence par une journée : day → dusk → night → dawn → day…
 */

import { DAY_CYCLE, DAY_DIAL } from '../data/dayNight.ts';
import { WAVES } from '../data/enemies.ts';

export type DayPhase = keyof typeof DAY_CYCLE;

export const DAY_PHASES: readonly DayPhase[] = ['day', 'dusk', 'night', 'dawn'];

/** Un cycle complet, en ticks. */
export const CYCLE_TICKS = DAY_PHASES.reduce((total, phase) => total + DAY_CYCLE[phase], 0);

/** Début de la nuit dans le cycle, en ticks. */
const NIGHT_OFFSET = DAY_CYCLE.day + DAY_CYCLE.dusk;

/** Début de l'aube dans le cycle, en ticks : c'est là qu'une nuit compte pour survécue. */
const DAWN_OFFSET = NIGHT_OFFSET + DAY_CYCLE.night;

export interface DayClock {
  phase: DayPhase;
  /** Numéro du cycle, 1 pour le premier : la journée 1 précède la nuit 1. */
  cycle: number;
  /** Ticks écoulés dans la phase ; 0 au premier tick de la phase. */
  elapsed: number;
  /** Ticks restant avant la phase suivante. */
  left: number;
  /** Ticks écoulés depuis le début du cycle. */
  offset: number;
  /** Le tick du cycle où l'aube commence, si une aube anticipée l'a avancé (`EarlyDawn`) ; absent : `DAWN_OFFSET`. */
  dawnOffset?: number;
  /** Où l'aiguille du cadran se lit, si l'aube anticipée l'a retenue sur l'aube ; absent : `offset`. */
  dialOffset?: number;
}

/**
 * Une aube anticipée (« Nuit nette ») : la nuit du cycle `cycle` finit au
 * tick `offset` du cycle, au lieu de `DAWN_OFFSET`. L'aube dure alors
 * jusqu'à la fin du cycle — le jour suivant se lève à l'heure : les cycles,
 * donc la météo, qui se cale sur eux, ne bougent pas.
 */
export interface EarlyDawn {
  cycle: number;
  offset: number;
}

/** L'heure qu'il est, `ticks` ticks après le lever du premier jour. */
export function clockAt(ticks: number, early: EarlyDawn | null = null): DayClock {
  const base = plainClockAt(ticks);

  if (!early || early.cycle !== base.cycle || early.offset >= DAWN_OFFSET || early.offset <= NIGHT_OFFSET) return base;
  if (base.offset < early.offset) return base.phase === 'night' ? { ...base, left: early.offset - base.offset, dawnOffset: early.offset } : base;

  // L'aube avancée : elle dure jusqu'au lever du jour, l'aiguille s'arrête au bout de l'arc de l'aube.
  const elapsed = base.offset - early.offset;

  return {
    phase: 'dawn',
    cycle: base.cycle,
    elapsed,
    left: CYCLE_TICKS - base.offset,
    offset: base.offset,
    dawnOffset: early.offset,
    dialOffset: DAWN_OFFSET + Math.min(elapsed, DAY_CYCLE.dawn - 1),
  };
}

function plainClockAt(ticks: number): DayClock {
  const offset = ((ticks % CYCLE_TICKS) + CYCLE_TICKS) % CYCLE_TICKS;
  const cycle = Math.floor(ticks / CYCLE_TICKS) + 1;
  let start = 0;

  for (const phase of DAY_PHASES) {
    const duration = DAY_CYCLE[phase];

    if (offset < start + duration) {
      return { phase, cycle, elapsed: offset - start, left: start + duration - offset, offset };
    }
    start += duration;
  }
  throw new Error('horloge hors du cycle');
}

/**
 * Part de nuit, de 0 (plein jour) à 1 (nuit noire) : elle monte pendant le
 * crépuscule et redescend pendant l'aube. C'est tout ce que le rendu applique.
 */
export function darkness(clock: DayClock): number {
  switch (clock.phase) {
    case 'day':
      return 0;
    case 'dusk':
      return clock.elapsed / DAY_CYCLE.dusk;
    case 'night':
      return 1;
    case 'dawn':
      return Math.max(0, 1 - clock.elapsed / DAY_CYCLE.dawn);
  }
}

/**
 * La vague qui part à ce tick, la première valant 1 ; 0 si aucune. La nuit,
 * `WAVES.firstAt` après sa tombée, puis toutes les `WAVES.interval`,
 * `WAVES.perNight` fois.
 */
export function waveAt(clock: DayClock): number {
  const since = clock.elapsed - WAVES.firstAt;

  if (clock.phase !== 'night' || since < 0 || since % WAVES.interval !== 0) return 0;

  const wave = since / WAVES.interval + 1;

  return wave <= WAVES.perNight ? wave : 0;
}

/** Vrai si une vague part à ce tick. */
export function isWaveTick(clock: DayClock): boolean {
  return waveAt(clock) > 0;
}

/** La prochaine vague, de cette nuit ou de la suivante : son rang dans sa nuit, et les ticks avant elle (0 si elle part à ce tick). */
export function nextWave(clock: DayClock): { wave: number; ticks: number } {
  for (let wave = 1; wave <= WAVES.perNight; wave += 1) {
    const at = NIGHT_OFFSET + WAVES.firstAt + (wave - 1) * WAVES.interval;

    if (at >= clock.offset) return { wave, ticks: at - clock.offset };
  }
  return { wave: 1, ticks: CYCLE_TICKS - clock.offset + NIGHT_OFFSET + WAVES.firstAt };
}

/** Ticks avant la prochaine vague, de cette nuit ou de la suivante ; 0 si elle part à ce tick. */
export function ticksToNextWave(clock: DayClock): number {
  return nextWave(clock).ticks;
}

/**
 * Ticks avant la vague `wave` (la première vaut 1) de la nuit qui tombe ou
 * qui court, ou `null` si elle est déjà sortie ou qu'on n'est ni au
 * crépuscule ni dans la nuit.
 */
export function ticksToWave(clock: DayClock, wave: number): number | null {
  if (clock.phase !== 'dusk' && clock.phase !== 'night') return null;

  const at = NIGHT_OFFSET + WAVES.firstAt + (wave - 1) * WAVES.interval;

  return at >= clock.offset ? at - clock.offset : null;
}

/** Ticks avant la tombée de la prochaine nuit ; 0 pendant la nuit. */
export function ticksToNight(clock: DayClock): number {
  if (clock.phase === 'night') return 0;
  if (clock.offset < NIGHT_OFFSET) return NIGHT_OFFSET - clock.offset;
  return CYCLE_TICKS - clock.offset + NIGHT_OFFSET;
}

/** Ticks avant la prochaine aube ; un cycle entier au premier tick de l'aube, qui vient de passer. */
export function ticksToDawn(clock: DayClock): number {
  const dawn = clock.dawnOffset ?? DAWN_OFFSET;

  if (clock.offset < dawn) return dawn - clock.offset;
  return CYCLE_TICKS - clock.offset + DAWN_OFFSET;
}

/**
 * Le cadran de l'horloge du HUD : il part de l'aube, si bien que le jour
 * change de numéro quand l'aiguille repasse en haut. Les arcs des quatre
 * phases y gardent leurs vraies durées, en part du cycle.
 */
export const DIAL_PHASES: readonly DayPhase[] = ['dawn', 'day', 'dusk', 'night'];

export const DIAL_ARCS: readonly { phase: DayPhase; from: number; to: number }[] = DIAL_PHASES.map((phase, i) => {
  const from = DIAL_PHASES.slice(0, i).reduce((total, before) => total + DAY_CYCLE[before], 0);

  return { phase, from: from / CYCLE_TICKS, to: (from + DAY_CYCLE[phase]) / CYCLE_TICKS };
});

export interface DayDial {
  phase: DayPhase;
  /** Le numéro du jour : 1 au premier lever, un de plus à chaque aube. */
  day: number;
  /** Vrai de la tombée de la nuit à l'aube : les vagues sortent. */
  night: boolean;
  /** Position de l'aiguille, de 0 (début de l'aube) à 1, cf. `DIAL_ARCS`. */
  progress: number;
  /** Ticks avant le prochain changement : l'aube la nuit, la tombée de la nuit sinon. */
  left: number;
  /** Vrai dans les `DAY_DIAL.nightWarning` derniers ticks avant la nuit. */
  warning: boolean;
}

/** Ce que montre l'horloge du HUD à cette heure-ci. */
export function dayDial(clock: DayClock): DayDial {
  const night = clock.phase === 'night';
  const left = night ? clock.left : ticksToNight(clock);

  return {
    phase: clock.phase,
    day: clock.cycle + (clock.phase === 'dawn' ? 1 : 0),
    night,
    progress: (((clock.dialOffset ?? clock.offset) + DAY_CYCLE.dawn) % CYCLE_TICKS) / CYCLE_TICKS,
    left,
    warning: !night && left <= DAY_DIAL.nightWarning,
  };
}
