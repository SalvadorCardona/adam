/**
 * La prairie : ce que le bake du sol pose sur l'herbe, au lieu d'un damier.
 *
 * Rien ici n'est de l'état. Les taches et les semis se tirent de la seed —
 * à graine égale, même prairie — et les chemins de terre battue se lisent
 * dans la ville (`trailsOf`) : ce sont les allées que les habitants ont
 * tracées entre la mairie et chaque bâtiment fini. Fonctions pures, sans
 * Pixi : `chunkLayer.ts` les bake, les tests les lisent.
 *
 * - **Taches** (`patchesIn`) : une par cellule de `PATCH_CELL` tuiles, ou
 *   aucune, plus claire ou plus dense, d'une des silhouettes de
 *   `art/terrain.ts`, à une échelle et une place tirées de la seed. Elles
 *   débordent d'une cellule, jamais de l'herbe : une tache qui toucherait le
 *   sable, l'eau ou la roche n'est pas posée — les coins arrondis de ces sols
 *   sont peints dans la base de l'herbe, une tache dessous ferait une encoche.
 * - **Semis** (`sprinkleAt`) : un brin ou une fleurette sur une tuile d'herbe
 *   sur huit environ, à une place tirée dans la tuile, pas au milieu : l'œil
 *   ne retrouve pas la grille.
 * - **Chemins** (`trailsOf`, `trailPoints`) : une courbe douce de la porte
 *   de la mairie à celle du bâtiment, bombée d'un côté tiré de sa place ;
 *   elle passe sur l'herbe, le sable et la roche, pas sur l'eau.
 */

import { TILE_SIZE } from '../core/grid.ts';
import { hash3 } from '../core/rng.ts';
import { PATCH_SHAPE_COUNT, PATCH_SIZE, PATCH_TONES, type MeadowSprinkle, type PatchTone } from '../art/terrain.ts';
import { doorOf } from '../sim/jobs.ts';
import { terrainAt } from '../sim/terrain.ts';
import type { Entity } from '../sim/types.ts';

/** Côté d'une cellule de taches, en tuiles : une tache au plus par cellule. */
export const PATCH_CELL = 7;

/** Part des cellules qui portent une tache, sur 100. */
const PATCH_CHANCE = 62;

/** Échelle d'une tache : de `min` à `min + spread`. */
const PATCH_SCALE = { min: 0.7, spread: 0.8 } as const;

/** Les ellipses d'une tache n'atteignent pas le bord de son cadre : la part de marge, de chaque côté. */
const PATCH_INSET = 0.1;

export interface Patch {
  /** Coin haut-gauche du cadre, en pixels monde, déjà mis à l'échelle. */
  x: number;
  y: number;
  scale: number;
  /** Retournée de gauche à droite. */
  flip: boolean;
  tone: PatchTone;
  shape: number;
}

/** Une tache par cellule au plus, décidée une fois : le bake d'un bloc relit celles de ses voisins. */
const patchCache = new Map<string, Patch | null>();
const PATCH_CACHE_LIMIT = 4096;

/** La tache de la cellule (cx, cy), ou `null`. */
export function patchOf(seed: number, cx: number, cy: number): Patch | null {
  const key = `${seed}:${cx}:${cy}`;
  const cached = patchCache.get(key);

  if (cached !== undefined) return cached;
  if (patchCache.size >= PATCH_CACHE_LIMIT) patchCache.clear();

  const patch = drawPatch(seed, cx, cy);

  patchCache.set(key, patch);
  return patch;
}

function drawPatch(seed: number, cx: number, cy: number): Patch | null {
  const h = hash3(seed ^ 0x3c6ef372, cx, cy);

  if (h % 100 >= PATCH_CHANCE) return null;

  const scale = PATCH_SCALE.min + (((h >>> 8) & 15) / 15) * PATCH_SCALE.spread;
  const width = PATCH_SIZE.width * scale;
  const height = PATCH_SIZE.height * scale;
  const cell = PATCH_CELL * TILE_SIZE;
  // Le centre tombe n'importe où dans la cellule.
  const centreX = cx * cell + (((h >>> 12) & 255) / 255) * cell;
  const centreY = cy * cell + (((h >>> 20) & 255) / 255) * cell;
  const x = centreX - width / 2;
  const y = centreY - height / 2;

  if (!allGrass(seed, x + width * PATCH_INSET, y + height * PATCH_INSET, x + width * (1 - PATCH_INSET), y + height * (1 - PATCH_INSET))) {
    return null;
  }

  return {
    x,
    y,
    scale,
    flip: ((h >>> 28) & 1) === 1,
    tone: PATCH_TONES[(h >>> 29) & 1]!,
    shape: hash3(h, cx, cy) % PATCH_SHAPE_COUNT,
  };
}

/** Toutes les tuiles sous ce rectangle (pixels monde) sont-elles de l'herbe ? */
function allGrass(seed: number, left: number, top: number, right: number, bottom: number): boolean {
  for (let ty = Math.floor(top / TILE_SIZE); ty <= Math.floor(bottom / TILE_SIZE); ty += 1) {
    for (let tx = Math.floor(left / TILE_SIZE); tx <= Math.floor(right / TILE_SIZE); tx += 1) {
      if (terrainAt(seed, tx, ty) !== 'grass') return false;
    }
  }
  return true;
}

