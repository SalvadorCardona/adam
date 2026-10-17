/**
 * Talents d'Adam (`data/talents.ts`) : le tirage des trois cartes d'un
 * niveau, haché de la seed et du niveau — jamais le PRNG du monde, que le
 * choix ne doit pas décaler —, et ce que les talents pris ajoutent à une
 * statistique.
 *
 * Seuls les talents pris sont de l'état (`Player.talents`, dans l'ordre des
 * niveaux) : l'offre en attente s'en déduit — un niveau passé sans talent
 * choisi —, et « Plus tard » la garde sans rien stocker.
 */

import { hash3 } from '../core/rng.ts';
import type { ResearchStat } from '../data/research.ts';
import { TALENT_IDS, TALENT_OFFER, TALENTS, type TalentId } from '../data/talents.ts';

/** Le sel du tirage : une autre famille de hachages que les faveurs ou les coffres. */
const TALENT_SALT = 0x7a1e;

/** Combien de fois chaque talent a été pris. */
function counts(taken: readonly TalentId[]): Map<TalentId, number> {
  const count = new Map<TalentId, number>();

  for (const id of taken) count.set(id, (count.get(id) ?? 0) + 1);
  return count;
}

/** Les talents qu'on peut encore prendre : ceux qui n'ont pas atteint leur `max`. */
function open(taken: readonly TalentId[]): TalentId[] {
  const count = counts(taken);

  return TALENT_IDS.filter((id) => (count.get(id) ?? 0) < TALENTS[id].max);
}

/**
 * Les talents proposés au passage du niveau `level` : `TALENT_OFFER.choices`
 * talents distincts parmi ceux qui ne sont pas au bout de leur `max`.
 */
export function drawTalents(seed: number, level: number, taken: readonly TalentId[]): TalentId[] {
  const pool = open(taken);
  const choices: TalentId[] = [];

  for (let index = 0; index < TALENT_OFFER.choices && pool.length > 0; index += 1) {
    const at = hash3(seed ^ TALENT_SALT, level, index) % pool.length;

    choices.push(pool.splice(at, 1)[0]!);
  }
  return choices;
}

/** Les talents qui attendent un choix : un par niveau passé (au-delà du premier) sans talent. */
export function pendingTalents(level: number, taken: readonly TalentId[]): number {
  return Math.max(0, level - 1 - taken.length);
}

/** Ce que les talents pris ajoutent à une statistique de la recherche. */
export function talentBonus(taken: readonly TalentId[], stat: ResearchStat): number {
  let bonus = 0;

  for (const id of taken) {
    const { effect } = TALENTS[id];

    if (effect.stat === stat) bonus += effect.amount;
  }
  return bonus;
}

/**
 * Les talents d'une sauvegarde d'avant eux : un par niveau déjà passé, pris
 * dans `TALENT_OFFER.defaults` en boucle, sans dépasser le `max` d'aucun.
 */
export function defaultTalents(level: number): TalentId[] {
  const taken: TalentId[] = [];
  const order: readonly TalentId[] = TALENT_OFFER.defaults;

  for (let turn = 0; taken.length < level - 1; turn += 1) {
    const pool = open(taken);
    const id = order[turn % order.length]!;

    if (pool.length === 0) break;
    taken.push(pool.includes(id) ? id : pool[0]!);
  }
  return taken;
}

/** Garde d'une sauvegarde lue : un id connu, sans dépasser `max`, pas plus que `limit` talents. */
export function cleanTalents(ids: readonly string[], limit: number): TalentId[] {
  const taken: TalentId[] = [];

  for (const id of ids) {
    if (taken.length >= limit) break;
    if (!(id in TALENTS)) continue;
    if (open(taken).includes(id as TalentId)) taken.push(id as TalentId);
  }
  return taken;
}
