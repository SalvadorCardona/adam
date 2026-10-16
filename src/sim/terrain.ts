/**
 * Terrain, gisements et ressources de surface — régénérés depuis la seed,
 * jamais stockés.
 *
 * Une partie de 10 h tient dans quelques centaines de Ko parce que la carte
 * n'est pas sauvegardée : seules les modifications du joueur le sont. Un
 * gisement porte un id déterministe calculé sur (cellule, seed) ; une
 * ressource de surface est identifiée par sa tuile, et `sim/resources.ts` ne
 * retient que ce qui en a été arraché.
 *
 * Deux couches, volontairement distinctes :
 * - le **filon** (`oreAt`) : ce qu'une foreuse extrait, inépuisable ;
 * - la **surface** (`resourceAt`) : les rochers posés sur le filon et les
 *   arbres des forêts, qu'Adam récolte en passant à côté, et qui
 *   disparaissent une fois vidés.
 *
 * Tout est pur : mêmes entrées, mêmes sorties, sans état.
 */

import { CHUNK_TILES } from '../core/grid.ts';
import { hash3, noise2 } from '../core/rng.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { DECOR, DECOR_DENSITY, DECOR_IDS, type DecorId, type DecorTerrain } from '../data/decor.ts';
import type { Habitat } from '../data/enemies.ts';
import type { ItemId } from '../data/items.ts';
import { HOME_REGION, REGION_SHAPE } from '../data/regions.ts';
import { RESOURCES, ROCK_OF_ORE, type ResourceId } from '../data/resources.ts';
import { contaminationAt } from './contamination.ts';
import { inBaseZone, placeEnemyBases } from './enemyBases.ts';
import { HOME_REGION_ID, regionAt, regionCenter } from './regions.ts';

export type TerrainKind = 'water' | 'sand' | 'grass' | 'rock';

export interface OreNode {
  /** Id déterministe : identique d'une partie à l'autre pour la même seed. */
  id: number;
  item: ItemId;
  /** Tuile du centre du gisement. */
  tx: number;
  ty: number;
  /** Rayon en tuiles. */
  radius: number;
}

/** Bruit de valeur lissé : lattice de `cell` tuiles, interpolation bilinéaire adoucie. */
export function smoothNoise(seed: number, tx: number, ty: number, cell: number): number {
  const gx = Math.floor(tx / cell);
  const gy = Math.floor(ty / cell);
  const fx = tx / cell - gx;
  const fy = ty / cell - gy;

  // Courbe de Hermite : supprime les cassures visibles aux bords de lattice.
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = noise2(seed, gx, gy);
  const n10 = noise2(seed, gx + 1, gy);
  const n01 = noise2(seed, gx, gy + 1);
  const n11 = noise2(seed, gx + 1, gy + 1);

  const top = n00 + (n10 - n00) * sx;
  const bottom = n01 + (n11 - n01) * sx;

  return top + (bottom - top) * sy;
}

/**
 * Les rivières : le niveau 0,5 d'un bruit lent, tordu par deux bruits plus
 * courts pour qu'il serpente. La courbe est longue ; un gué (un bruit bas, sous
 * `RIVER.fordBelow`) la coupe de loin en loin, pour qu'elle ne referme jamais
 * un quartier de la carte. Elle ne taille pas la roche. Aucune rivière à moins de `RIVER.clearRadius`
 * tuiles de l'origine, où se pose le départ : le foyer, la clairière et les
 * bâtiments d'une ancienne sauvegarde restent où ils sont.
 */
export const RIVER = {
  /** Largeur du lit, en tuiles, au plus. */
  width: 3.5,
  /** Cellule du bruit qui trace la rivière, en tuiles. */
  cell: 44,
  /** Amplitude des méandres, en tuiles. */
  meander: 7,
  /** Cellule du bruit des gués, et seuil sous lequel la rivière s'efface. */
  fordCell: 20,
  fordBelow: 0.45,
  /** Pas de rivière en deçà de ce rayon autour de l'origine ; elle y arrive en dix tuiles. */
  clearRadius: 30,
  rampTiles: 10,
} as const;

