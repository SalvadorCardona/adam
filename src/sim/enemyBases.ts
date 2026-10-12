/**
 * Les bases mutantes : où elles se posent, ce qu'elles tiennent.
 *
 * Fonctions pures : la place des bases se tire de la seed et de la mairie,
 * sans PRNG du monde — une nouvelle partie et une ancienne sauvegarde qui
 * les découvre au chargement les posent au même endroit. Le monde garde la
 * liste (`World.enemyBases`) et leurs points de vie.
 *
 * Chaque anneau (`ENEMY_BASE_RINGS`) répartit ses bases à pas régulier tout
 * autour de la mairie, décalé d'un angle tiré de la seed. Une base se pose
 * au plus près de sa place idéale, sur une emprise libre (`free` : terrain
 * constructible, ni arbre ni rocher) ; sans place à `ENEMY_BASE.search`
 * tuiles, elle n'est pas posée — l'anneau a un trou, au bord d'un lac.
 *
 * Le jour, une base debout produit (`breed`) : ses assaillants, à la cadence
 * de son niveau et de la nuit qui vient, jusqu'à sa capacité ; ses gardiens
 * et ses cracheurs tombés, plus lentement. Son chef ne revient pas : c'est
 * lui qui tient le bouclier (`isShielded`), et l'abattre doit ouvrir la base
 * pour de bon — un chef qui renaîtrait referait le bouclier d'une base
 * qu'Adam est en train d'user. Son compte de départ est tiré de la seed, pour que
 * les bases d'un anneau ne remplissent pas leur badge au même instant.
 */

import { TILE_SIZE, distanceSq } from '../core/grid.ts';
import { hash3 } from '../core/rng.ts';
import { ENEMY_BASE, ENEMY_BASE_RINGS, RAIDS, enemyBaseLevel } from '../data/enemyBases.ts';
import type { EnemyBase } from './types.ts';

/** Sel du décalage angulaire des anneaux. */
const RING_SALT = 0x6b43a9b5;
/** Sel du compte de départ d'une base. */
const BROOD_SALT = 0x2c1b3c6d;

/**
 * Les bases de tous les anneaux, autour de `hall` (centre de la mairie, en
 * tuiles). `free(tx, ty)` : la tuile peut-elle porter une base ?
 */
export function placeEnemyBases(seed: number, hall: { x: number; y: number }, free: (tx: number, ty: number) => boolean): EnemyBase[] {
  const bases: EnemyBase[] = [];

  ENEMY_BASE_RINGS.forEach((ring, index) => {
    const offset = ((hash3(seed ^ RING_SALT, index, 0) % 3600) / 3600) * ((Math.PI * 2) / ring.count);

    for (let i = 0; i < ring.count; i += 1) {
      const angle = offset + (i / ring.count) * Math.PI * 2;
      const spot = nearestSpot(hall.x + Math.cos(angle) * ring.radius, hall.y + Math.sin(angle) * ring.radius, free);

      if (!spot) continue;

      const id = bases.length + 1;
      const level = enemyBaseLevel(ring.level);

      bases.push({
        id,
        ...spot,
        level: ring.level,
        hp: level.hp,
        raiders: 0,
        brood: firstBrood(seed, id, ring.level),
        guards: level.guards.count,
        spitters: level.guards.spitters,
        mend: 0,
        chief: level.chief.hp,
        fire: level.fire.cooldownTicks,
      });
    }
  });
  return bases;
}

/** L'emprise libre la plus proche de (cx, cy) — son centre idéal, en tuiles —, ou `null`. */
function nearestSpot(cx: number, cy: number, free: (tx: number, ty: number) => boolean): { tx: number; ty: number } | null {
  const { width, height, search } = ENEMY_BASE;
  const ox = Math.round(cx - width / 2);
  const oy = Math.round(cy - height / 2);
  let best: { tx: number; ty: number } | null = null;
  let bestD = Infinity;

  for (let dy = -search; dy <= search; dy += 1) {
    for (let dx = -search; dx <= search; dx += 1) {
      const d = dx * dx + dy * dy;

      if (d >= bestD || d > search * search) continue;
      if (!footprintFree(ox + dx, oy + dy, free)) continue;
      best = { tx: ox + dx, ty: oy + dy };
      bestD = d;
    }
  }
  return best;
}

function footprintFree(tx: number, ty: number, free: (tx: number, ty: number) => boolean): boolean {
  for (let y = ty; y < ty + ENEMY_BASE.height; y += 1) {
    for (let x = tx; x < tx + ENEMY_BASE.width; x += 1) {
      if (!free(x, y)) return false;
    }
  }
  return true;
}

/** La base est-elle encore debout ? */
export function isStanding(base: EnemyBase): boolean {
  return base.hp > 0;
}

/** Centre de l'emprise, en pixels monde. */
export function baseCenter(base: EnemyBase): { x: number; y: number } {
  return { x: (base.tx + ENEMY_BASE.width / 2) * TILE_SIZE, y: (base.ty + ENEMY_BASE.height / 2) * TILE_SIZE };
}

