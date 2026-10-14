/**
 * Déplacement d'une boîte sur la grille — la seule « physique » du jeu.
 *
 * Adam, les mutants et les enfants sont des AABB centrées sur leur position.
 * Les deux axes sont intégrés séparément : une boîte qui bute sur un obstacle
 * en diagonale glisse le long au lieu de s'y coller. Le contact retenu est
 * celui de l'axe dominant — en poussant en diagonale contre un rocher, c'est
 * ce rocher qu'on heurte, pas l'arbre qu'on frôle.
 *
 * Pas de vitesse, pas d'inertie, pas de masse : une position voulue, une
 * position obtenue. C'est tout ce qu'un jeu de construction demande.
 *
 * Adam seul voit plus fin que la tuile (`moveBoxAmong`) : un arbre ne
 * l'arrête que par son tronc, et il glisse autour au lieu de s'y coller.
 */

import { TILE_SIZE, floorDiv } from '../core/grid.ts';
import type { Contact, Facing } from './types.ts';

/** Une tuile est-elle infranchissable pour cette boîte ? */
export type SolidTest = (tx: number, ty: number) => boolean;

/**
 * La partie solide d'une tuile, en pixels depuis son coin haut-gauche.
 * `glide` : la boîte qui la heurte de face la contourne d'elle-même.
 */
export interface TileBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  glide: boolean;
}

/** Une tuile pleine : l'eau, un rocher, un bâtiment. On la heurte, on ne la contourne pas. */
export const FULL_TILE: TileBox = { left: 0, top: 0, right: TILE_SIZE, bottom: TILE_SIZE, glide: false };

/** Ce qui arrête une boîte dans cette tuile, ou `null` si elle est libre. */
export type ObstacleTest = (tx: number, ty: number) => TileBox | null;

/** Ce qu'une boîte mobile porte : position courante, position au tick précédent. */
export interface Body {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}

export interface BoxSize {
  halfW: number;
  halfH: number;
}

/**
 * Intègre un déplacement de (dx, dy) pixels et renvoie la tuile heurtée sur
 * l'axe dominant, ou `null` si rien n'a bloqué. `body.prev*` reçoit la
 * position de départ : le rendu interpole entre les deux.
 */
export function moveBox(body: Body, size: BoxSize, dx: number, dy: number, isSolid: SolidTest): Contact | null {
  body.prevX = body.x;
  body.prevY = body.y;

  const hitX = dx === 0 ? null : blockingTile(body.x + dx, body.y, size, isSolid);
  if (!hitX) body.x += dx;

  const hitY = dy === 0 ? null : blockingTile(body.x, body.y + dy, size, isSolid);
  if (!hitY) body.y += dy;

  if (hitX && hitY) return Math.abs(dx) >= Math.abs(dy) ? hitX : hitY;
  return hitX ?? hitY;
}

/**
 * La première tuile solide que la boîte occuperait en (x, y), ou `null`.
 * Les quatre coins suffisent tant que la boîte est plus petite qu'une tuile.
 */
export function blockingTile(x: number, y: number, size: BoxSize, isSolid: SolidTest): Contact | null {
  const minTx = floorDiv(x - size.halfW, TILE_SIZE);
  const maxTx = floorDiv(x + size.halfW - 1, TILE_SIZE);
  const minTy = floorDiv(y - size.halfH, TILE_SIZE);
  const maxTy = floorDiv(y + size.halfH - 1, TILE_SIZE);

  for (let ty = minTy; ty <= maxTy; ty += 1) {
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      if (isSolid(tx, ty)) return { tx, ty };
    }
  }
  return null;
}

/**
 * `moveBox` contre des obstacles plus petits que la tuile. Bloquée sur l'axe
 * dominant par un obstacle `glide`, la boîte se décale sur l'autre axe, au
 * plus d'un pas, vers le côté le plus proche pour le dépasser : poussé vers
 * l'ouest dans une forêt, Adam se range entre deux rangées de troncs au
 * lieu de s'arrêter au premier.
 */
