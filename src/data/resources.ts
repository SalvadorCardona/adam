/**
 * Ressources de surface — contenu pur.
 *
 * Une ressource se récolte **de proximité** : Adam passe à côté, et chaque
 * passage de récolte en arrache une unité qui va dans son sac. Du bois pour
 * un arbre, du minerai pour un rocher.
 *
 * `amount` est ce qu'une tuile contient avant de disparaître ; `hitbox` ce
 * qui arrête Adam : toute la tuile pour un rocher, le seul tronc pour un
 * arbre — il passe sous le feuillage, une forêt n'est jamais un mur.
 */

import type { ItemId } from './items.ts';
import type { SpriteId } from './sprites.ts';

export interface ResourceProto {
  /** Objet obtenu à chaque unité récoltée. */
  item: ItemId;
  /** Unités par tuile. */
  amount: number;
  /** Ce qui arrête Adam : la tuile entière, ou seulement le tronc. */
  hitbox: 'tile' | 'trunk';
  /**
   * Sprites possibles, tirés par tuile depuis la seed : une forêt mêle les
   * essences. Répéter un sprite le rend plus fréquent.
   */
  sprites: readonly SpriteId[];
  /** Verbe affiché au joueur : « Couper du bois », « Extraire du fer ». */
  verb: string;
}

export const RESOURCES = {
  tree: {
    item: 'wood',
    amount: 5,
    hitbox: 'trunk',
    sprites: ['tree', 'tree', 'tree', 'treePine', 'treePine', 'treeDead'],
    verb: 'Couper',
  },
  ironRock: { item: 'ironOre', amount: 6, hitbox: 'tile', sprites: ['rockIron'], verb: 'Extraire' },
  coalRock: { item: 'coal', amount: 6, hitbox: 'tile', sprites: ['rockCoal'], verb: 'Extraire' },
  stoneRock: { item: 'stone', amount: 8, hitbox: 'tile', sprites: ['rockStone'], verb: 'Casser' },
} as const satisfies Record<string, ResourceProto>;

export type ResourceId = keyof typeof RESOURCES;

export const RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[];

/** Ressource de surface posée sur un filon d'un objet donné. */
export const ROCK_OF_ORE: Partial<Record<ItemId, ResourceId>> = {
  ironOre: 'ironRock',
  coal: 'coalRock',
  stone: 'stoneRock',
};

/**
 * Un arbre planté par le forestier : pousse, jeune arbre, puis arbre adulte
 * — un `tree` comme un autre, qu'on coupe. Avant, il ne se coupe pas, ne se
 * récolte pas et n'arrête personne. L'âge se compte en ticks depuis la
 * plantation : du temps de jeu, qui ne passe pas en pause.
 */
export const SAPLING = {
  /** Ticks de pousse avant de devenir un jeune arbre : une minute. */
  youngTicks: 1200,
  /** Ticks avant d'être un arbre adulte, à couper : trois minutes. */
  adultTicks: 3600,
  /** Ticks entre deux passages de croissance : la pousse n'a pas besoin de mieux. */
  passTicks: 20,
  /** Les essences d'un arbre planté : on ne plante pas d'arbre mort. */
  sprites: ['tree', 'treePine'],
} as const satisfies { sprites: readonly SpriteId[] } & Record<string, unknown>;

/**
 * Les cultures du fermier, case par case : semis, pousse, puis mûre — à
 * récolter. Elles ne sont jamais une ressource : ni Adam ni la hache n'y
 * touchent, elles n'arrêtent personne. L'âge se compte en ticks depuis le
 * semis, du temps de jeu : la nuit, elles poussent encore. Elles grandissent
 * au même passage que les pousses du forestier (`SAPLING.passTicks`).
 *
 * Calibrage : un champ plein de 30 cases mûrit une case toutes les 7 s
 * environ, soit ~8 blés par minute — l'ancienne ferme au complet
 * (4 nourritures toutes les 30 s).
 */
export const CROPS = {
  /** Ticks de semis avant la pousse : une minute. */
  growingTicks: 1200,
  /** Ticks avant d'être mûre : trois minutes et demie. */
  ripeTicks: 4200,
  /** Ce qu'une case récoltée rend : du blé, que la boulangerie transforme en pain. */
  item: 'wheat' as ItemId,
  /** Blé d'une case récoltée, avant les recherches (`farmYield`). */
  yield: 1,
} as const;
