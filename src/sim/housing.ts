/**
 * Les lits et le bonheur : qui dort où, et ce que la nuit fait au moral.
 *
 * Pur : ni monde ni PRNG. `World` rassemble les dormeurs et les maisons, et
 * applique ce que ce module décide. Tout se lit dans `data/housing.ts`.
 *
 * L'attribution est **stable** : un dormeur garde son lit tant que la
 * maison tient et qu'elle a la place. Les autres prennent, du plus proche
 * au plus loin de leur travail, les lits qui restent — à distance égale, le
 * plus petit id d'abord : le même monde donne toujours la même attribution.
 * Jamais deux dormeurs dans un lit : une maison n'en reçoit pas plus que
 * ses `beds`.
 */

import { HAPPINESS, MOOD, type MoodCause } from '../data/housing.ts';
import { TRAITS, type TraitId } from '../data/traits.ts';
import { needState, type Needs } from './needs.ts';
import type { EntityId, MobileId } from './types.ts';

/** Ce que tout ouvrier adulte retient de ses nuits (`Housed`, `sim/types.ts`). */
export interface Housing {
  /** De 0 (malheureux) à `HAPPINESS.max`. */
  happiness: number;
  /** La maison où il a son lit, `null` s'il dort dehors. */
  bed: EntityId | null;
  /** Vrai s'il dort dehors, allongé, ce tick : le rendu le couche. Recalculé à chaque tick. */
  sleepingOut: boolean;
}

/** Un dormeur à loger : son lit actuel, et la porte de son travail. */
export interface Sleeper {
  id: MobileId;
  bed: EntityId | null;
  x: number;
  y: number;
}

/** Une maison : ses lits, et sa porte. */
export interface Lodging {
  id: EntityId;
  beds: number;
  x: number;
  y: number;
}

/**
 * Le lit de chaque dormeur (`null` : dehors). Ceux qui ont un lit dans une
 * maison encore debout le gardent, dans l'ordre des ids, tant qu'elle a la
 * place ; les autres prennent le lit libre le plus proche de leur travail.
 */
export function assignBeds(sleepers: readonly Sleeper[], lodgings: readonly Lodging[]): Map<MobileId, EntityId | null> {
  const free = new Map<EntityId, number>(lodgings.map((lodging) => [lodging.id, lodging.beds]));
  const beds = new Map<MobileId, EntityId | null>();
  const homeless: Sleeper[] = [];

  for (const sleeper of [...sleepers].sort((a, b) => a.id - b.id)) {
    const left = sleeper.bed === null ? 0 : (free.get(sleeper.bed) ?? 0);

    if (left > 0) {
      free.set(sleeper.bed!, left - 1);
      beds.set(sleeper.id, sleeper.bed);
    } else {
      beds.set(sleeper.id, null);
      homeless.push(sleeper);
    }
  }

  if (homeless.length === 0) return beds;

  // Chaque couple dormeur sans lit — maison qui a la place, du plus court au plus long trajet.
  const pairs: { sleeper: MobileId; lodging: EntityId; distance: number }[] = [];

  for (const sleeper of homeless) {
    for (const lodging of lodgings) {
      if ((free.get(lodging.id) ?? 0) > 0) {
        pairs.push({ sleeper: sleeper.id, lodging: lodging.id, distance: (lodging.x - sleeper.x) ** 2 + (lodging.y - sleeper.y) ** 2 });
      }
    }
  }
  pairs.sort((a, b) => a.distance - b.distance || a.sleeper - b.sleeper || a.lodging - b.lodging);

  for (const { sleeper, lodging } of pairs) {
    const left = free.get(lodging)!;

    if (left === 0 || beds.get(sleeper) !== null) continue;
    free.set(lodging, left - 1);
    beds.set(sleeper, lodging);
  }
  return beds;
}

/**
 * Où en est son moral :
 * - `content` : à partir de `contentFrom` ;
 * - `neutral` : entre les deux ;
 * - `unhappy` : sous `unhappyBelow` — la bulle, et le pas qui traîne.
 */
export type Mood = 'content' | 'neutral' | 'unhappy';

export function moodOf(happiness: number): Mood {
  if (happiness < HAPPINESS.unhappyBelow) return 'unhappy';
  if (happiness >= HAPPINESS.contentFrom) return 'content';
  return 'neutral';
}

/**
 * Son allure, en part de la normale : `unhappyPace` malheureux, `contentPace`
 * content, 1 entre les deux. Le retour est immédiat au-delà des seuils.
 */
export function moodPace(happiness: number): number {
  const mood = moodOf(happiness);

  return mood === 'unhappy' ? HAPPINESS.unhappyPace : mood === 'content' ? HAPPINESS.contentPace : 1;
}

/** L'allure que son trait lui donne (`data/traits.ts`) : 1 s'il n'en a pas. */
export function traitPace(trait: TraitId | undefined): number {
  return trait === undefined ? 1 : TRAITS[trait].pace;
}

/**
 * Ce qui a pesé sur sa nuit : un lit ou dehors, la faim, la soif, la peur
 * d'un ennemi approché (`scared`).
 * Un autre besoin qui pèserait sur le moral s'ajoutera ici — et dans `MOOD`.
 */
export function moodCauses(person: Pick<Housing, 'bed'> & { needs?: Needs }, scared = false): MoodCause[] {
  const causes: MoodCause[] = [person.bed === null ? 'outside' : 'bed'];

  if (person.needs) {
    const hungry = needState('hunger', person.needs.hunger) === 'deprived';
    const thirsty = needState('thirst', person.needs.thirst) === 'deprived';

    if (hungry) causes.push('hungry');
    if (thirsty) causes.push('thirsty');
  }
  if (scared) causes.push('scared');
  return causes;
}

/**
 * Le bonheur au matin : chaque cause ajoute sa part, la peur pesant selon le
 * trait ; entre 0 et `HAPPINESS.max`.
 */
export function nightlyMood(happiness: number, causes: readonly MoodCause[], trait?: TraitId): number {
  const proto = trait === undefined ? null : TRAITS[trait];
  const delta = causes.reduce<number>((sum, cause) => sum + MOOD[cause] * (cause === 'scared' && proto ? proto.fear : 1), 0);

  return Math.min(HAPPINESS.max, Math.max(0, happiness + delta));
}

/** Ce qu'un habitant tout juste arrivé porte de ses nuits : neutre, sans lit attribué — il en recevra un s'il y en a. */
export function freshHousing(): Housing {
  return { happiness: HAPPINESS.start, bed: null, sleepingOut: false };
}
