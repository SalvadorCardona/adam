/**
 * Faveurs de l'aube (`data/boons.ts`) : le tirage des trois cartes, haché
 * de la seed et de la nuit — jamais le PRNG du monde, que le choix ne doit
 * pas décaler.
 */

import { hash3 } from '../core/rng.ts';
import { BOON_IDS, BOON_OFFER, BOONS, type BoonId } from '../data/boons.ts';
import type { ResearchStat } from '../data/research.ts';

/** Le sel du tirage : une autre famille de hachages que les gisements ou les coffres. */
const BOON_SALT = 0x6b00;

/** Les faveurs proposées à l'aube de la nuit `night` : `BOON_OFFER.choices` faveurs distinctes. */
export function drawBoons(seed: number, night: number): BoonId[] {
  const pool = [...BOON_IDS];
  const choices: BoonId[] = [];

  for (let index = 0; index < BOON_OFFER.choices && pool.length > 0; index += 1) {
    const at = hash3(seed ^ BOON_SALT, night, index) % pool.length;

    choices.push(pool.splice(at, 1)[0]!);
  }
  return choices;
}

/** Le coup de pouce d'une faveur active sur `stat`, ou 0. */
export function boonBonus(boon: BoonId | null, stat: ResearchStat): number {
  if (boon === null) return 0;

  const { effect } = BOONS[boon];

  return effect.kind === 'stat' && effect.stat === stat ? effect.amount : 0;
}