/** La tuile est-elle dans le lit d'une rivière ? */
export function inRiver(seed: number, tx: number, ty: number): boolean {
  const distance = Math.hypot(tx, ty);

  if (distance <= RIVER.clearRadius) return false;

  const ford = smoothNoise(seed ^ 0x2545f491, tx, ty, RIVER.fordCell);

  if (ford < RIVER.fordBelow) return false;

  const wx = tx + (smoothNoise(seed ^ 0x6a09e667, tx, ty, 13) - 0.5) * 2 * RIVER.meander;
  const wy = ty + (smoothNoise(seed ^ 0xbb67ae85, tx, ty, 13) - 0.5) * 2 * RIVER.meander;
  const level = smoothNoise(seed ^ 0x3c6ef372, wx, wy, RIVER.cell);
  // Le lit s'amincit aux gués et à l'approche de la zone dégagée.
  const ramp = Math.min(1, (distance - RIVER.clearRadius) / RIVER.rampTiles);
  const bank = Math.min(1, (ford - RIVER.fordBelow) / 0.06);
  const half = (RIVER.width / 2) * ramp * bank * 0.045;

  return Math.abs(level - 0.5) < half;
}

/** Le terrain de la tuile : celui du bruit, plus la mare du foyer quand la prairie n'a pas d'autre rive. */
export function terrainAt(seed: number, tx: number, ty: number): TerrainKind {
  const pond = homePond(seed);

  if (pond && inDisc(tx, ty, pond.tx, pond.ty, HOME_POND.radius)) return 'water';
  return groundAt(seed, tx, ty);
}

/** Le terrain tel que le tire le bruit, sans la mare : celui que juge le foyer en se plaçant. */
function groundAt(seed: number, tx: number, ty: number): TerrainKind {
  const height = 0.65 * smoothNoise(seed, tx, ty, 28) + 0.35 * smoothNoise(seed ^ 0x9e3779b9, tx, ty, 9);

  if (height < 0.3) return 'water';
  if (height < 0.74 && inRiver(seed, tx, ty)) return 'water';
  if (height < 0.36) return 'sand';
  if (height < 0.74) return 'grass';
  return 'rock';
}

/** Une case de l'emprise touche-t-elle l'eau, de côté ? Le bord d'une rivière ou d'un lac. */
export function touchesWater(seed: number, tx: number, ty: number, width: number, height: number): boolean {
  const water = (x: number, y: number): boolean => terrainAt(seed, x, y) === 'water';

  for (let x = tx; x < tx + width; x += 1) if (water(x, ty - 1) || water(x, ty + height)) return true;
  for (let y = ty; y < ty + height; y += 1) if (water(tx - 1, y) || water(tx + width, y)) return true;
  return false;
}

/** Le côté d'une emprise où s'ouvre sa porte. */
export type DoorSide = 'south' | 'east' | 'west' | 'north';

/**
 * La porte d'une emprise (`doorOf`, `sim/jobs.ts`) doit tomber sur une case où
 * l'on marche : le sud d'abord, puis l'est, l'ouest et le nord. `null` si les
 * quatre sont de l'eau. Sert aux bâtiments de rive (`shore`), dont l'eau borde
 * l'emprise.
 */
export function doorSide(seed: number, tx: number, ty: number, width: number, height: number): DoorSide | null {
  const midX = Math.floor(tx + width / 2);
  const midY = Math.floor(ty + height / 2);
  const doors: [DoorSide, number, number][] = [
    ['south', midX, ty + height],
    ['east', tx + width, midY],
    ['west', tx - 1, midY],
    ['north', midX, ty - 1],
  ];

  for (const [side, x, y] of doors) if (isWalkable(terrainAt(seed, x, y))) return side;
  return null;
}

/** L'eau se traverse et se construit dessus : non. Le reste : oui. */
export function isBuildable(kind: TerrainKind): boolean {
  return kind !== 'water';
}

export function isWalkable(kind: TerrainKind): boolean {
  return kind !== 'water';
}

/** Une cellule de gisement fait 20 tuiles ; un patch tient entièrement dans la sienne. */
const ORE_CELL = 20;
const ORE_CHANCE = 0.45;
const ORE_MIN_RADIUS = 2;
const ORE_MAX_RADIUS = 4;

const ORE_TABLE: readonly ItemId[] = ['ironOre', 'ironOre', 'coal', 'stone'];

/** Le gisement de la cellule contenant la tuile, ou `null` si la cellule n'en porte pas. */
function nodeOfCell(seed: number, cellX: number, cellY: number): OreNode | null {
  const roll = hash3(seed ^ 0x5bf03635, cellX, cellY) / 4294967296;

  if (roll > ORE_CHANCE) return null;

  const id = hash3(seed, cellX, cellY);
  const radius = ORE_MIN_RADIUS + (id % (ORE_MAX_RADIUS - ORE_MIN_RADIUS + 1));
  const span = ORE_CELL - 2 * radius;
  const offsetX = radius + (hash3(id, 1, 0) % span);
  const offsetY = radius + (hash3(id, 2, 0) % span);

  return {
    id,
    item: ORE_TABLE[id % ORE_TABLE.length]!,
    tx: cellX * ORE_CELL + offsetX,
    ty: cellY * ORE_CELL + offsetY,
    radius,
  };
}

