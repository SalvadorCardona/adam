/**
 * La production hors ligne — contenu pur : tous ses réglages, ici seulement.
 *
 * Jeu fermé (ou onglet laissé en arrière-plan), la ville continue de vivre.
 * À la réouverture, le temps écoulé depuis la dernière sauvegarde se rejoue
 * d'un coup, **en agrégé** : pas un tick par tick, mais des pas de
 * `stepTicks` où chaque producteur rend sa cadence moyenne, chaque habitant
 * mange et boit à son rythme, et les comptes à rebours (naissances,
 * recherches, formations) avancent (`World.catchUp`, `sim/offline.ts`).
 *
 * Ce qui n'avance pas : la journée (ni nuit, ni vague, ni aube, donc ni âge
 * ni bonheur), les ennemis, la météo, les chantiers, les mouvements. Aucune
 * attaque, aucune mort hors ligne : un habitant sans vivres attend, affamé
 * (`starvedGauge`), et sa jauge reprend au retour avec un avertissement.
 */

/** Ticks de simulation par minute (20 TPS). */
const MINUTE = 20 * 60;

export const OFFLINE = {
  /**
   * Plafond du temps rattrapé, en ms : huit heures. Au-delà, rien de plus.
   * Une recherche pourra le relever : il se lit en un seul point,
   * `World.offlineCapMs()`.
   */
  maxMs: 8 * 60 * 60 * 1000,
  /** Sous cette absence, en ms, rien n'est rattrapé et aucun récap ne s'ouvre : une minute. */
  minMs: 60 * 1000,
  /** Le pas du calcul agrégé, en ticks : une minute de jeu. Huit heures font 480 pas. */
  stepTicks: MINUTE,
  /**
   * La jauge d'un habitant que la ville n'a pas pu nourrir (ou abreuver) ne
   * descend pas plus bas hors ligne : il est affamé (sous `weakBelow`,
   * `data/needs.ts`), mais pas à zéro — le compte à rebours de la mort ne
   * démarre qu'en jeu, s'il continue d'y descendre.
   */
  starvedGauge: 0.1,
  /**
   * Bois rapporté par minute par un bûcheron au travail : un arbre de cinq
   * unités par aller-retour, marche et coups de hache compris, attentes aussi.
   * Le bois hors ligne ne dépasse jamais celui des arbres debout dans le rayon
   * de la cabane (`LUMBERJACKS.carry` par arbre).
   */
  lumberjackWoodPerMinute: 12,
  /**
   * Part du champ qu'une ferme récolte hors ligne : chaque case utilisable
   * rend `CROPS.yield` (plus les recherches) toutes les `CROPS.ripeTicks`, à
   * proportion de ses fermiers. Un peu moins que le champ plein en jeu : les
   * semis, les trajets, le coffre à vider.
   */
  farmEfficiency: 0.9,
} as const;

/** Les alertes du récap, dans l'ordre où il les montre. */
export const OFFLINE_ALERTS = ['hunger', 'thirst', 'lowFood', 'lowWater', 'nurseryHungry', 'storeFull'] as const;

export type OfflineAlertId = (typeof OFFLINE_ALERTS)[number];
