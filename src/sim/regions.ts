/**
 * Les régions de la carte : où passent leurs bords, quel biome elles
 * prennent, où veille leur gardien.
 *
 * Fonctions pures : tout se tire de la seed (le centre de la mairie vient de
 * `findSpawn`), sans PRNG du monde — une nouvelle partie et une ancienne
 * sauvegarde ont les mêmes régions. Le monde ne garde que celles qui sont
 * conquises et la vie des gardiens blessés (`World.conquered`).
 *
 * La prairie de départ est un disque ; au-delà, chaque anneau
 * (`REGION_RINGS`) se partage en secteurs de même angle, décalés d'un angle
 * tiré de la seed. Un bruit lent tord la distance et l'angle de chaque
 * tuile : les bords ondulent, sans jamais laisser une tuile à deux régions.
 */

import { hash3 } from '../core/rng.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { CONQUEST_BIOMES, HOME_REGION, REGION_RINGS, REGION_SHAPE, type BiomeId } from '../data/regions.ts';
import { contaminationAt } from './contamination.ts';
import { findSpawn, habitatAt, isWalkable, oreAt, resourceAt, smoothNoise, terrainAt } from './terrain.ts';

/** Id de la prairie de départ ; les autres suivent, anneau par anneau, secteur par secteur. */
export const HOME_REGION_ID = 0;

export interface Region {
  id: number;
  /** Indice dans `REGION_RINGS`, ou -1 pour la prairie de départ. */
  ring: number;
  biome: BiomeId;
  /** La tuile du repaire de son gardien, ou `null` (la prairie, ou une région sans place pour lui). */
  lair: { tx: number; ty: number } | null;
}

const ANGLE_SALT = 0x1f83d9ab;
const WARP_ANGLE_SALT = 0x5be0cd19;
const WARP_RADIUS_SALT = 0x510e527f;

interface Geometry {
  /** Centre de la mairie, en tuiles. */
  hx: number;
  hy: number;
  /** Décalage angulaire de chaque anneau, en radians. */
  offsets: number[];
  /** Id de la première région de chaque anneau. */
  firstIds: number[];
}

const GEOMETRIES = new Map<number, Geometry>();

function geometryOf(seed: number): Geometry {
  let geometry = GEOMETRIES.get(seed);

  if (!geometry) {
    const [sx, sy] = findSpawn(seed);
    const firstIds: number[] = [];
    let next = HOME_REGION_ID + 1;

    for (const ring of REGION_RINGS) {
      firstIds.push(next);
      next += ring.sectors;
    }
    geometry = {
      hx: sx + 0.5,
      hy: sy - BUILDINGS.townHall.height / 2,
      offsets: REGION_RINGS.map((ring, index) => ((hash3(seed ^ ANGLE_SALT, index, 0) % 3600) / 3600) * ((Math.PI * 2) / ring.sectors)),
      firstIds,
    };
    GEOMETRIES.set(seed, geometry);
  }
  return geometry;
}

/** Le nombre de régions de la carte, prairie comprise : la liste est finie, le dernier anneau ne s'arrête pas. */
export const REGION_COUNT = 1 + REGION_RINGS.reduce((sum, ring) => sum + ring.sectors, 0);

/** Le centre de la mairie, en tuiles : celui des anneaux. */
export function regionCenter(seed: number): { x: number; y: number } {
  const { hx, hy } = geometryOf(seed);

  return { x: hx, y: hy };
}

/** La région de la tuile. */
export function regionAt(seed: number, tx: number, ty: number): number {
  const { hx, hy, offsets, firstIds } = geometryOf(seed);
  const dx = tx + 0.5 - hx;
  const dy = ty + 0.5 - hy;
  const warpR = (smoothNoise(seed ^ WARP_RADIUS_SALT, tx, ty, REGION_SHAPE.warpCell) - 0.5) * 2 * REGION_SHAPE.radiusWarp;
  const distance = Math.hypot(dx, dy) + warpR;

  if (distance < HOME_REGION.radius) return HOME_REGION_ID;

  let ring = REGION_RINGS.findIndex((band) => distance < band.outer);

  if (ring < 0) ring = REGION_RINGS.length - 1;

  const { sectors } = REGION_RINGS[ring]!;
  const warpA = (smoothNoise(seed ^ WARP_ANGLE_SALT, tx, ty, REGION_SHAPE.warpCell) - 0.5) * 2 * REGION_SHAPE.angleWarp;
  const angle = Math.atan2(dy, dx) + warpA - offsets[ring]!;
  const sector = ((Math.floor(angle / ((Math.PI * 2) / sectors)) % sectors) + sectors) % sectors;

  return firstIds[ring]! + sector;
}

/** L'anneau d'une région (indice dans `REGION_RINGS`), ou -1 pour la prairie. */
export function ringOf(id: number): number {
  let first = HOME_REGION_ID + 1;

  if (id < first) return -1;
  for (const [index, ring] of REGION_RINGS.entries()) {
    if (id < first + ring.sectors) return index;
    first += ring.sectors;
  }
  return -1;
}

const BIOMES_CACHE = new Map<number, BiomeId[]>();

