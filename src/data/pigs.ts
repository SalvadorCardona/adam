/**
 * L'élevage de cochons — contenu pur.
 *
 * Deux moitiés, comme la chasse :
 * - le **cochon sauvage** (`PIGS.wild`) : un animal paisible, rare, qui flâne
 *   au cœur des forêts autour d'un point tiré de la seed (comme une tanière,
 *   cf. `sim/pigs.ts`). Il n'attaque pas, et l'arc d'Adam ne le vise pas ;
 * - l'**élevage** (`PIG_FARM`) : le cochon qu'on y ramène y reste et donne de
 *   la viande à chaque cycle.
 *
 * Apprivoiser n'a pas de bouton : Adam reste un instant près du cochon
 * (`PIGS.tame`), et il le suit — un seul à la fois, pour que la file reste
 * maniable au toucher. Éloigné trop longtemps, ou effrayé par une
 * bête sauvage, il s'enfuit un moment puis redevient sauvage — jamais
 * perdu pour de bon, jamais tué.
 *
 * Durées en ticks (20 par seconde), distances en tuiles, vitesses en tuiles
 * par seconde.
 */

import type { ItemId } from './items.ts';

export const PIGS = {
  wild: {
    /** Tirages de point d'apparition par chunk, sur la forêt : plus il y en a, plus on en croise. */
    drawsPerChunk: 3,
    /** Chance qu'un tirage tombant en forêt donne un cochon : il reste rare. */
    chance: 0.3,
    /** Ticks avant qu'un point vidé (cochon apprivoisé) en offre un autre : le temps d'en retrouver un plus tard. */
    respawnTicks: 20 * 60 * 4,
    /** Flânerie : vitesse, et écart maximal au point d'origine. */
    speed: 0.9,
    leashRadius: 5,
    /** Hors de ce rayon d'Adam, un cochon sauvage est rangé (il revient au prochain passage). */
    despawnDistance: 72,
    /** Aucun cochon à moins de tant de tuiles de la mairie : la forêt du départ n'en a pas. */
    townHallClearance: 20,
    /** Taille de la boîte de collision, en pixels. */
    halfW: 7,
    halfH: 5,
  },
  tame: {
    /** Adam à moins de `radius` tuiles pendant `ticks` ticks : le cochon le suit. */
    radius: 2.5,
    ticks: 30,
    /** Éloigné, la jauge retombe d'autant par tick. */
    decay: 1,
  },
  follow: {
    /** Il se tient à cette distance d'Adam, sans le piétiner. */
    distance: 1.6,
    speed: 4.2,
    /** Au-delà, il décroche : la patience s'use, sans panique. */
    looseDistance: 9,
    /** Ticks passés au-delà de `looseDistance` avant qu'il s'enfuie : assez pour rattraper en courant. */
    patienceTicks: 20 * 6,
    /** Une bête sauvage (mutant, loup, crabe) à moins de tant de tuiles l'effraie. */
    scareDistance: 3.5,
  },
  flee: {
    /** Il s'enfuit à cette vitesse, loin d'Adam ou de ce qui l'a effrayé, puis se calme. */
    speed: 3.6,
    ticks: 20 * 5,
  },
  /** Entrer dans l'élevage : le cochon qui suit Adam y entre à moins de tant de tuiles de son centre. */
  enterDistance: 3,
} as const;

/**
 * L'élevage de cochons. Un seul cochon suffit à le lancer ; chaque cochon de
 * plus (jusqu'à `capacity`) donne `meatPerPig` de viande de plus à chaque
 * cycle. Les cochons ne se reproduisent pas : il faut les trouver.
 */
export const PIG_FARM = {
  /** Cochons logés au plus. */
  capacity: 3,
  /** Durée d'un cycle, en ticks. */
  cycleTicks: 20 * 60,
  /** Viande par cochon et par cycle. */
  meatPerPig: 2,
  /**
   * Le grain : s'il y en a en ville (dans le rayon logistique de la mairie),
   * l'élevage en prend `amount` par cycle et le cycle dure `speed` fois moins.
   * Il n'en prend que si la ville en garde au moins `keepInTown` après lui —
   * les ouvriers mangent d'abord.
   */
  feed: { item: 'food', amount: 2, speed: 0.6, keepInTown: 12 } as { item: ItemId; amount: number; speed: number; keepInTown: number },
  /** Quand l'élevage tombe, ses cochons s'échappent : ils se dispersent à tant de tuiles du bord de l'enclos. */
  escapeSpread: 1.5,
} as const;
