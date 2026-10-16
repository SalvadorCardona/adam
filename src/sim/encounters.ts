/**
 * Les rencontres de la route : où la seed les pose, et comment elles se comportent.
 *
 * Comme les ruines et les secrets (`sim/discoveries.ts`), elles ne sont
 * jamais stockées : chaque chunk tire au plus un survivant blessé, un
 * marchand ambulant et une biche dorée depuis la seed, sur une case nue hors
 * de la clairière du départ. Seules celles qu'Adam a résolues sont de l'état
 * (`World.resolvedEncounters`). Le monde matérialise celle d'un chunk proche
 * en mobile (`Wanderer`, ou une charrette `Caravan`) et la range quand Adam
 * s'éloigne ; rien ici ne touche au PRNG du monde — les flâneries se
 * hachent de la seed, de l'id et du tick.
 */

import { CHUNK_TILES, TILE_SIZE } from '../core/grid.ts';
import { hash3 } from '../core/rng.ts';
import { CHESTS } from '../data/chests.ts';
import { discoveryTier } from '../data/discoveries.ts';
import { ENCOUNTERS, type EncounterKind, type WaysideOffer } from '../data/encounters.ts';
import { facingOf, moveBox, type SolidTest } from './motion.ts';
import { findSpawn, oreAt, resourceAt, terrainAt } from './terrain.ts';
import type { TradeOffer, Wanderer } from './types.ts';

export interface Encounter {
  /** Id déterministe, calculé sur (seed, genre, chunk). */
  id: number;
  kind: EncounterKind;
  tx: number;
  ty: number;
  /** Le palier de distance au départ (`DISCOVERY_TIERS`) : il règle la densité et l'offre du marchand. */
  tier: number;
}

const SALT: Record<EncounterKind, number> = { wounded: 0x1b873593, merchant: 0x6a09e667, deer: 0x510e527f };
/** Tentatives pour trouver une case qui convienne dans le chunk. */
const TRIES = 8;

/** La rencontre d'un chunk, telle que la seed la pose, ou `null`. Pur : le monde le met en cache. */
export function encounterOfChunk(seed: number, kind: EncounterKind, cx: number, cy: number): Encounter | null {
  const id = hash3(seed ^ SALT[kind], cx, cy);
  const [sx, sy] = findSpawn(seed);
  const chance = ENCOUNTERS[kind].chance;
  const centerTier = discoveryTier(Math.hypot((cx + 0.5) * CHUNK_TILES - sx, (cy + 0.5) * CHUNK_TILES - sy));

  if (hash3(id, 1, 0) / 4294967296 >= chance[centerTier]!) return null;

  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    const roll = hash3(id, 2, attempt);
    const tx = cx * CHUNK_TILES + (roll % CHUNK_TILES);
    const ty = cy * CHUNK_TILES + ((roll >>> 8) % CHUNK_TILES);

    if (terrainAt(seed, tx, ty) !== 'grass') continue;
    if (resourceAt(seed, tx, ty) !== null || oreAt(seed, tx, ty) !== null) continue;

    const away = Math.hypot(tx - sx, ty - sy);

    if (away < Math.max(ENCOUNTERS.minSpawnTiles, CHESTS.minSpawnTiles)) continue;
    return { id, kind, tx, ty, tier: discoveryTier(away) };
  }
  return null;
}

/** L'unique offre du marchand `id` : tirée de la seed et de l'id parmi celles de son palier. */
export function waysideOffer(seed: number, id: number, tier: number): TradeOffer {
  const offers: readonly WaysideOffer[] = ENCOUNTERS.merchant.offers[tier]!;
  const { cost, items } = offers[hash3(seed ^ 0x2c1b3c6d, id, 0) % offers.length]!;

  return { kind: 'wayside', cost: { ...cost }, items: { ...items }, bag: 0, rare: null, done: false };
}