/** Le gisement présent sur cette tuile, ou `null`. Les filons du foyer passent devant ceux des cellules. */
export function oreAt(seed: number, tx: number, ty: number): OreNode | null {
  if (terrainAt(seed, tx, ty) === 'water') return null;

  for (const node of homeOf(seed).ores) {
    if (inOre(tx, ty, node)) return node;
  }

  const node = nodeOfCell(seed, Math.floor(tx / ORE_CELL), Math.floor(ty / ORE_CELL));

  return node && inOre(tx, ty, node) ? node : null;
}

/**
 * La tuile est-elle sur ce filon ? Un disque arrondi (`r² + r`), pas un
 * disque strict : chacun de ses quatre côtés a un bord droit d'au moins deux
 * tuiles, où une foreuse se pose à cheval, deux cases sur le filon et deux
 * sur l'herbe (`sim/footing.ts`). Le disque strict de rayon 2 n'en avait
 * aucun. Il ne déborde jamais du carré de côté `2r + 1`.
 */
function inOre(tx: number, ty: number, node: OreNode): boolean {
  const dx = tx - node.tx;
  const dy = ty - node.ty;

  return dx * dx + dy * dy <= node.radius * node.radius + node.radius;
}

function inDisc(tx: number, ty: number, cx: number, cy: number, radius: number): boolean {
  const dx = tx - cx;
  const dy = ty - cy;

  return dx * dx + dy * dy <= radius * radius;
}

/* ------------------------------------------------------------------ foyer */

/**
 * Cherche, en spirale carrée depuis l'origine, une clairière de 5 × 6 tuiles
 * entièrement constructible : la mairie (3 × 3) en haut, Adam en dessous,
 * une tuile de marge autour. Sans ça, une seed qui met de l'eau en (0, 0)
 * fait apparaître le joueur dans un lac dont il ne peut pas sortir — ou la
 * mairie les pieds dedans. La clairière doit aussi pouvoir accueillir le
 * foyer (voir `Home`) : un îlot où ne tient aucun filon est écarté. Et elle
 * doit ouvrir sur le monde (`hasWayOut`) : pas de départ dans un cirque de
 * rochers.
 *
 * Renvoie la tuile sous la mairie ; Adam apparaît juste en dessous.
 */
export function findSpawn(seed: number): [number, number] {
  return homeOf(seed).spawn;
}

/** Les filons du foyer — la pierre, puis le fer — que la seed pose à portée de pas du départ. */
export function homeOres(seed: number): readonly OreNode[] {
  return homeOf(seed).ores;
}

/** La mairie, premier chantier : c'est elle que la clairière du départ doit accueillir. */
const TOWN_HALL_HEIGHT = BUILDINGS.townHall.height;

/** La clairière du départ, que `World` vide de ses ressources : la mairie au-dessus, Adam en dessous. */
function inClearing(sx: number, sy: number, tx: number, ty: number): boolean {
  return tx >= sx - 2 && tx <= sx + 2 && ty >= sy - TOWN_HALL_HEIGHT && ty <= sy + 2;
}

function isClearing(seed: number, sx: number, sy: number): boolean {
  for (let ty = sy - TOWN_HALL_HEIGHT; ty <= sy + 2; ty += 1) {
    for (let tx = sx - 2; tx <= sx + 2; tx += 1) {
      if (!isBuildable(groundAt(seed, tx, ty))) return false;
    }
  }
  return true;
}

/**
 * Le foyer : ce qu'il faut autour du départ pour bâtir la mairie, puis la
 * foreuse. Laissés au hasard des cellules, la pierre n'étant qu'un filon sur
 * quatre, les rochers roses tombaient à 30–60 tuiles d'Adam sur une seed sur
 * deux — trois écrans de téléphone à errer sans savoir où. Le foyer pose donc,
 * à portée de pas depuis Adam (jamais de l'autre côté d'un lac) :
 * - un bosquet à quelques tuiles, pour le bois ;
 * - un filon de pierre à moins d'un écran ;
 * - un filon de fer un peu plus loin, pour la première foreuse.
 *
 * Tiré de la seed seule (le terrain ne dépend pas des filons), donc pur ;
 * gardé en cache parce que `oreAt` le consulte à chaque tuile.
 */
interface Home {
  spawn: [number, number];
  ores: OreNode[];
  grove: { tx: number; ty: number };
}

