/**
 * Le Prestige — contenu pur, aucune logique.
 *
 * Une ressource à part : elle ne se porte pas, ne se stocke dans aucun
 * coffre et ne se troque pas. C'est un compteur de la colonie
 * (`World.prestige`), sauvegardé avec la partie, qui monte à chaque
 * bâtiment construit et à chaque ennemi vaincu. Rien ne le dépense encore.
 *
 * Son icône est `PRESTIGE_ICON` (`data/icons.ts`), sa couleur celle de la
 * colonie.
 */

import type { Tone } from './artDirection.ts';
import type { BuildingId } from './buildings.ts';
import type { EnemyId, WildlifeId } from './enemies.ts';

export interface PrestigeProto {
  /** Libellé affiché. */
  label: string;
  /** Teinte de l'icône et du compteur au HUD. */
  tone: Tone;
}

export const PRESTIGE = {
  label: 'Prestige',
  tone: 'yellow',
} as const satisfies PrestigeProto;

/**
 * Ce que rapporte un bâtiment, une fois, à son premier achèvement sur son
 * emplacement : un chantier rebâti sur une ruine ne rapporte rien de plus
 * (`World.prestigeSites`). Plus le bâtiment est gros, plus il rapporte.
 */
export const BUILD_PRESTIGE = {
  townHall: 5,
  lumberCamp: 2,
  foresterHouse: 2,
  quarry: 2,
  well: 2,
  logisticsPost: 3,
  constructionPost: 3,
  drill: 2,
  nursery: 3,
  builderHouse: 3,
  home: 2,
  farm: 2,
  watchtower: 2,
  forge: 3,
  charcoalKiln: 2,
  clinic: 3,
  purifier: 3,
  barracks: 3,
  lab: 4,
  antenna: 10,
} as const satisfies Record<BuildingId, number>;

/** Ce que rapporte un ennemi vaincu — abattu ou assommé. Plus il est fort, plus il rapporte. */
export const KILL_PRESTIGE = {
  mutant: 1,
  brute: 3,
  queen: 20,
  larva: 1,
  crab: 1,
  wolf: 2,
  guardian: 2,
  spitter: 2,
  /** Plus le Prestige de sa base (`ENEMY_BASE_LEVELS[].chief.prestige`). */
  chief: 5,
  /** Les gardiens de région : plus la conquête (`REGION_RINGS[].prestige`, `xp`). */
  greatWolf: 5,
  giantCrab: 5,
  colossus: 5,
  sludgeKing: 5,
} as const satisfies Record<EnemyId | WildlifeId, number>;
