/**
 * Les habitants : leur âge, leur prénom, ce qu'ils font. Les ennemis aussi
 * ont un âge (de l'état, qui avance à l'aube) et un surnom (haché).
 *
 * L'âge est de l'état (il avance à l'aube, `World.dawn`) ; le prénom ne
 * l'est pas : il se relit dans la seed et l'id, qu'un enfant garde en
 * devenant ouvrier. Rien ici ne tire le PRNG du monde — un âge d'adulte est
 * un hachage, comme la flânerie : en ajouter un ne change pas la suite des
 * vagues.
 */

import { hash3 } from '../core/rng.ts';
import { FOE_NAMES, type AgeRange } from '../data/enemies.ts';
import { AGES, NAMES, SEXES, type Sex } from '../data/inhabitants.ts';
import { BIO_COUNT, TRAIT_IDS, TRAIT_INHERIT, type TraitId } from '../data/traits.ts';
import type { MobileId } from './types.ts';

/** Sel du hachage d'Adam, qui n'a pas d'id de mobile. */
export const ADAM_SALT = -1;

/** L'âge d'un adulte arrivé tout fait, entre `AGES.adultMin` et `AGES.adultMax`, tiré de la seed. */
export function adultAge(seed: number, id: MobileId): number {
  const span = AGES.adultMax - AGES.adultMin + 1;

  return AGES.adultMin + (hash3(seed, id, 0x0a9e) % span);
}

/** Le rang de `NAMES` que la seed et l'id tirent pour un habitant. */
function nameRank(seed: number, id: MobileId): number {
  return hash3(seed, id, 0x4a3e) % NAMES.length;
}

/**
 * Le sexe d'un habitant à sa venue — enfant né à la nurserie, ouvrier de la
 * colonie, ex-mutant, survivant —, à pile ou face sur la seed et son id :
 * moitié-moitié, et le même à chaque partie de la même seed. Un hachage,
 * comme l'âge, pas le PRNG du monde : en tirer un ne change pas la suite des
 * vagues. C'est la parité du prénom tiré : une sauvegarde d'avant le sexe le
 * retrouve au chargement sans qu'aucun prénom ne change.
 */
export function sexOf(seed: number, id: MobileId): Sex {
  return SEXES[nameRank(seed, id) % SEXES.length]!;
}

/** Le prénom d'un habitant, tiré de la seed et de son id parmi ceux de son sexe. */
export function nameOf(seed: number, id: MobileId, sex: Sex): string {
  const rank = nameRank(seed, id);

  // Le rang voisin est de l'autre sexe : un prénom de femme pour une femme, quoi qu'ait tiré le hachage.
  return NAMES[SEXES[rank % SEXES.length] === sex ? rank : rank ^ 1]!;
}

/**
 * L'âge d'un ennemi — mutant ou bête — à son apparition, tiré de la seed et
 * de son id entre les bornes de son espèce : un hachage, pas le PRNG du
 * monde, pour ne pas changer la suite des vagues.
 */
export function foeAge(seed: number, id: MobileId, range: AgeRange): number {
  return range.min + (hash3(seed, id, 0x0f0e) % (range.max - range.min + 1));
}

/** Le surnom d'un ennemi, tiré de la seed et de son id : jamais sauvegardé. */
export function foeName(seed: number, id: MobileId): string {
  return FOE_NAMES[hash3(seed, id, 0x0f0a) % FOE_NAMES.length]!;
}

/** Les aubes qu'il reste à un enfant avant de travailler ; 0 s'il a l'âge. */
export function yearsToWork(age: number): number {
  return Math.max(0, Math.ceil((AGES.work - age) / AGES.yearsPerCycle));
}

/** A-t-il l'âge de travailler ? */
export function canWork(age: number): boolean {
  return age >= AGES.work;
}

/**
 * Le trait d'un habitant à sa venue (`data/traits.ts`), tiré de la seed et de
 * son id : un hachage, pas le PRNG du monde. Une sauvegarde d'avant les traits
 * le retrouve ainsi au chargement, le même à chaque fois.
 */
export function traitOf(seed: number, id: MobileId): TraitId {
  return TRAIT_IDS[hash3(seed, id, 0x7a17) % TRAIT_IDS.length]!;
}

/**
 * Le trait d'un enfant qui naît : avec une chance de `TRAIT_INHERIT`, celui
 * d'un des `parents` (les adultes de la colonie, tirés au hasard par hachage),
 * sinon le sien. Sans adulte, le sien.
 */
export function bornTrait(seed: number, id: MobileId, parents: readonly TraitId[]): TraitId {
  const roll = (hash3(seed, id, 0x1e41) % 1000) / 1000;

  if (parents.length === 0 || roll >= TRAIT_INHERIT) return traitOf(seed, id);
  return parents[hash3(seed, id, 0x1e42) % parents.length]!;
}

/** Le rang de sa petite biographie parmi celles de son trait (`BIO_COUNT`) : la fiche la lit dans le dictionnaire. */
export function bioRank(seed: number, id: MobileId): number {
  return hash3(seed, id, 0xb10) % BIO_COUNT;
}

/** La longueur maximale d'un nom donné par le joueur. */
export const NAME_MAX = 16;

/** Le nom proposé, nettoyé : espaces resserrés, coupé à `NAME_MAX` ; `null` s'il est vide. */
export function cleanName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();

  return name === '' ? null : name;
}