/** Distances au départ d'Adam, en tuiles, du centre de chaque pièce du foyer. */
const HOME_GROVE = { min: 3, max: 4.5, radius: 2 };
const HOME_STONE = { min: 7, max: 9.5, radius: 2 };
const HOME_IRON = { min: 13, max: 16, radius: 2 };

/** Tuiles qu'Adam doit pouvoir atteindre depuis la clairière de départ : pas de départ enfermé. */
const SPAWN_OPEN_TILES = 400;

/** Assez large pour contenir le filon de fer le plus lointain. */
const HOME_REACH = 20;
const SPAN = 2 * HOME_REACH + 1;

const HOMES = new Map<number, Home>();

function homeOf(seed: number): Home {
  let home = HOMES.get(seed);

  if (!home) {
    home = searchHome(seed);
    HOMES.set(seed, home);
  }
  return home;
}

function searchHome(seed: number): Home {
  let first: [number, number] | null = null;

  for (let radius = 0; radius < CHUNK_TILES * 4; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (!isClearing(seed, dx, dy)) continue;

        const home = planHome(seed, dx, dy);

        if (home) return home;
        first ??= [dx, dy];
      }
    }
  }

  // Aucune clairière n'accueille de foyer : la première venue, filons posés d'office.
  const [sx, sy] = first ?? [0, 0];

  return planHome(seed, sx, sy, true)!;
}

/** Le foyer autour de cette clairière, ou `null` s'il n'y tient pas (sauf `force`). */
function planHome(seed: number, sx: number, sy: number, force = false): Home | null {
  const ax = sx;
  const ay = sy + 1;
  const reachable = reachableFrom(seed, ax, ay);
  const land = (tx: number, ty: number): boolean => groundAt(seed, tx, ty) !== 'water';
  const clear = (tx: number, ty: number, radius: number): boolean => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy > radius * radius) continue;
        if (!land(tx + dx, ty + dy) || inClearing(sx, sy, tx + dx, ty + dy)) return false;
      }
    }
    return true;
  };

  /**
   * Une tuile atteignable dans l'anneau, tirée de la seed parmi celles qui
   * passent le filtre. `edge`, coûteux, n'est jugé qu'à partir du tirage, en
   * avançant dans la liste : la première qui le passe.
   */
  const pick = (
    salt: number,
    ring: { min: number; max: number },
    accept: (tx: number, ty: number) => boolean,
    edge: (tx: number, ty: number) => boolean = () => true,
  ): [number, number] | null => {
    const candidates: [number, number][] = [];

    for (const key of reachable) {
      const tx = (key % SPAN) - HOME_REACH + ax;
      const ty = Math.floor(key / SPAN) - HOME_REACH + ay;
      const distSq = (tx - ax) ** 2 + (ty - ay) ** 2;

      if (distSq < ring.min * ring.min || distSq > ring.max * ring.max) continue;
      if (accept(tx, ty)) candidates.push([tx, ty]);
    }

    const start = candidates.length > 0 ? hash3(seed ^ salt, sx, sy) % candidates.length : 0;

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[(start + i) % candidates.length]!;

      if (edge(...candidate)) return candidate;
    }
    return null;
  };

  // Le foyer d'office, sans bord nulle part : au plus dégagé, comme avant la règle des foreuses.
  const fallback = (
    salt: number,
    ring: { min: number; max: number; radius: number },
    accept: (tx: number, ty: number) => boolean,
    last: [number, number],
  ): [number, number] =>
    pick(salt, ring, (tx, ty) => clear(tx, ty, ring.radius) && accept(tx, ty)) ??
    pick(salt, ring, (tx, ty) => clear(tx, ty, 0) && accept(tx, ty)) ??
    last;

  // Chaque filon du foyer a son bord où poser une foreuse : deux cases de filon, deux d'herbe.
  const edged = (item: ItemId, ring: { radius: number }, others: readonly OreNode[]) => (tx: number, ty: number) =>
    hasDrillEdge(seed, homeNode(seed, item, [tx, ty], ring.radius), others);
  const stoneEdge = edged('stone', HOME_STONE, []);
  const stoneAt =
    pick(0x68e31da4, HOME_STONE, (tx, ty) => clear(tx, ty, HOME_STONE.radius), stoneEdge) ??
    pick(0x68e31da4, HOME_STONE, (tx, ty) => clear(tx, ty, 0), stoneEdge) ??
    (force ? fallback(0x68e31da4, HOME_STONE, () => true, [ax, ay + HOME_STONE.min]) : null);

  if (!stoneAt) return null;

  const stone = homeNode(seed, 'stone', stoneAt, HOME_STONE.radius);
  const apart = (tx: number, ty: number): boolean => !inDisc(tx, ty, stone.tx, stone.ty, 2 * HOME_IRON.radius + 1);
  const ironEdge = edged('ironOre', HOME_IRON, [stone]);
  const ironAt =
    pick(0xb5297a4d, HOME_IRON, (tx, ty) => clear(tx, ty, HOME_IRON.radius) && apart(tx, ty), ironEdge) ??
    pick(0xb5297a4d, HOME_IRON, (tx, ty) => clear(tx, ty, 0) && apart(tx, ty), ironEdge) ??
    (force ? fallback(0xb5297a4d, HOME_IRON, apart, [ax, ay - HOME_IRON.min]) : null);

  if (!ironAt) return null;

  const iron = homeNode(seed, 'ironOre', ironAt, HOME_IRON.radius);

  // Le cœur du bosquet porte toujours un arbre : ni filon ni clairière dessous.
  const bare = (tx: number, ty: number): boolean =>
    clear(tx, ty, 0) &&
    !inOre(tx, ty, stone) &&
    !inOre(tx, ty, iron) &&
    nodeAt(seed, tx, ty) === null;
  const groveAt =
    pick(0x1656567b, HOME_GROVE, (tx, ty) => bare(tx, ty) && groundAt(seed, tx, ty) === 'grass') ??
    pick(0x1656567b, HOME_GROVE, bare) ??
    (force ? [ax + HOME_GROVE.min, ay] : null);

  if (!groveAt) return null;
  if (!force && !hasWayOut(seed, sx, sy, [stone, iron])) return null;

  return { spawn: [sx, sy], ores: [stone, iron], grove: { tx: groveAt[0], ty: groveAt[1] } };
}

