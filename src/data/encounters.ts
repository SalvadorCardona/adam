/**
 * Les rencontres de la route — contenu pur.
 *
 * Explorer ne rapporte pas que des coffres (`data/discoveries.ts`) : la seed
 * sème aussi, par chunk, quelqu'un à croiser (`sim/encounters.ts`), jamais
 * stocké tant qu'on ne l'a pas résolu. Trois sortes :
 * - le **survivant blessé** : Adam le touche, il le suit en boitant (le
 *   patient de la clinique, sans la clinique) jusqu'à la mairie, où il devient
 *   un ouvrier de la colonie. Attaqué en route, il fuit ;
 * - le **marchand ambulant** : une charrette garée avec une seule offre,
 *   rare, payable sur place (la fenêtre Troc de la caravane) ;
 * - la **biche dorée** : elle fuit Adam. Rester à portée assez longtemps
 *   (comme le cochon) l'apprivoise, et elle laisse une pièce de garde-robe.
 *
 * La densité (`chance`, la chance qu'un chunk de 32 × 32 tuiles en cache
 * une) suit les paliers de distance des points d'intérêt
 * (`DISCOVERY_TIERS`) : plus loin, plus fréquent.
 *
 * Durées en ticks (20 par seconde), distances en tuiles, vitesses en tuiles
 * par seconde.
 */

import type { ItemId } from './items.ts';

export const ENCOUNTER_KINDS = ['wounded', 'merchant', 'deer'] as const;

export type EncounterKind = (typeof ENCOUNTER_KINDS)[number];

/** Un tableau de trois (un par palier de `DISCOVERY_TIERS`). */
type ByTier<T> = readonly [T, T, T];

/** Un échange de marchand : ce qu'il demande, ce qu'il donne. */
export interface WaysideOffer {
  cost: Partial<Record<ItemId, number>>;
  items: Partial<Record<ItemId, number>>;
}

export const ENCOUNTERS = {
  wounded: {
    chance: [0.06, 0.09, 0.13],
    /** Adam le touche à cette distance, en tuiles. */
    touchTiles: 1.2,
    /** Vitesse de son boitillement ; Adam marche à 4,5. */
    limpSpeed: 3.2,
    /** Il s'arrête à cette distance d'Adam : il suit, il ne pousse pas. */
    followGap: 1,
    /** Il entre à la mairie à cette distance de sa porte. */
    admitTiles: 1.8,
    /** Un ennemi à cette distance le fait fuir. */
    fearTiles: 5,
    /** Sa fuite dure ce temps, à cette vitesse ; calmé, il attend là où il s'est arrêté. */
    fleeTicks: 20 * 5,
    fleeSpeed: 3.6,
    /** Trop longtemps à plus de `lostTiles` d'Adam, il renonce à le suivre et attend. */
    lostTiles: 14,
    lostTicks: 20 * 10,
    halfW: 6,
    halfH: 5,
  },
  merchant: {
    chance: [0.05, 0.08, 0.12],
    /** Adam est au contact de la charrette à cette distance, en pixels monde. */
    reach: 40,
    /** Une offre par palier, tirée de la seed et de l'id parmi la liste du palier : rare, jamais un échange courant. */
    offers: [
      [
        { cost: { wood: 20, food: 10 }, items: { ironPlate: 3 } },
        { cost: { stone: 20, water: 10 }, items: { ironPlate: 3 } },
      ],
      [
        { cost: { coal: 12, ironOre: 12 }, items: { ironPlate: 6 } },
        { cost: { food: 15, stone: 15 }, items: { wolfFang: 2, crabClaw: 2 } },
      ],
      [
        { cost: { ironPlate: 4, food: 10 }, items: { mutantGoo: 3, radCore: 1 } },
        { cost: { ironPlate: 3, coal: 10 }, items: { radCore: 1, wolfFang: 2 } },
      ],
    ],
  },
  deer: {
    chance: [0.05, 0.08, 0.12],
    /** Elle s'enfuit si Adam passe plus près que cela. */
    flinchTiles: 3,
    /** … et se calme à cette distance. */
    calmTiles: 5.5,
    /** Elle est à portée — la jauge monte — à cette distance d'Adam. */
    catchTiles: 4,
    /** Ticks à portée avant qu'elle se laisse approcher ; hors de portée, la jauge redescend de `decay` par tick. */
    catchTicks: 20 * 4,
    decay: 0.5,
    speed: 0.9,
    fleeSpeed: 3.4,
    /** Écart maximal au point d'origine, en flânant. */
    leashTiles: 8,
    halfW: 7,
    halfH: 5,
  },
  /** Elles apparaissent à moins de `spawnTiles` d'Adam et sont rangées (sauf le survivant qui le suit) au-delà de `despawnTiles`. */
  spawnTiles: 16,
  despawnTiles: 30,
  /** Aucune rencontre à moins de tant de tuiles du départ : la clairière en est exempte. */
  minSpawnTiles: 24,
} as const satisfies {
  wounded: { chance: ByTier<number> } & Record<string, unknown>;
  merchant: { chance: ByTier<number>; reach: number; offers: ByTier<readonly WaysideOffer[]> };
  deer: { chance: ByTier<number> } & Record<string, unknown>;
  spawnTiles: number;
  despawnTiles: number;
  minSpawnTiles: number;
};
