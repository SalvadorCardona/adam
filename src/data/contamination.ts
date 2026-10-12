/**
 * Terres polluées et radioactives — contenu pur, tout se règle ici.
 *
 * Deux sols en plus de ceux de la carte (`sim/terrain.ts`), tirés de la seed
 * comme eux : un seul champ de bruit, dont les creux sont de la terre
 * **polluée** et les sommets, au cœur des plaques, de la terre
 * **radioactive**. Aucun des deux ne se bâtit. Seule la pollution se
 * nettoie : la station de dépollution (`BUILDINGS.purifier`) redonne de la
 * terre saine aux cases polluées de son rayon, une à la fois. Les cases
 * nettoyées sont de l'état (`sim/contamination.ts`, sauvegardé sous
 * `cleaned`) ; la carte, elle, n'est jamais stockée.
 */

export type ContaminationKind = 'polluted' | 'radioactive';

export interface ContaminationProto {
  /** Peut-on y poser un bâtiment ? Non, pour les deux. */
  buildable: boolean;
  /** Une station de dépollution peut-elle la rendre saine ? */
  cleanable: boolean;
}

/**
 * Ce que chaque sol permet. La terre radioactive est inconstructible et ne se
 * nettoie pas — pour l'instant : son comportement tient dans cette ligne,
 * pour qu'on puisse l'enrichir (danger, récolte altérée…) sans toucher au reste.
 */
export const CONTAMINATION_KINDS = {
  polluted: { buildable: false, cleanable: true },
  radioactive: { buildable: false, cleanable: false },
} as const satisfies Record<ContaminationKind, ContaminationProto>;

export const CONTAMINATION = {
  /**
   * Taille des plaques, en tuiles : plus c'est grand, plus elles sont vastes
   * et espacées.
   */
  cell: 12,
  /** Seuil du bruit (0 à 1) au-dessus duquel la terre est polluée : plus haut, moins de pollution. */
  pollutedFrom: 0.72,
  /** Seuil au-dessus duquel la terre est radioactive : le cœur des plaques. */
  radioactiveFrom: 0.86,
  /**
   * Rayon, en tuiles depuis le centre de la mairie, où la terre est toujours
   * saine : la clairière de départ et ses bases ne sont jamais gâtées.
   */
  safeRadius: 26,
} as const;

/**
 * La station de dépollution : jusqu'où elle porte, à quelle vitesse elle agit.
 * Elle se débloque au labo (recherche « Dépollution ») ; « Filtres doubles »
 * raccourcit son intervalle (`purifyTicks`).
 */
export const PURIFIER = {
  /** Portée en tuiles, mesurée depuis le bord de son emprise. */
  radius: 4,
  /** Une case polluée redevient saine tous les tant de ticks (20 ticks = 1 s), la plus proche d'abord. */
  intervalTicks: 60,
} as const;
