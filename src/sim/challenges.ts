/**
 * Défis du jour (`data/challenges.ts`) : le tirage du défi d'un jour, haché
 * de la seed et du jour — jamais le PRNG du monde.
 */

import { hash3 } from '../core/rng.ts';
import { CHALLENGE_IDS, type ChallengeId } from '../data/challenges.ts';

/** Le défi en cours, tel qu'il se sauvegarde. */
export interface DailyChallenge {
  /** Le jour qu'il occupe (`DayDial.day`). */
  day: number;
  id: ChallengeId;
  /** Le compte de sa statistique depuis l'aube (sauf `explore`, compté au brouillard). */
  progress: number;
  /** Cases explorées à son départ, pour `explore`. */
  base: number;
  done: boolean;
}

const CHALLENGE_SALT = 0x5d1a;

/** Le défi du jour `day` ; deux jours de suite ne tirent jamais le même. */
export function drawChallenge(seed: number, day: number): ChallengeId {
  const pick = (d: number): ChallengeId => CHALLENGE_IDS[hash3(seed ^ CHALLENGE_SALT, d, 0) % CHALLENGE_IDS.length]!;
  let previous: ChallengeId | null = null;
  let today = pick(1);

  // Jour après jour depuis le premier : le défi d'hier, tel qu'il a été tiré, n'est jamais celui d'aujourd'hui.
  for (let d = 1; d <= day; d += 1) {
    today = pick(d);
    if (today === previous) today = CHALLENGE_IDS[(CHALLENGE_IDS.indexOf(today) + 1) % CHALLENGE_IDS.length]!;
    previous = today;
  }
  return today;
}