/** Un nombre de [0, 1) haché de la seed, de l'id et du tick : le hasard d'une flânerie, hors du PRNG du monde. */
export function wanderRoll(seed: number, id: number, tick: number): number {
  return hash3(seed ^ 0x7f4a7c15, id, tick) / 4294967296;
}

const distance = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

/** Ce qu'un tick de rencontre a fait, que le monde annonce. */
export type WandererStep = 'touched' | 'scared' | 'lost' | 'caught' | 'admitted' | null;

/** Le contexte d'un tick : Adam, la porte de la mairie (`null` sans mairie), et l'ennemi le plus proche qui l'effraie. */
export interface WandererContext {
  player: { x: number; y: number };
  door: { x: number; y: number } | null;
  scare: { x: number; y: number } | null;
  isSolid: SolidTest;
  seed: number;
  tick: number;
  stepSeconds: number;
}

/**
 * Un tick de survivant blessé. Allongé, il attend qu'Adam le touche ; après,
 * il le suit en boitillant, en ligne droite comme le patient, jusqu'à la
 * porte de la mairie ; un ennemi à portée le fait fuir, et trop longtemps
 * loin d'Adam, il renonce et attend de nouveau.
 */
export function stepWounded(wounded: Wanderer, context: WandererContext): WandererStep {
  const { player, door, scare, stepSeconds } = context;
  const config = ENCOUNTERS.wounded;
  const gap = distance(wounded.x, wounded.y, player.x, player.y);
  let result: WandererStep = null;

  switch (wounded.state) {
    case 'idle':
      stand(wounded);
      if (door && gap <= config.touchTiles * TILE_SIZE) {
        wounded.state = 'following';
        wounded.gauge = 0;
        result = 'touched';
      }
      break;

    case 'following': {
      if (scare && distance(wounded.x, wounded.y, scare.x, scare.y) <= config.fearTiles * TILE_SIZE) {
        run(wounded, wounded.x - scare.x, wounded.y - scare.y);
        result = 'scared';
        break;
      }
      wounded.gauge = gap > config.lostTiles * TILE_SIZE ? wounded.gauge + 1 : Math.max(0, wounded.gauge - 2);
      if (!door || wounded.gauge >= config.lostTicks) {
        wounded.state = 'idle';
        wounded.gauge = 0;
        stand(wounded);
        result = door ? 'lost' : null;
        break;
      }
      if (distance(wounded.x, wounded.y, door.x, door.y) <= ENCOUNTERS.wounded.admitTiles * TILE_SIZE) {
        result = 'admitted';
      } else if (gap <= config.followGap * TILE_SIZE) {
        stand(wounded);
      } else {
        stride(wounded, player.x, player.y, config.limpSpeed, stepSeconds);
      }
      break;
    }

    case 'fleeing':
      wounded.fleeTicks -= 1;
      stride(wounded, wounded.x + wounded.dirX * TILE_SIZE, wounded.y + wounded.dirY * TILE_SIZE, config.fleeSpeed, stepSeconds);
      // Calmé, il attend là où il s'est arrêté : Adam peut le reprendre.
      if (wounded.fleeTicks <= 0) {
        wounded.state = 'idle';
        wounded.homeX = wounded.x;
        wounded.homeY = wounded.y;
      }
      break;
  }
  return result;
}

/**
 * Un tick de biche. Elle broute autour de son point ; si Adam passe trop
 * près, elle s'enfuit jusqu'à ce qu'il soit loin. Tant qu'il reste à portée
 * — sans la serrer —, sa jauge monte ; pleine, elle se laisse approcher.
 */
