/**
 * L'humeur sonore de la nuit, en logique pure : quatre moments (crépuscule,
 * vague, vague repoussée, aube), le morceau qu'ils demandent (`musicState` :
 * jour, nuit, combat) et les niveaux de la couche de tension.
 *
 * Aucun `AudioContext` ici : le moteur pousse les moments, lit les niveaux
 * et pose ses rampes. Le temps est celui qu'on lui donne, en secondes — la
 * pulsation ne redescend qu'un moment après le dernier mutant, et un test
 * peut le vérifier sans attendre.
 */

import { NIGHT_STAKES } from '../data/dayNight.ts';

/** Le tempo de la pulsation de nuit. */
export const NIGHT_BPM = 78;

/**
 * Le thème du jour, à mi-volume pour laisser la place aux bruitages, puis
 * « de l'autre côté du mur » — passe-bas fermé, volume baissé — tant que le
 * morceau de nuit se télécharge.
 */
export const MUSIC_DAY = { cutoff: 18000, volume: 0.5 } as const;
export const MUSIC_NIGHT = { cutoff: 900, volume: 0.3 } as const;

/** Le bourdon (la 55 Hz, mi 82,4 Hz : une quinte en la) et la grosse caisse. */
export const DRONE = { notes: [55, 82.4], gain: 0.06 } as const;
export const PULSE_GAIN = 0.05;

/** Durées des rampes de la couche de tension, en secondes : elle entre en 4 s, s'éteint en 2 s. */
export const DUSK_RAMP_S = 4;
export const TENSION_FADE_S = 2;

/** Après le dernier mutant, la pulsation garde la double croche encore ce temps-là. */
export const CALM_DELAY_S = 2;

export type NightMoment = 'dusk' | 'wave' | 'cleared' | 'dawn';

export interface NightMood {
  readonly night: boolean;
  /** Des mutants sont dehors. */
  readonly wave: boolean;
  /** Quand la dernière vague a été repoussée, `null` si aucune ne l'a été cette nuit. */
  readonly clearedAt: number | null;
}

export interface NightLevels {
  cutoff: number;
  music: number;
  drone: number;
  pulse: number;
  /** Coups de grosse caisse par temps : 1 à la noire, 4 à la double croche. */
  stepsPerBeat: 1 | 4;
}

/** Les trois morceaux : le thème du jour, la nuit calme, le combat (la même nuit, batterie en plus). */
export type MusicState = 'day' | 'night' | 'combat';

/**
 * Le fondu enchaîné vers chaque morceau, en secondes : le combat monte vite,
 * les retours au calme et au jour prennent leur temps.
 */
export const MUSIC_FADE_S: Readonly<Record<MusicState, number>> = { day: 4, night: 4, combat: 2 };

export const DAY_MOOD: NightMood = { night: false, wave: false, clearedAt: null };

export function nightMood(mood: NightMood, moment: NightMoment, now: number): NightMood {
  switch (moment) {
    case 'dusk':
      return { night: true, wave: false, clearedAt: null };
    case 'wave':
      return { night: true, wave: true, clearedAt: null };
    case 'cleared':
      return mood.wave ? { ...mood, wave: false, clearedAt: now } : mood;
    case 'dawn':
      return DAY_MOOD;
  }
}

/** `danger` (0 à 1) : la mairie sous la moitié de ses PV, le battement sourd de la grosse caisse monte d'autant. */
export function nightLevels(mood: NightMood, now: number, danger = 0): NightLevels {
  if (!mood.night) {
    return { cutoff: MUSIC_DAY.cutoff, music: MUSIC_DAY.volume, drone: 0, pulse: 0, stepsPerBeat: 1 };
  }

  const fast = mood.wave || (mood.clearedAt !== null && now - mood.clearedAt < CALM_DELAY_S);

  return {
    cutoff: MUSIC_NIGHT.cutoff,
    music: MUSIC_NIGHT.volume,
    drone: DRONE.gain,
    pulse: PULSE_GAIN * (1 + danger * NIGHT_STAKES.heartGain),
    stepsPerBeat: fast ? 4 : 1,
  };
}

/** Le morceau d'une humeur : le combat tant que des mutants sont dehors, la nuit calme sinon, le jour à l'aube. */
export function musicState(mood: NightMood): MusicState {
  if (!mood.night) return 'day';
  return mood.wave ? 'combat' : 'night';
}
