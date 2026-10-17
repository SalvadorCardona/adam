/**
 * Les arcs et leurs flèches.
 *
 * Toutes les armes du jeu sont automatiques : elles cherchent l'ennemi le
 * plus proche à portée et tirent dès que leur délai est écoulé. Adam porte
 * la sienne en permanence et vise tout ce qui l'attaque — mutants, crabes,
 * loups ; la tour de guet en porte une plus longue et ne vise que les
 * mutants, les seuls à s'en prendre au village.
 *
 * Pas de ligne de vue : la simulation n'en a pas, une flèche passe
 * au-dessus des arbres, des rochers et des murs.
 *
 * Les cracheurs des bases tirent dans l'autre sens : un crachat (`spit`)
 * vise Adam, lentement, et s'écrase sur les bâtiments — pas sur les arbres.
 *
 * Une flèche est une ligne droite tirée vers la position du mutant au
 * moment du tir : pas d'anticipation. Par coup de vent, elle part en arc —
 * le vent la pousse à chaque tick — et le tireur vise d'autant contre le
 * vent : la courbe se voit, la cible reste touchée. Un mutant lent et une flèche rapide
 * suffisent à ce qu'elle touche presque toujours, et la rater de temps en
 * temps fait partie du charme — à condition que la collision soit balayée,
 * cf. `stepArrow`.
 */

import { TILE_SIZE, distanceSq } from '../core/grid.ts';
import { ENEMIES, SPITTER, WILDLIFE } from '../data/enemies.ts';
import { FIREBALL } from '../data/enemyBases.ts';
import { WEAPONS, type WeaponId } from '../data/weapons.ts';
import { PLAYER_HALF_H, PLAYER_HALF_W } from './player.ts';
import type { Arrow, Fireball, Foe, MobileId, Spit } from './types.ts';

/**
 * L'ennemi le plus proche de (x, y) à moins de `range` tuiles, ou `null`.
 * À égalité, le premier rencontré : l'ordre de la map, donc déterministe.
 */
export function nearestFoe<T extends Foe>(foes: Iterable<T>, x: number, y: number, range: number): T | null {
  const limit = range * TILE_SIZE;
  let best: T | null = null;
  let bestSq = limit * limit;

  for (const foe of foes) {
    if (!isTargetable(foe)) continue;

    const sq = distanceSq(x, y, foe.x, foe.y);

    if (sq < bestSq || (best === null && sq === bestSq)) {
      bestSq = sq;
      best = foe;
    }
  }
  return best;
}

/** Un mutant qui sort encore de sa flaque ne se vise pas, et les flèches le traversent. */
export function isTargetable(foe: Foe): boolean {
  return foe.kind !== 'mutant' || foe.emerge <= 0;
}

/** Demi-boîte d'un ennemi, en pixels monde : ses pieds. */
export function foeBox(foe: Foe): { halfW: number; halfH: number } {
  return foe.kind === 'mutant' ? ENEMIES[foe.proto] : WILDLIFE[foe.proto];
}

/** Poussée du vent sur une flèche, en pixels par tick² ; nulle par temps calme. */
export interface Wind {
  x: number;
  y: number;
}

export const NO_WIND: Wind = { x: 0, y: 0 };

/**
 * Fabrique une flèche partant de (x, y) vers la cible. L'id est donné par le monde.
 *
 * Avec du vent, la visée se décale de ce qu'il poussera la flèche pendant
 * son vol : après n ticks, une poussée `a` l'a déportée de a·n(n+1)/2. Le
 * point visé change la durée du vol, qui change le point visé : trois
 * passes suffisent à ce qu'une cible immobile à portée d'arc soit touchée.
 * Au-delà, face au vent, la flèche retombe court.
 */
export function shoot(
  id: number,
  weapon: WeaponId,
  x: number,
  y: number,
  target: { x: number; y: number },
  wind: Wind = NO_WIND,
): Arrow {
  const proto = WEAPONS[weapon];
  const pixelsPerTick = (proto.arrowSpeed * TILE_SIZE) / 20;
  let dx = target.x - x;
  let dy = target.y - y;

  for (let pass = 0; pass < AIM_PASSES && (wind.x !== 0 || wind.y !== 0); pass += 1) {
    const flight = Math.hypot(dx, dy) / pixelsPerTick;
    const drift = (flight * (flight + 1)) / 2;

    dx = target.x - wind.x * drift - x;
    dy = target.y - wind.y * drift - y;
  }

  const distance = Math.hypot(dx, dy) || 1;
  // La flèche vole un peu plus loin que la portée : la cible bouge.
  const ttl = Math.ceil(((proto.range + 1) * TILE_SIZE) / pixelsPerTick);

  return {
    kind: 'arrow',
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    facing: 'right',
    moving: true,
    vx: (dx / distance) * pixelsPerTick,
    vy: (dy / distance) * pixelsPerTick,
    ttl,
    damage: proto.damage,
  };
}

/**
 * Un tick de flèche : le vent la pousse, elle avance, et renvoie l'ennemi touché s'il y en a un.
 * `null` si elle vole encore ; `ttl` à zéro si elle s'est perdue.
 */