export function stepDeer(deer: Wanderer, context: WandererContext): WandererStep {
  const { player, stepSeconds, seed, tick } = context;
  const config = ENCOUNTERS.deer;
  const gap = distance(deer.x, deer.y, player.x, player.y);
  let result: WandererStep = null;
  let speed: number = config.speed;

  if (deer.state === 'fleeing' && gap >= config.calmTiles * TILE_SIZE) {
    deer.state = 'idle';
    deer.wanderTicks = 0;
    deer.homeX = deer.x;
    deer.homeY = deer.y;
  } else if (deer.state === 'idle' && gap < config.flinchTiles * TILE_SIZE) {
    run(deer, deer.x - player.x, deer.y - player.y);
  }

  if (deer.state === 'fleeing') {
    speed = config.fleeSpeed;
  } else if (gap <= config.catchTiles * TILE_SIZE) {
    deer.gauge += 1;
    deer.facing = facingOf(player.x - deer.x, player.y - deer.y);
    deer.dirX = 0;
    deer.dirY = 0;
    if (deer.gauge >= config.catchTicks) result = 'caught';
  } else {
    deer.gauge = Math.max(0, deer.gauge - config.decay);
    graze(deer, seed, tick);
  }

  const step = speed * TILE_SIZE * stepSeconds;
  const contact = moveBox(deer, { halfW: config.halfW, halfH: config.halfH }, deer.dirX * step, deer.dirY * step, context.isSolid);

  deer.moving = deer.x !== deer.prevX || deer.y !== deer.prevY;
  if (deer.dirX !== 0 || deer.dirY !== 0) deer.facing = facingOf(deer.dirX, deer.dirY);
  if (contact) {
    if (deer.state === 'fleeing') {
      // Contre un obstacle, elle part de côté.
      const angle = Math.atan2(deer.dirY, deer.dirX) + (wanderRoll(seed, deer.id, tick) < 0.5 ? 1 : -1) * (Math.PI / 2);

      deer.dirX = Math.cos(angle);
      deer.dirY = Math.sin(angle);
    } else {
      deer.wanderTicks = 0;
    }
  }
  return result;
}

function stand(body: Wanderer): void {
  body.prevX = body.x;
  body.prevY = body.y;
  body.moving = false;
}

/** Un pas en ligne droite vers (x, y), sans rien pour l'arrêter. */
function stride(body: Wanderer, x: number, y: number, speed: number, stepSeconds: number): void {
  const dx = x - body.x;
  const dy = y - body.y;
  const length = Math.hypot(dx, dy);
  const step = speed * TILE_SIZE * stepSeconds;

  body.prevX = body.x;
  body.prevY = body.y;
  if (length === 0) {
    body.moving = false;
    return;
  }

  const reach = Math.min(step, length);

  body.x += (dx / length) * reach;
  body.y += (dy / length) * reach;
  body.moving = true;
  body.facing = facingOf(dx, dy);
}

/** Il détale, dos à ce qui l'effraie. */
function run(body: Wanderer, awayX: number, awayY: number): void {
  const length = Math.hypot(awayX, awayY) || 1;

  body.state = 'fleeing';
  body.fleeTicks = ENCOUNTERS.wounded.fleeTicks;
  body.dirX = awayX / length;
  body.dirY = awayY / length;
  body.gauge = 0;
}

/** La flânerie de la biche : un temps immobile, un temps en marche, et le retour vers son point quand elle s'en écarte trop. */
function graze(deer: Wanderer, seed: number, tick: number): void {
  if (deer.wanderTicks <= 0) {
    if (wanderRoll(seed, deer.id, tick) < 0.5) {
      deer.dirX = 0;
      deer.dirY = 0;
    } else {
      const angle = wanderRoll(seed ^ 1, deer.id, tick) * Math.PI * 2;

      deer.dirX = Math.cos(angle);
      deer.dirY = Math.sin(angle);
    }
    deer.wanderTicks = 20 + Math.floor(wanderRoll(seed ^ 2, deer.id, tick) * 40);
  }
  deer.wanderTicks -= 1;

  const away = distance(deer.x, deer.y, deer.homeX, deer.homeY);

  if (away > ENCOUNTERS.deer.leashTiles * TILE_SIZE) {
    deer.dirX = (deer.homeX - deer.x) / away;
    deer.dirY = (deer.homeY - deer.y) / away;
  }
}