/** Les taches dont le cadre touche ce rectangle (pixels monde), les denses d'abord : les claires se posent dessus. */
export function patchesIn(seed: number, left: number, top: number, right: number, bottom: number): Patch[] {
  const cell = PATCH_CELL * TILE_SIZE;
  // Une tache déborde de sa cellule d'au plus la moitié de son plus grand cadre.
  const reach = (PATCH_SIZE.width * (PATCH_SCALE.min + PATCH_SCALE.spread)) / 2;
  const patches: Patch[] = [];

  for (let cy = Math.floor((top - reach) / cell); cy <= Math.floor((bottom + reach) / cell); cy += 1) {
    for (let cx = Math.floor((left - reach) / cell); cx <= Math.floor((right + reach) / cell); cx += 1) {
      const patch = patchOf(seed, cx, cy);

      if (!patch) continue;

      const width = PATCH_SIZE.width * patch.scale;
      const height = PATCH_SIZE.height * patch.scale;

      if (patch.x + width < left || patch.x > right || patch.y + height < top || patch.y > bottom) continue;
      patches.push(patch);
    }
  }
  return patches.sort((a, b) => Number(a.tone === 'meadow') - Number(b.tone === 'meadow'));
}

/** Part des tuiles d'herbe qui portent un semis, sur 100 : des brins, puis des fleurettes. */
const SPRIG_CHANCE = 10;
const SPECK_CHANCE = 3;

export interface Sprinkle {
  name: MeadowSprinkle;
  /** Décalage du cadre (14 × 12) dans la tuile, en pixels. */
  dx: number;
  dy: number;
}

/** Le semis de la tuile (tx, ty), si c'est de l'herbe qui en porte un. */
export function sprinkleAt(seed: number, tx: number, ty: number): Sprinkle | null {
  const h = hash3(seed ^ 0x510e527f, tx, ty);
  const roll = h % 100;

  if (roll >= SPRIG_CHANCE + SPECK_CHANCE) return null;

  const name: MeadowSprinkle =
    roll < SPRIG_CHANCE ? (((h >>> 7) & 1) === 0 ? 'sprig.0' : 'sprig.1') : ((h >>> 7) & 1) === 0 ? 'speck.0' : 'speck.1';

  return { name, dx: 1 + ((h >>> 8) % 17), dy: 2 + ((h >>> 14) % 18) };
}

/* ---------------------------------------------------------------- chemins */

/** Au-delà de cette distance de la mairie, en tuiles, un bâtiment n'a pas de chemin : on y va rarement. */
export const TRAIL_MAX_TILES = 40;

/** Une allée de terre battue : une courbe du second degré, en pixels monde. */
export interface Trail {
  /** Ce qui la décide : la mairie et le bâtiment, à leur place. Deux chemins de même clé sont le même. */
  key: string;
  from: { x: number; y: number };
  control: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * Les chemins de la ville : de la porte de la mairie bâtie à celle de chaque
 * bâtiment fini à moins de `TRAIL_MAX_TILES`. Pas de mairie, pas de chemin.
 */
export function trailsOf(seed: number, hall: Entity | undefined, entities: Iterable<Entity>): Trail[] {
  if (!hall || hall.kind !== 'townHall') return [];

  const from = doorOf(hall);
  const trails: Trail[] = [];

  for (const entity of entities) {
    if (entity.kind === 'site' || entity.id === hall.id) continue;

    const to = doorOf(entity);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);

    if (length < TILE_SIZE * 2 || length > TRAIL_MAX_TILES * TILE_SIZE) continue;

    // Bombée d'un côté ou de l'autre, d'un quart de sa longueur au plus : une allée, pas une règle.
    const bend = ((hash3(seed ^ 0x1f83d9ab, entity.tx, entity.ty) % 1000) / 1000 - 0.5) * 0.45;

    trails.push({
      key: `${hall.tx},${hall.ty}>${entity.tx},${entity.ty},${entity.width},${entity.height}`,
      from,
      control: { x: from.x + dx / 2 - dy * bend, y: from.y + dy / 2 + dx * bend },
      to,
    });
  }
  return trails;
}

/** Les points de la courbe, tous les `step` pixels environ, bouts compris. */
export function trailPoints(trail: Trail, step: number): { x: number; y: number }[] {
  const { from, control, to } = trail;
  // La corde et les deux bras encadrent la longueur : leur moyenne suffit à espacer les points.
  const length = (Math.hypot(to.x - from.x, to.y - from.y) + Math.hypot(control.x - from.x, control.y - from.y) + Math.hypot(to.x - control.x, to.y - control.y)) / 2;
  const count = Math.max(1, Math.ceil(length / step));
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const u = 1 - t;

    points.push({
      x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
    });
  }
  return points;
}

/** Le rectangle (pixels monde) que couvre un chemin, sa largeur comprise. */
export function trailBounds(trail: Trail, margin: number): { left: number; top: number; right: number; bottom: number } {
  const xs = [trail.from.x, trail.control.x, trail.to.x];
  const ys = [trail.from.y, trail.control.y, trail.to.y];

  return {
    left: Math.min(...xs) - margin,
    top: Math.min(...ys) - margin,
    right: Math.max(...xs) + margin,
    bottom: Math.max(...ys) + margin,
  };
}