export function stepArrow<T extends Foe>(arrow: Arrow, foes: Iterable<T>, wind: Wind = NO_WIND): T | null {
  arrow.vx += wind.x;
  arrow.vy += wind.y;
  arrow.prevX = arrow.x;
  arrow.prevY = arrow.y;
  arrow.x += arrow.vx;
  arrow.y += arrow.vy;
  arrow.ttl -= 1;

  /*
   * Test balayé, pas ponctuel. Une flèche avance de 25 px par tick ; la
   * boîte d'un mutant en fait 20 de large et 24 de haut. Tester la seule
   * position d'arrivée, c'est laisser la flèche sauter par-dessus la cible
   * une fois sur deux — l'arc d'Adam ratait un mutant immobile à trois
   * tuiles. On échantillonne donc le trajet du tick par pas de `SWEEP_STEP`.
   */
  const length = Math.hypot(arrow.vx, arrow.vy);
  const samples = Math.max(1, Math.ceil(length / SWEEP_STEP));
  // Une liste déjà relevée (`World.foes`) se lit telle quelle ; un itérable, une fois, avant le balayage.
  const list: readonly T[] = Array.isArray(foes) ? (foes as readonly T[]) : [...foes];

  for (let i = 1; i <= samples; i += 1) {
    const x = arrow.prevX + (arrow.vx * i) / samples;
    const y = arrow.prevY + (arrow.vy * i) / samples;

    for (const foe of list) {
      if (isTargetable(foe) && touches(foe, x, y)) return foe;
    }
  }
  return null;
}

/** Passes de correction de la visée contre le vent. */
const AIM_PASSES = 3;

/** Pas d'échantillonnage du trajet d'une flèche, en pixels : moins que la plus petite dimension d'une cible. */
const SWEEP_STEP = 6;

/**
 * La boîte d'un ennemi est basse (ses pieds) ; la flèche vise son corps,
 * qu'on prend deux fois plus haut que la boîte.
 */
function touches(foe: Foe, x: number, y: number): boolean {
  const box = foeBox(foe);

  return Math.abs(x - foe.x) <= box.halfW + 2 && y >= foe.y - box.halfH * 3 && y <= foe.y + box.halfH;
}

/**
 * Un crachat de cracheur partant de (x, y) vers la cible, à `SPITTER.speed`
 * : il vole un peu plus loin que sa portée, puis tombe. L'id est donné par
 * le monde. Pas de vent : une boule de bave est lourde.
 */
export function spit(id: number, from: MobileId, x: number, y: number, target: { x: number; y: number }, damage: number): Spit {
  const pixelsPerTick = (SPITTER.speed * TILE_SIZE) / 20;
  const dx = target.x - x;
  const dy = target.y - y;
  const distance = Math.hypot(dx, dy) || 1;

  return {
    kind: 'spit',
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    facing: 'down',
    moving: true,
    vx: (dx / distance) * pixelsPerTick,
    vy: (dy / distance) * pixelsPerTick,
    ttl: Math.ceil(((SPITTER.range + 1) * TILE_SIZE) / pixelsPerTick),
    damage,
    from,
  };
}

/**
 * Une boule de feu partant de (x, y) vers la cible, à `FIREBALL.speed` : elle
 * vole un peu au-delà de `range` tuiles, puis s'éteint. Pas d'anticipation,
 * pas de vent. L'id est donné par le monde.
 */
export function fireball(
  id: number,
  baseId: number,
  x: number,
  y: number,
  target: { x: number; y: number },
  range: number,
  damage: number,
  buildingDamage: number,
): Fireball {
  const pixelsPerTick = (FIREBALL.speed * TILE_SIZE) / 20;
  const dx = target.x - x;
  const dy = target.y - y;
  const distance = Math.hypot(dx, dy) || 1;

  return {
    kind: 'fireball',
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    facing: 'down',
    moving: true,
    vx: (dx / distance) * pixelsPerTick,
    vy: (dy / distance) * pixelsPerTick,
    ttl: Math.ceil(((range + 2) * TILE_SIZE) / pixelsPerTick),
    damage,
    buildingDamage,
    baseId,
  };
}

/** Ce qu'un crachat a rencontré ce tick : Adam, un mur, ou rien (`null`) ; `ttl` à zéro, il est tombé. */
export type SpitHit = 'player' | 'wall' | null;

/**
 * Un tick de crachat ou de boule de feu : il avance et touche Adam s'il traverse son corps —
 * balayé, comme une flèche —, ou s'écrase sur ce que `wall(x, y)` déclare
 * plein (un bâtiment, une base). Arbres et rochers, il passe par-dessus.
 */
export function stepSpit(spit: Spit | Fireball, player: { x: number; y: number }, wall: (x: number, y: number) => boolean): SpitHit {
  spit.prevX = spit.x;
  spit.prevY = spit.y;
  spit.ttl -= 1;

  const samples = Math.max(1, Math.ceil(Math.hypot(spit.vx, spit.vy) / SWEEP_STEP));

  for (let i = 1; i <= samples; i += 1) {
    const x = spit.prevX + (spit.vx * i) / samples;
    const y = spit.prevY + (spit.vy * i) / samples;

    spit.x = x;
    spit.y = y;
    // Le corps d'Adam : sa boîte de pieds, et deux fois plus haut — comme un ennemi pour une flèche.
    if (Math.abs(x - player.x) <= PLAYER_HALF_W && y >= player.y - PLAYER_HALF_H * 3 && y <= player.y + PLAYER_HALF_H) return 'player';
    if (wall(x, y)) return 'wall';
  }
  return null;
}