/**
 * Le filon a-t-il un bord où poser une foreuse : une emprise de foreuse avec
 * moitié de ses cases sur lui, l'autre moitié sur une herbe sans filon —
 * ni les siens (`others`, le foyer en projet), ni ceux des cellules ? La
 * règle de `sim/footing.ts`, rejouée avant que `oreAt` ne soit prêt.
 */
function hasDrillEdge(seed: number, node: OreNode, others: readonly OreNode[]): boolean {
  const { width, height } = BUILDINGS.drill;
  const half = Math.floor((width * height) / 2);
  // Les emprises qui touchent le filon : leur coin va de `node - r - (w - 1)` à `node + r`.
  const left = node.tx - node.radius - (width - 1);
  const top = node.ty - node.radius - (height - 1);
  const cols = 2 * node.radius + width;
  const rows = 2 * node.radius + height;
  // Chaque tuile classée une fois : 1 sur le filon, 2 herbe nue, 0 autre chose.
  const kinds = new Uint8Array(cols * rows);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const tx = left + x;
      const ty = top + y;
      const terrain = groundAt(seed, tx, ty);

      if (terrain === 'water') continue;
      if (inOre(tx, ty, node)) kinds[x + y * cols] = 1;
      else if (terrain === 'grass' && !others.some((other) => inOre(tx, ty, other)) && nodeAt(seed, tx, ty) === null) {
        kinds[x + y * cols] = 2;
      }
    }
  }

  for (let y = 0; y + height <= rows; y += 1) {
    for (let x = 0; x + width <= cols; x += 1) {
      let ore = 0;
      let grass = 0;

      for (let dy = 0; dy < height; dy += 1) {
        for (let dx = 0; dx < width; dx += 1) {
          const kind = kinds[x + dx + (y + dy) * cols];

          if (kind === 1) ore += 1;
          else if (kind === 2) grass += 1;
        }
      }
      if (ore === half && grass === width * height - half) return true;
    }
  }
  return false;
}

function homeNode(seed: number, item: ItemId, [tx, ty]: [number, number], radius: number): OreNode {
  return { id: hash3(seed ^ 0x2f8a6c1e, tx, ty), item, tx, ty, radius };
}

/**
 * Depuis la tuile d'Adam, un remplissage par tuiles atteint-il
 * `SPAWN_OPEN_TILES` tuiles ? L'eau et les rochers arrêtent, pas les arbres
 * (Adam passe entre les troncs) ; la clairière est comptée dégagée et la
 * mairie pleine, comme elles le seront. Les filons sont ceux du foyer en
 * projet (`ores`), puis ceux des cellules : `oreAt` n'est pas encore prêt.
 */