/** La tuile est-elle dans la zone que tient la base — morte ou vive ? */
export function inBaseZone(base: EnemyBase, tx: number, ty: number): boolean {
  const { x, y } = baseCenter(base);
  const reach = enemyBaseLevel(base.level).zoneRadius * TILE_SIZE;

  return distanceSq(x, y, (tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE) <= reach * reach;
}

/** La tuile est-elle sous l'emprise de la base ? */
export function onBase(base: EnemyBase, tx: number, ty: number): boolean {
  return tx >= base.tx && tx < base.tx + ENEMY_BASE.width && ty >= base.ty && ty < base.ty + ENEMY_BASE.height;
}

/**
 * Le point (x, y) frappe-t-il la base ? Son emprise, et le campement qui
 * monte au-dessus — une flèche vise son centre, elle passe par le haut.
 */
export function hitsBase(base: EnemyBase, x: number, y: number): boolean {
  const left = base.tx * TILE_SIZE;
  const top = (base.ty - 1) * TILE_SIZE;

  return x >= left && x < left + ENEMY_BASE.width * TILE_SIZE && y >= top && y < (base.ty + ENEMY_BASE.height) * TILE_SIZE;
}

/** L'arc entame-t-il cette base ? Il faut un équipement de son niveau, au moins. */
export function canDamage(base: EnemyBase, gear: number): boolean {
  return gear >= base.level;
}

/** La base est-elle sous le bouclier de son chef ? Tant qu'il vit, aucune flèche ne l'entame. */
export function isShielded(base: EnemyBase): boolean {
  return base.chief > 0;
}

/**
 * Le compte de départ d'une base, tiré de la seed et de son id : déjà
 * entamé, pour que les bases d'un anneau ne produisent pas toutes au même
 * tick. Une ancienne sauvegarde qui découvre ses bases au chargement les
 * reçoit pareil.
 */
export function firstBrood(seed: number, id: number, level: number): number {
  return hash3(seed ^ BROOD_SALT, id, 0) % enemyBaseLevel(level).raid.ticksPerRaider;
}

/** Ticks de jour qu'il faut à une base de ce niveau pour produire un assaillant, la veille de la nuit `night`. */
export function raidTicks(level: number, night: number): number {
  const { raid } = enemyBaseLevel(level);

  return Math.max(1, Math.round(raid.ticksPerRaider / (1 + RAIDS.paceGrowth * Math.max(0, night - raid.from))));
}

/** Assaillants qu'une base de ce niveau garde au plus, la veille de la nuit `night` ; 0 avant sa première nuit. */
export function raidCapacity(level: number, night: number): number {
  const { raid } = enemyBaseLevel(level);

  if (night < raid.from) return 0;
  return Math.min(RAIDS.capacityMax, raid.capacity + Math.floor((night - raid.from) / RAIDS.capacityEvery));
}

/** Ce qu'une base a produit ce tick. */
export interface Brood {
  raider: boolean;
  /** Un gardien ou un cracheur refait. */
  guard: boolean;
}

/**
 * Un tick de jour d'une base, la veille de la nuit `night` : son compte
 * avance vers le prochain assaillant tant qu'elle n'est pas pleine, et vers
 * le prochain gardien tant qu'il lui en manque. Abattue, elle ne fait rien.
 * `raiding` à faux : la réserve commune est au plafond (`earlyCap`), elle ne
 * produit pas d'assaillant.
 */
export function breed(base: EnemyBase, night: number, raiding = true): Brood {
  const brood = { raider: false, guard: false };

  if (!isStanding(base)) return brood;

  if (raiding && base.raiders < raidCapacity(base.level, night)) {
    base.brood += 1;

    const ticks = raidTicks(base.level, night);

    if (base.brood >= ticks) {
      base.brood -= ticks;
      base.raiders += 1;
      brood.raider = true;
    }
  }

  const { guards } = enemyBaseLevel(base.level);

  // Les gardiens d'abord, puis les cracheurs ; le chef, jamais.
  if (base.guards < guards.count || base.spitters < guards.spitters) {
    base.mend += 1;
    if (base.mend >= guards.respawnTicks) {
      base.mend = 0;
      if (base.guards < guards.count) base.guards += 1;
      else base.spitters += 1;
      brood.guard = true;
    }
  }
  return brood;
}

/**
 * La porte de la base, en pixels monde : le milieu du bas de son emprise,
 * une demi-tuile devant. C'est là qu'apparaissent ses assaillants, le
 * `slot`-ième un peu à côté des autres pour qu'ils ne sortent pas empilés.
 */
export function baseDoor(base: EnemyBase, slot = 0): { x: number; y: number } {
  const shift = slot === 0 ? 0 : (slot % 2 === 1 ? 1 : -1) * Math.ceil(slot / 2) * 0.35;

  return {
    x: (base.tx + ENEMY_BASE.width / 2 + Math.max(-1.2, Math.min(1.2, shift))) * TILE_SIZE,
    y: (base.ty + ENEMY_BASE.height + 0.5) * TILE_SIZE,
  };
}
