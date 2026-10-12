/**
 * Les coffres de la carte — contenu pur.
 *
 * Des caisses de récup oubliées avant la fin du monde, semées par la seed
 * (`sim/chests.ts`), jamais stockées : seule la liste des coffres ouverts est
 * de l'état (`World.openedChests`). Adam en ouvre un en s'en approchant ; il
 * y trouve une pièce de garde-robe (`WARDROBE_LOOT.chest`) et du butin
 * (`DISCOVERIES.chest`, qui règle aussi leur densité).
 */

export const CHESTS = {
  /** Tentatives pour lui trouver une case nue : de l'herbe ou du sable, ni arbre, ni rocher, ni filon. */
  tries: 4,
  /** Jamais dans la clairière du départ : distance au point de départ, en tuiles. */
  minSpawnTiles: 14,
  /** Adam l'ouvre quand son centre passe à cette distance du centre du coffre, en tuiles. */
  openTiles: 1.6,
} as const;