function hasWayOut(seed: number, sx: number, sy: number, ores: readonly OreNode[]): boolean {
  const blocked = (tx: number, ty: number): boolean => {
    if (inClearing(sx, sy, tx, ty)) return tx >= sx - 1 && tx <= sx + 1 && ty < sy;
    if (!isWalkable(groundAt(seed, tx, ty))) return true;

    const ore = ores.find((node) => inOre(tx, ty, node)) ?? nodeAt(seed, tx, ty);
    const rock = ore ? rockOn(seed, ore, tx, ty) : null;

    return rock !== null && RESOURCES[rock].hitbox === 'tile';
  };
  const seen = new Set([`${sx},${sy + 1}`]);
  const queue: [number, number][] = [[sx, sy + 1]];

  for (let i = 0; i < queue.length && seen.size < SPAWN_OPEN_TILES; i += 1) {
    const [tx, ty] = queue[i]!;

    for (const [nx, ny] of [
      [tx + 1, ty],
      [tx - 1, ty],
      [tx, ty + 1],
      [tx, ty - 1],
    ] as const) {
      const key = `${nx},${ny}`;

      if (seen.has(key) || blocked(nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen.size >= SPAWN_OPEN_TILES;
}

/* ------------------------------------------------------------------- mare */

/**
 * La mare du foyer : le puits se pose au bord de l'eau, et sans lui la
 * colonie meurt de soif vers vingt minutes. Aucune rivière ne passe à moins
 * de `RIVER.clearRadius` tuiles de l'origine ; sans lac proche, l'eau tombait
 * hors de la prairie de départ, dans une région à conquérir ou la zone d'une
 * base mutante, sur une seed sur douze. Le foyer y creuse alors une mare, à
 * portée de pas d'Adam, une marge de terre tout autour pour le puits.
 *
 * Seulement là : une prairie qui a déjà sa rive garde sa carte à la tuile près,
 * ses anciennes sauvegardes aussi. Tirée de la seed seule, après le foyer
 * (`homeOf`, qui se place sur le terrain sans elle), donc pure.
 *
 * Distances en tuiles depuis le départ d'Adam, comme les pièces du foyer : au
 * plus loin, la mare et sa marge restent sous les 22 tuiles de la mairie où
 * commencent les zones des bases (`ENEMY_BASE_RINGS`), dans la prairie et sur
 * une terre saine.
 */
const HOME_POND = { min: 9, max: 14, radius: 1.5, margin: 3 };

/** Sel du tirage de la mare. */
const POND_SALT = 0x4f1bbcdc;

/** Seed → centre de la mare, ou `null` : la prairie a sa rive (ou on est en train d'en juger). */
const PONDS = new Map<number, { tx: number; ty: number } | null>();

/** Le centre de la mare du foyer, ou `null` si la prairie de départ a déjà une rive où poser un puits. */
export function homePond(seed: number): { tx: number; ty: number } | null {
  const known = PONDS.get(seed);

  if (known !== undefined) return known;

  // Pendant qu'on juge la prairie, le terrain est celui du bruit : `terrainAt` lit `null` ici.
  PONDS.set(seed, null);

  const pond = hasWellShore(seed) ? null : planPond(seed);

  PONDS.set(seed, pond);
  return pond;
}

/**
 * La prairie de départ a-t-elle une rive où poser un puits dans une partie
 * neuve ? Une emprise de puits qui touche l'eau, sur une terre constructible
 * et saine, toute dans la prairie, hors des zones des bases mutantes — posées
 * comme le monde les pose, sur une emprise libre.
 */
function hasWellShore(seed: number): boolean {
  const hall = regionCenter(seed);
  const bases = placeEnemyBases(seed, hall, (tx, ty) => isBuildable(terrainAt(seed, tx, ty)) && resourceAt(seed, tx, ty) === null);
  const { width, height } = BUILDINGS.well;
  const reach = Math.ceil(HOME_REGION.radius + REGION_SHAPE.radiusWarp);
  const left = Math.floor(hall.x) - reach;
  const top = Math.floor(hall.y) - reach;
  const span = 2 * reach + 1;
  // Chaque tuile jugée une fois : 0 inconnue, 1 eau, 2 terre où le puits se pose, 3 terre où il ne se pose pas.
  const kinds = new Uint8Array((span + 2) * (span + 2));
  const kind = (tx: number, ty: number): number => {
    const index = tx - left + 1 + (ty - top + 1) * (span + 2);

    if (kinds[index] === 0) {
      if (terrainAt(seed, tx, ty) === 'water') kinds[index] = 1;
      else {
        const usable =
          regionAt(seed, tx, ty) === HOME_REGION_ID &&
          contaminationAt(seed, tx, ty) === null &&
          !bases.some((base) => inBaseZone(base, tx, ty));

        kinds[index] = usable ? 2 : 3;
      }
    }
    return kinds[index]!;
  };

  for (let ty = top; ty + height <= top + span; ty += 1) {
    for (let tx = left; tx + width <= left + span; tx += 1) {
      let usable = true;

      for (let y = ty; y < ty + height && usable; y += 1) {
        for (let x = tx; x < tx + width && usable; x += 1) usable = kind(x, y) === 2;
      }
      if (usable && touchesWater(seed, tx, ty, width, height)) return true;
    }
  }
  return false;
}

/**
 * La mare : une tuile atteignable dans l'anneau `HOME_POND`, tirée de la seed,
 * dont le disque et sa marge sont de la terre, hors de la clairière, sans
 * filon — ceux du foyer gardent leur bord de foreuse — et loin du bosquet.
 */
function planPond(seed: number): { tx: number; ty: number } | null {
  const { spawn, ores, grove } = homeOf(seed);
  const [sx, sy] = spawn;
  const ax = sx;
  const ay = sy + 1;
  const reach = HOME_POND.radius + HOME_POND.margin;
  const span = Math.ceil(reach);
  const fits = (cx: number, cy: number): boolean => {
    if (inDisc(cx, cy, grove.tx, grove.ty, HOME_GROVE.radius + reach)) return false;
    for (let ty = cy - span; ty <= cy + span; ty += 1) {
      for (let tx = cx - span; tx <= cx + span; tx += 1) {
        if (!inDisc(tx, ty, cx, cy, reach)) continue;
        if (groundAt(seed, tx, ty) === 'water' || inClearing(sx, sy, tx, ty)) return false;
        if (ores.some((node) => inOre(tx, ty, node)) || nodeAt(seed, tx, ty) !== null) return false;
      }
    }
    return true;
  };
  const candidates: [number, number][] = [];

  for (const key of reachableFrom(seed, ax, ay)) {
    const tx = (key % SPAN) - HOME_REACH + ax;
    const ty = Math.floor(key / SPAN) - HOME_REACH + ay;
    const distSq = (tx - ax) ** 2 + (ty - ay) ** 2;

    if (distSq < HOME_POND.min * HOME_POND.min || distSq > HOME_POND.max * HOME_POND.max) continue;
    candidates.push([tx, ty]);
  }
  if (candidates.length === 0) return null;

  const start = hash3(seed ^ POND_SALT, sx, sy) % candidates.length;

  for (let i = 0; i < candidates.length; i += 1) {
    const [tx, ty] = candidates[(start + i) % candidates.length]!;

    if (fits(tx, ty)) return { tx, ty };
  }
  return null;
}

/** Le gisement de cellule sur la tuile, sans les filons du foyer. */
function nodeAt(seed: number, tx: number, ty: number): OreNode | null {
  const node = nodeOfCell(seed, Math.floor(tx / ORE_CELL), Math.floor(ty / ORE_CELL));

  return node && inOre(tx, ty, node) ? node : null;
}

/**
 * Les tuiles qu'Adam peut atteindre à pied depuis son départ, dans un carré
 * de `HOME_REACH` tuiles autour de lui. Seule l'eau arrête : un arbre ou un
 * rocher se récolte. Clés : `x + y * SPAN`, relatives au coin du carré.
 */
function reachableFrom(seed: number, ax: number, ay: number): number[] {
  const seen = new Uint8Array(SPAN * SPAN);
  const start = HOME_REACH + HOME_REACH * SPAN;
  const queue = [start];

  seen[start] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const key = queue[head]!;
    const x = key % SPAN;
    const y = Math.floor(key / SPAN);

    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= SPAN || ny >= SPAN) continue;

      const next = nx + ny * SPAN;

      if (seen[next]) continue;
      if (!isWalkable(groundAt(seed, nx - HOME_REACH + ax, ny - HOME_REACH + ay))) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return queue;
}

/** Les gisements des cellules à `range` cellules ou moins de celle de la tuile. */
export function oreNodesNear(seed: number, tx: number, ty: number, range: number): OreNode[] {
  const cellX = Math.floor(tx / ORE_CELL);
  const cellY = Math.floor(ty / ORE_CELL);
  const nodes: OreNode[] = [];

  for (let dy = -range; dy <= range; dy += 1) {
    for (let dx = -range; dx <= range; dx += 1) {
      const node = nodeOfCell(seed, cellX + dx, cellY + dy);

      if (node) nodes.push(node);
    }
  }
  return nodes;
}

/*
 * Forêts : un bruit large dessine les massifs, un tirage par tuile fait le
 * grain. Le seuil de massif est haut pour laisser des clairières. Adam passe
 * entre les troncs : une forêt se traverse, elle n'est jamais un mur.
 */
const FOREST_CELL = 12;
const FOREST_THRESHOLD = 0.58;
const TREE_DENSITY = 0.62;

/** Sur un filon, un rocher par tuile sauf les trous : un patch se traverse à moitié. */
const ROCK_DENSITY = 0.8;

/** Le rocher posé sur ce filon à cette tuile, ou `null` (un trou du patch). */
function rockOn(seed: number, ore: OreNode, tx: number, ty: number): ResourceId | null {
  // Le cœur d'un filon porte toujours son rocher : celui du foyer ne peut pas sortir vide.
  const roll = hash3(seed ^ 0x2545f491, tx, ty) / 4294967296;
  const core = tx === ore.tx && ty === ore.ty;

  return core || roll < ROCK_DENSITY ? (ROCK_OF_ORE[ore.item] ?? null) : null;
}

/**
 * La ressource de surface d'une tuile, telle que la carte la génère.
 * Ce qu'il en reste est la responsabilité de `sim/resources.ts`.
 */
export function resourceAt(seed: number, tx: number, ty: number): ResourceId | null {
  const terrain = terrainAt(seed, tx, ty);

  if (terrain === 'water') return null;

  const ore = oreAt(seed, tx, ty);

  if (ore) return rockOn(seed, ore, tx, ty);

  const { grove } = homeOf(seed);
  const inGrove = inDisc(tx, ty, grove.tx, grove.ty, HOME_GROVE.radius);

  if (inGrove && tx === grove.tx && ty === grove.ty) return 'tree';
  if (terrain !== 'grass') return null;

  const forest = smoothNoise(seed ^ 0x7f4a7c15, tx, ty, FOREST_CELL);

  if (forest < FOREST_THRESHOLD && !inGrove) return null;

  const roll = hash3(seed ^ 0x1b873593, tx, ty) / 4294967296;

  return roll < TREE_DENSITY ? 'tree' : null;
}

/**
 * Le cœur d'un massif, un peu au-dessus du seuil de forêt : les lisières
 * clairsemées n'abritent pas de loups.
 */
const FOREST_CORE = FOREST_THRESHOLD + 0.05;

/**
 * L'habitat de la faune sur une tuile, ou `null`. Le sable est la rive (il
 * ne borde que l'eau) ; la forêt est l'herbe au cœur d'un massif, qu'un
 * arbre y pousse ou non. Pur, comme le reste : rien n'est stocké.
 */
export function habitatAt(seed: number, tx: number, ty: number): Habitat | null {
  const terrain = terrainAt(seed, tx, ty);

  if (terrain === 'sand') return 'shore';
  if (terrain !== 'grass') return null;
  return smoothNoise(seed ^ 0x7f4a7c15, tx, ty, FOREST_CELL) >= FOREST_CORE ? 'forest' : null;
}

/** Tables de tirage du décor, par terrain : ids et poids cumulés. */
const DECOR_TABLES = new Map<TerrainKind, { ids: DecorId[]; cumulative: number[]; total: number }>();

for (const terrain of ['grass', 'sand', 'rock'] as const satisfies readonly DecorTerrain[]) {
  const ids: DecorId[] = [];
  const cumulative: number[] = [];
  let total = 0;

  for (const id of DECOR_IDS) {
    const weight: number = (DECOR[id].weights as Partial<Record<DecorTerrain, number>>)[terrain] ?? 0;

    if (weight <= 0) continue;
    total += weight;
    ids.push(id);
    cumulative.push(total);
  }
  DECOR_TABLES.set(terrain, { ids, cumulative, total });
}

/**
 * L'élément de décor d'une tuile, ou `null`. Seulement sur une tuile que la
 * carte laisse nue : jamais sous un arbre ni sous un rocher, jamais dans
 * l'eau. Purement visuel — rien dans la simulation n'en dépend.
 */
export function decorAt(seed: number, tx: number, ty: number): DecorId | null {
  const table = DECOR_TABLES.get(terrainAt(seed, tx, ty));

  if (!table || table.total === 0) return null;
  if (hash3(seed ^ 0x3c6ef372, tx, ty) / 4294967296 >= DECOR_DENSITY) return null;
  if (resourceAt(seed, tx, ty) !== null) return null;

  const pick = (hash3(seed ^ 0xa54ff53a, tx, ty) / 4294967296) * table.total;
  const index = table.cumulative.findIndex((bound) => pick < bound);

  return table.ids[index] ?? null;
}