/**
 * Le biome de chaque région, indexé par id. Un échantillon de tuiles, tous
 * les `REGION_SHAPE.sampleStep`, jusqu'au bord du dernier anneau : la part de
 * chaque biome dans la région, rapportée à sa part moyenne. Le plus marqué
 * l'emporte ; sans rien de marqué, la forêt.
 */
export function regionBiomes(seed: number): readonly BiomeId[] {
  let biomes = BIOMES_CACHE.get(seed);

  if (biomes) return biomes;

  const { hx, hy } = geometryOf(seed);
  const reach = REGION_RINGS[REGION_RINGS.length - 1]!.outer;
  const step = REGION_SHAPE.sampleStep;
  const counts = Array.from({ length: REGION_COUNT }, () => ({ total: 0, forest: 0, coast: 0, mountain: 0, wasteland: 0 }));

  for (let y = Math.floor(hy - reach); y <= hy + reach; y += step) {
    for (let x = Math.floor(hx - reach); x <= hx + reach; x += step) {
      if ((x + 0.5 - hx) ** 2 + (y + 0.5 - hy) ** 2 > reach * reach) continue;

      const id = regionAt(seed, x, y);

      if (id === HOME_REGION_ID) continue;

      const count = counts[id]!;
      const terrain = terrainAt(seed, x, y);

      count.total += 1;
      if (terrain === 'water' || terrain === 'sand') count.coast += 1;
      else if (terrain === 'rock' || oreAt(seed, x, y)) count.mountain += 1;
      else if (contaminationAt(seed, x, y)) count.wasteland += 1;
      else if (habitatAt(seed, x, y) === 'forest') count.forest += 1;
    }
  }

  const share = (id: number, biome: (typeof CONQUEST_BIOMES)[number]): number => {
    const count = counts[id]!;

    return count.total > 0 ? count[biome] / count.total : 0;
  };
  const average = Object.fromEntries(
    CONQUEST_BIOMES.map((biome) => {
      let sum = 0;

      for (let id = HOME_REGION_ID + 1; id < REGION_COUNT; id += 1) sum += share(id, biome);
      return [biome, sum / (REGION_COUNT - 1)];
    }),
  ) as Record<(typeof CONQUEST_BIOMES)[number], number>;

  biomes = [HOME_REGION.biome];
  for (let id = HOME_REGION_ID + 1; id < REGION_COUNT; id += 1) {
    let best: BiomeId = 'forest';
    let bestScore = 0;

    for (const biome of CONQUEST_BIOMES) {
      const score = average[biome] > 0 ? share(id, biome) / average[biome] : 0;

      if (score > bestScore) {
        best = biome;
        bestScore = score;
      }
    }
    biomes.push(best);
  }
  BIOMES_CACHE.set(seed, biomes);
  return biomes;
}

/**
 * Les régions de la carte, prairie comprise, avec le repaire de chaque
 * gardien : la tuile la plus proche de sa place idéale — au milieu de son
 * secteur, à `lair` tuiles de la mairie — qui est dans la région, à pied, nue
 * de toute ressource, et que `free` accepte (le monde y refuse les bases
 * mutantes et leur zone).
 */
export function placeRegions(seed: number, free: (tx: number, ty: number) => boolean): Region[] {
  const { hx, hy, offsets } = geometryOf(seed);
  const biomes = regionBiomes(seed);
  const regions: Region[] = [{ id: HOME_REGION_ID, ring: -1, biome: biomes[HOME_REGION_ID]!, lair: null }];
  let id = HOME_REGION_ID + 1;

  REGION_RINGS.forEach((ring, index) => {
    for (let sector = 0; sector < ring.sectors; sector += 1) {
      const angle = offsets[index]! + ((sector + 0.5) / ring.sectors) * Math.PI * 2;
      const cx = Math.round(hx + Math.cos(angle) * ring.lair);
      const cy = Math.round(hy + Math.sin(angle) * ring.lair);
      const lair = nearestLair(seed, id, cx, cy, free);

      regions.push({ id, ring: index, biome: biomes[id]!, lair });
      id += 1;
    }
  });
  return regions;
}

/** Les écarts du disque de recherche du repaire, du plus proche au plus loin : la première tuile qui convient est la bonne. */
const LAIR_OFFSETS: readonly (readonly [number, number])[] = (() => {
  const search = REGION_SHAPE.lairSearch;
  const offsets: [number, number][] = [];

  for (let dy = -search; dy <= search; dy += 1) {
    for (let dx = -search; dx <= search; dx += 1) {
      if (dx * dx + dy * dy <= search * search) offsets.push([dx, dy]);
    }
  }
  return offsets.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
})();

function nearestLair(seed: number, id: number, cx: number, cy: number, free: (tx: number, ty: number) => boolean): { tx: number; ty: number } | null {
  for (const [dx, dy] of LAIR_OFFSETS) {
    const tx = cx + dx;
    const ty = cy + dy;

    if (regionAt(seed, tx, ty) !== id) continue;
    if (!isWalkable(terrainAt(seed, tx, ty)) || resourceAt(seed, tx, ty) !== null) continue;
    if (free(tx, ty)) return { tx, ty };
  }
  return null;
}
