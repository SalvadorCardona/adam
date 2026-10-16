/**
 * Où trouver une ressource : le gisement le plus proche d'un point.
 *
 * Le conseil dit « approchez-vous d'un rocher rose » ; encore faut-il savoir où
 * il y en a. Cette requête le lit dans la seed, comme la carte, en tenant
 * compte de ce qu'Adam a déjà vidé.
 *
 * Deux réponses à la fois : le plus proche parmi ce que le joueur a déjà vu
 * (`known`, fourni par la vue — la simulation ne sait pas ce qui est à
 * l'écran), et à défaut le plus proche tout court, que le repère montre
 * alors comme une piste, avec un « ? ».
 *
 * Lecture seule, pure, sans état : ce n'est pas une règle de jeu, c'est une
 * question posée au monde.
 */

import { TILE_SIZE, floorDiv } from '../core/grid.ts';
import type { ItemId } from '../data/items.ts';
import { RESOURCE_IDS, RESOURCES, ROCK_OF_ORE, type ResourceId } from '../data/resources.ts';
import { oreNodesNear, terrainAt } from './terrain.ts';
import type { World } from './world.ts';

/** Cellules de gisement fouillées autour d'Adam (20 tuiles chacune) : une centaine de tuiles. */
const ORE_RANGE = 4;

/** Rayon de fouille des forêts, en tuiles : les massifs sont nombreux, on n'a jamais à chercher loin. */
const FOREST_RANGE = 48;

export interface Deposit {
  /** Tuile de la ressource visée. */
  tx: number;
  ty: number;
  /** Le joueur l'a-t-il déjà vue ? Sinon, c'est une piste. */
  known: boolean;
}

/**
 * La tuile porteuse de `item` la plus proche de (x, y) en pixels monde :
 * la plus proche déjà vue si `known` en connaît une, sinon la plus proche
 * tout court, sinon `null` (rien dans le rayon, ou objet sans gisement).
 */
export function findDeposit(
  world: World,
  item: ItemId,
  x: number,
  y: number,
  known: (tx: number, ty: number) => boolean,
): Deposit | null {
  const tx = floorDiv(x, TILE_SIZE);
  const ty = floorDiv(y, TILE_SIZE);
  const rock = ROCK_OF_ORE[item];

  if (rock) return nearestRock(world, rock, item, tx, ty, known);
  // L'eau ne se récolte pas : la rive la plus proche, où poser un puits.
  if (item === 'water') return nearestWater(world.seed, tx, ty, known);

  const ids = RESOURCE_IDS.filter((id) => RESOURCES[id].item === item);

  return ids.length > 0 ? nearestTile(world, ids, tx, ty, known) : null;
}

/** Les rochers ne poussent que sur les filons : on parcourt les gisements, pas les tuiles. */
function nearestRock(
  world: World,
  rock: ResourceId,
  item: ItemId,
  tx: number,
  ty: number,
  known: (tx: number, ty: number) => boolean,
): Deposit | null {
  const best = new Nearest(tx, ty);

  for (const node of oreNodesNear(world.seed, tx, ty, ORE_RANGE)) {
    if (node.item !== item) continue;

    for (let y = node.ty - node.radius; y <= node.ty + node.radius; y += 1) {
      for (let x = node.tx - node.radius; x <= node.tx + node.radius; x += 1) {
        if (world.resources.at(x, y)?.id === rock) best.offer(x, y, known(x, y));
      }
    }
  }
  return best.result();
}

/**
 * Les arbres sont partout où la forêt pousse : des anneaux autour d'Adam,
 * du plus proche au plus loin. On s'arrête dès qu'aucun anneau ne peut plus
 * battre la meilleure tuile déjà vue.
 */
function nearestTile(
  world: World,
  ids: readonly ResourceId[],
  tx: number,
  ty: number,
  known: (tx: number, ty: number) => boolean,
): Deposit | null {
  return nearestTerrain(tx, ty, known, (x, y) => {
    const id = world.resources.at(x, y)?.id;

    return id !== undefined && ids.includes(id);
  });
}

/**
 * L'eau ne bouge jamais : la plus proche se garde par seed et par bloc de
 * 4 × 4 tuiles autour d'Adam, et seul « déjà vue ? » se relit à chaque fois.
 */
const WATER_CACHE = new Map<string, { tx: number; ty: number } | null>();
const WATER_CACHE_MAX = 256;

function nearestWater(seed: number, tx: number, ty: number, known: (tx: number, ty: number) => boolean): Deposit | null {
  const key = `${seed}:${tx >> 2}:${ty >> 2}`;
  let tile = WATER_CACHE.get(key);

  if (tile === undefined) {
    const found = nearestTerrain(tx, ty, () => false, (x, y) => terrainAt(seed, x, y) === 'water');

    tile = found && { tx: found.tx, ty: found.ty };
    if (WATER_CACHE.size >= WATER_CACHE_MAX) WATER_CACHE.clear();
    WATER_CACHE.set(key, tile);
  }
  return tile && { ...tile, known: known(tile.tx, tile.ty) };
}

/** La tuile la plus proche qui satisfait `matches`, en anneaux, dans le rayon des forêts. */
function nearestTerrain(
  tx: number,
  ty: number,
  known: (tx: number, ty: number) => boolean,
  matches: (x: number, y: number) => boolean,
): Deposit | null {
  const best = new Nearest(tx, ty);

  for (let ring = 0; ring <= FOREST_RANGE; ring += 1) {
    if (best.knownDistanceSq < ring * ring) break;

    for (let d = -ring; d <= ring; d += 1) {
      const edge: [number, number][] =
        ring === 0
          ? [[tx, ty]]
          : [
              [tx + d, ty - ring],
              [tx + d, ty + ring],
              ...(Math.abs(d) < ring ? ([[tx - ring, ty + d], [tx + ring, ty + d]] as [number, number][]) : []),
            ];

      for (const [x, y] of edge) {
        if (matches(x, y)) best.offer(x, y, known(x, y));
      }
    }
  }
  return best.result();
}

/** Garde la tuile la plus proche, vue ou non, et la plus proche parmi les vues. */
class Nearest {
  public knownDistanceSq = Infinity;

  private known: Deposit | null = null;
  private any: Deposit | null = null;
  private anyDistanceSq = Infinity;

  private readonly tx: number;
  private readonly ty: number;

  public constructor(tx: number, ty: number) {
    this.tx = tx;
    this.ty = ty;
  }

  public offer(x: number, y: number, known: boolean): void {
    const distanceSq = (x - this.tx) ** 2 + (y - this.ty) ** 2;

    if (known && distanceSq < this.knownDistanceSq) {
      this.knownDistanceSq = distanceSq;
      this.known = { tx: x, ty: y, known: true };
    }
    if (distanceSq < this.anyDistanceSq) {
      this.anyDistanceSq = distanceSq;
      this.any = { tx: x, ty: y, known: false };
    }
  }

  public result(): Deposit | null {
    return this.known ?? this.any;
  }
}
