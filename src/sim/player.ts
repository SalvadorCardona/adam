/**
 * Le joueur vit dans la simulation.
 *
 * Sa position détermine ce qu'il récolte et où il peut construire : c'est de
 * la logique de jeu, pas de l'affichage. Il avance à 20 TPS et le rendu
 * interpole entre `prevX/prevY` et la position courante.
 *
 * Adam est une boîte, pas un point : une AABB de 20 × 14 px centrée sur sa
 * position, qui correspond à ses pieds. Un point traverserait visuellement
 * les rochers avant d'être bloqué ; une boîte s'arrête au contact. Sous un
 * arbre, seul le tronc l'arrête : il passe sous le feuillage.
 */

import { TILE_SIZE } from '../core/grid.ts';
import { AGES } from '../data/inhabitants.ts';
import { DEFAULT_LOOK, copyLook } from '../data/wardrobe.ts';
import { boxOverlaps, facingOf, moveBoxAmong, type ObstacleTest } from './motion.ts';
import { Store } from './store.ts';
import type { Contact, Player } from './types.ts';

export type { ObstacleTest, SolidTest } from './motion.ts';

/** Vitesse en tuiles par seconde à pleine amplitude du joystick. */
export const PLAYER_SPEED_TILES = 4.5;

/** Portée de construction, en tuiles, depuis le centre du joueur. */
export const BUILD_REACH_TILES = 7;

/** Capacité du sac, en nombre total d'objets. */
export const INVENTORY_CAPACITY = 60;

/**
 * Ce qu'Adam accepte de porter d'un objet en plus de ce que les chantiers en
 * attendent, tant qu'il n'y a pas de ville où le déposer. Au-delà, il ne
 * récolte plus cet objet : traverser un bosquet ne remplit plus le sac d'un
 * bois dont personne ne veut, et il reste de la place pour la pierre.
 */
export const SPARE_CARRY = 10;

/** Points de vie d'Adam. */
export const PLAYER_MAX_HP = 10;

/** Ticks sans coup reçu avant qu'Adam récupère, puis ticks par point récupéré. */
export const PLAYER_CALM_TICKS = 20 * 4;
export const PLAYER_REGEN_TICKS = 20;

/** Demi-largeur et demi-hauteur de la boîte de collision, en pixels monde. */
export const PLAYER_HALF_W = 10;
export const PLAYER_HALF_H = 7;

const PLAYER_BOX = { halfW: PLAYER_HALF_W, halfH: PLAYER_HALF_H };

/** `age` : celui d'Adam au départ — le monde le tire de la seed (`adultAge`). */
export function createPlayer(x: number, y: number, age: number = AGES.adultMin): Player {
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    facing: 'down',
    moving: false,
    harvesting: false,
    bowCooldown: 0,
    target: null,
    hp: PLAYER_MAX_HP,
    calmTicks: 0,
    xp: 0,
    talents: [],
    gear: 0,
    axe: 0,
    pickaxe: 0,
    age,
    look: copyLook(DEFAULT_LOOK),
    wardrobe: [],
    unseenPieces: [],
    inventory: new Store(INVENTORY_CAPACITY),
  };
}

/**
 * Intègre un tick de déplacement et renvoie la tuile heurtée, s'il y en a une.
 *
 * `axisX` / `axisY` sont analogiques : la vitesse dépend de la distance au
 * centre du joystick, pas seulement de la direction. `speedTiles` est la
 * vitesse à pleine amplitude — celle de base, plus ce qu'ajoute la recherche,
 * moins ce que retire la pluie acide.
 */
export function stepPlayer(
  player: Player,
  axisX: number,
  axisY: number,
  obstacleAt: ObstacleTest,
  stepSeconds: number,
  speedTiles: number = PLAYER_SPEED_TILES,
): Contact | null {
  const speed = speedTiles * TILE_SIZE * stepSeconds;
  const contact = moveBoxAmong(player, PLAYER_BOX, axisX * speed, axisY * speed, obstacleAt);

  player.moving = player.x !== player.prevX || player.y !== player.prevY;

  if (axisX !== 0 || axisY !== 0) player.facing = facingOf(axisX, axisY);

  return contact;
}

/** La boîte du joueur recouvre-t-elle l'emprise donnée ? Sert à refuser un placement sur lui. */
export function playerOverlaps(
  player: Player,
  tx: number,
  ty: number,
  width: number,
  height: number,
): boolean {
  return boxOverlaps(player, PLAYER_BOX, tx, ty, width, height);
}