export function moveBoxAmong(
  body: Body,
  size: BoxSize,
  dx: number,
  dy: number,
  obstacleAt: ObstacleTest,
): Contact | null {
  body.prevX = body.x;
  body.prevY = body.y;

  const hitX = dx === 0 ? null : blockingObstacle(body.x + dx, body.y, size, obstacleAt);
  if (!hitX) body.x += dx;

  const hitY = dy === 0 ? null : blockingObstacle(body.x, body.y + dy, size, obstacleAt);
  if (!hitY) body.y += dy;

  const horizontal = Math.abs(dx) >= Math.abs(dy);

  if (horizontal && hitX?.box.glide) glideAround(body, size, hitX, 'y', Math.abs(dx), obstacleAt);
  if (!horizontal && hitY?.box.glide) glideAround(body, size, hitY, 'x', Math.abs(dy), obstacleAt);

  const hit = hitX && hitY ? (horizontal ? hitX : hitY) : (hitX ?? hitY);

  return hit ? { tx: hit.tx, ty: hit.ty } : null;
}

interface Obstacle extends Contact {
  box: TileBox;
}

/** Le premier obstacle que la boîte chevaucherait en (x, y), ou `null`. */
function blockingObstacle(x: number, y: number, size: BoxSize, obstacleAt: ObstacleTest): Obstacle | null {
  const minTx = floorDiv(x - size.halfW, TILE_SIZE);
  const maxTx = floorDiv(x + size.halfW - 1, TILE_SIZE);
  const minTy = floorDiv(y - size.halfH, TILE_SIZE);
  const maxTy = floorDiv(y + size.halfH - 1, TILE_SIZE);

  for (let ty = minTy; ty <= maxTy; ty += 1) {
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      const box = obstacleAt(tx, ty);

      if (
        box &&
        x + size.halfW > tx * TILE_SIZE + box.left &&
        x - size.halfW < tx * TILE_SIZE + box.right &&
        y + size.halfH > ty * TILE_SIZE + box.top &&
        y - size.halfH < ty * TILE_SIZE + box.bottom
      ) {
        return { tx, ty, box };
      }
    }
  }
  return null;
}

/** Décale la boîte sur `axis` vers le bord le plus proche de l'obstacle, d'au plus `step` pixels. */
function glideAround(
  body: Body,
  size: BoxSize,
  obstacle: Obstacle,
  axis: 'x' | 'y',
  step: number,
  obstacleAt: ObstacleTest,
): void {
  const { box } = obstacle;
  const half = axis === 'x' ? size.halfW : size.halfH;
  const origin = axis === 'x' ? obstacle.tx * TILE_SIZE : obstacle.ty * TILE_SIZE;
  const before = origin + (axis === 'x' ? box.left : box.top) - half - body[axis];
  const after = origin + (axis === 'x' ? box.right : box.bottom) + half - body[axis];
  const shift = -before <= after ? Math.max(before, -step) : Math.min(after, step);
  const x = axis === 'x' ? body.x + shift : body.x;
  const y = axis === 'y' ? body.y + shift : body.y;

  if (shift !== 0 && !blockingObstacle(x, y, size, obstacleAt)) body[axis] += shift;
}

/** Direction dominante d'un vecteur. À amplitude égale, le regard reste horizontal. */
export function facingOf(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** La boîte recouvre-t-elle l'emprise de tuiles donnée ? Bords exclus. */
export function boxOverlaps(
  body: { x: number; y: number },
  size: BoxSize,
  tx: number,
  ty: number,
  width: number,
  height: number,
): boolean {
  const left = tx * TILE_SIZE;
  const top = ty * TILE_SIZE;
  const right = left + width * TILE_SIZE;
  const bottom = top + height * TILE_SIZE;

  return (
    body.x + size.halfW > left &&
    body.x - size.halfW < right &&
    body.y + size.halfH > top &&
    body.y - size.halfH < bottom
  );
}
