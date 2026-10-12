/**
 * La faune sauvage : crabes sur les plages, loups en forêt.
 *
 * Deux moitiés, comme la carte :
 * - les **tanières** ne sont jamais stockées. Chaque chunk en tire quelques
 *   points depuis la seed (`densOfChunk`) ; un point qui tombe sur l'habitat
 *   de l'espèce, et pas sous un arbre ou un rocher, est une tanière. Même
 *   seed, mêmes tanières, d'une partie à l'autre ;
 * - les **bêtes** sont des mobiles, comme les mutants. Le monde peuple une
 *   tanière quand Adam passe à quelques chunks, hors de sa vue, et la vide
 *   quand il s'éloigne — cf. `World.stepWildlife`.
 *
 * Une bête n'a qu'une idée à la fois (`BeastState`) : flâner autour de chez
 * elle, charger Adam, ou rentrer. Le gardien d'une base mutante est une bête
 * comme les autres, dont la « tanière » est sa base (`Beast.guardOf`) : il
 * charge qui entre dans la zone et n'en sort jamais. Le cracheur, lui,
 * garde Adam à portée de crachat et recule s'il approche ; le chef annonce
 * son coup de zone et s'arrête le temps de l'abattre. Pas de pathfinding : un loup qui charge
 * droit dans un arbre glisse le long, et c'est très bien comme ça.
 */

import { CHUNK_TILES, TILE_SIZE } from '../core/grid.ts';
import { hash3, type Rng } from '../core/rng.ts';
import { CHIEF, SPITTER, WILDLIFE, WILDLIFE_IDS, type WildlifeId } from '../data/enemies.ts';
import { facingOf, moveBox, type SolidTest } from './motion.ts';
import { PLAYER_HALF_W } from './player.ts';
import { habitatAt, resourceAt } from './terrain.ts';
import type { Beast } from './types.ts';

export interface Den {
  /** Id déterministe, calculé sur (seed, espèce, chunk, tirage). */
  id: number;
  species: WildlifeId;
  tx: number;
  ty: number;
}

/** Deux tanières du même chunk ne se touchent pas : écart minimal, en tuiles. */
const DEN_SPACING = 4;

/**
 * Les tanières d'un chunk, telles que la seed les dessine. Pur : le monde
 * les met en cache, mais pourrait les recalculer à chaque fois.
 */
export function densOfChunk(seed: number, cx: number, cy: number): Den[] {
  const dens: Den[] = [];

  for (const [index, species] of WILDLIFE_IDS.entries()) {
    const proto = WILDLIFE[species];

    // Les gardiens n'ont pas de tanière : c'est leur base, ou leur région, qui les loge.
    if (proto.habitat === 'base' || proto.habitat === 'region') continue;

    for (let draw = 0; draw < proto.densPerChunk; draw += 1) {
      const id = hash3(hash3(seed ^ 0x6a09e667, index, draw), cx, cy);
      const tx = cx * CHUNK_TILES + (id % CHUNK_TILES);
      const ty = cy * CHUNK_TILES + ((id >>> 8) % CHUNK_TILES);

      if (habitatAt(seed, tx, ty) !== proto.habitat) continue;
      if (resourceAt(seed, tx, ty) !== null) continue;
      if (dens.some((den) => Math.abs(den.tx - tx) < DEN_SPACING && Math.abs(den.ty - ty) < DEN_SPACING)) continue;

      dens.push({ id, species, tx, ty });
    }
  }
  return dens;
}

/** Effectif d'une tanière, entre `groupMin` et `groupMax`, tiré de son id. */
export function denSize(den: Den): number {
  const { groupMin, groupMax } = WILDLIFE[den.species];

  return groupMin + (hash3(den.id, 3, 0) % (groupMax - groupMin + 1));
}

/** Ce qu'une bête a fait ce tick. */
export interface BeastStep {
  /** Vrai si un coup part sur Adam. */
  strikes: boolean;
  /** Vrai si un cracheur crache sur Adam ce tick : le monde lance le crachat. */
  shoots: boolean;
  /** Le chef vient d'annoncer son coup de zone (`Beast.slam`). */
  warns: boolean;
  /** Le centre où la massue du chef tombe ce tick, ou `null`. */
  slam: { x: number; y: number } | null;
}

/**
 * Un tick de bête.
 *
 * `isSolid` est le monde (eau, ressources, bâtiments) ; l'habitat s'y ajoute
 * ici. Un crabe ne quitte jamais le sable, même en chargeant ; un loup ne
 * quitte la forêt que pour charger ou rentrer. Un gardien compte depuis sa
 * base, pas depuis lui : il charge Adam qui entre à `aggroRadius` du centre,
 * le lâche au-delà de `giveUpRadius`, et sa laisse est un mur — une tuile
 * plus loin que `leashRadius` du centre lui est solide, même en chargeant.
 */
export function stepBeast(
  beast: Beast,
  player: { x: number; y: number },
  isSolid: SolidTest,
  seed: number,
  rng: Rng,
  stepSeconds: number,
): BeastStep {
  const proto = WILDLIFE[beast.proto];

  if (beast.attackCooldown > 0) beast.attackCooldown -= 1;
  if (beast.slamCooldown !== undefined && beast.slamCooldown > 0) beast.slamCooldown -= 1;

  const toPlayerX = player.x - beast.x;
  const toPlayerY = player.y - beast.y;
  const playerSq = toPlayerX * toPlayerX + toPlayerY * toPlayerY;
  const toHomeX = beast.homeX - beast.x;
  const toHomeY = beast.homeY - beast.y;
  const homeSq = toHomeX * toHomeX + toHomeY * toHomeY;
  const aggro = proto.aggroRadius * TILE_SIZE;
  const giveUp = proto.giveUpRadius * TILE_SIZE;
  const leash = proto.leashRadius * TILE_SIZE;
  const guard = proto.habitat === 'base' || proto.habitat === 'region';
  // Un gardien mesure Adam depuis sa base, ou son repaire : c'est la zone qu'il défend.
  const watchSq = guard ? (player.x - beast.homeX) ** 2 + (player.y - beast.homeY) ** 2 : playerSq;

  switch (beast.state) {
    case 'roam':
      if (watchSq <= aggro * aggro) {
        beast.state = 'chase';
        // Le premier crachat s'annonce comme les autres : le jabot gonfle d'abord.
        if (beast.proto === 'spitter') beast.attackCooldown = Math.max(beast.attackCooldown, SPITTER.tellTicks);
      }
      break;

    case 'chase':
      if (watchSq > giveUp * giveUp || (!guard && homeSq > leash * leash)) beast.state = 'return';
      break;

    case 'return':
      if (homeSq <= TILE_SIZE * TILE_SIZE) {
        beast.state = 'roam';
        beast.wanderTicks = 0;
      }
      break;
  }

  const confined = beast.state === 'roam' || proto.habitat === 'shore';
  const solid: SolidTest = guard
    ? (tx, ty) => isSolid(tx, ty) || ((tx + 0.5) * TILE_SIZE - beast.homeX) ** 2 + ((ty + 0.5) * TILE_SIZE - beast.homeY) ** 2 > leash * leash
    : confined
      ? (tx, ty) => isSolid(tx, ty) || habitatAt(seed, tx, ty) !== proto.habitat
      : isSolid;
  let dirX = 0;
  let dirY = 0;
  let speed: number = proto.speed;
  let strikes = false;
  let shoots = false;
  let warns = false;
  let slam: BeastStep['slam'] = null;

  // Adam parti, le coup annoncé retombe dans le vide : le chef le range.
  if (beast.slam && beast.state !== 'chase') delete beast.slam;

  if (beast.state === 'chase' && beast.slam) {
    // Massue levée : il ne bouge plus, le cercle se remplit, puis elle tombe.
    beast.slam.ticks -= 1;
    beast.facing = facingOf(beast.slam.x - beast.x, beast.slam.y - beast.y);
    if (beast.slam.ticks <= 0) {
      slam = { x: beast.slam.x, y: beast.slam.y };
      delete beast.slam;
      beast.slamCooldown = CHIEF.slam.cooldownTicks;
    }
  } else if (beast.state === 'chase' && beast.slamCooldown === 0 && playerSq <= (CHIEF.slam.range * TILE_SIZE) ** 2) {
    // Le chef s'arrête et lève sa massue au-dessus d'Adam : le cercle dit où elle tombera.
    beast.slam = { x: player.x, y: player.y, ticks: CHIEF.slam.windupTicks };
    beast.facing = facingOf(toPlayerX, toPlayerY);
    warns = true;
  } else if (beast.state === 'chase' && beast.proto === 'spitter') {
    const distance = Math.sqrt(playerSq);

    if (distance < SPITTER.fleeRadius * TILE_SIZE) {
      // Approché de trop près, il recule — dos à sa laisse, il finit acculé.
      dirX = -toPlayerX / (distance || 1);
      dirY = -toPlayerY / (distance || 1);
      speed = proto.chargeSpeed;
    } else {
      if (distance > SPITTER.range * TILE_SIZE * 0.85) {
        dirX = toPlayerX / distance;
        dirY = toPlayerY / distance;
      }
      if (distance <= SPITTER.range * TILE_SIZE && beast.attackCooldown === 0) {
        beast.attackCooldown = proto.attackTicks;
        shoots = true;
      }
    }
    if (distance > 0) beast.facing = facingOf(toPlayerX, toPlayerY);
  } else if (beast.state === 'chase') {
    const distance = Math.sqrt(playerSq);
    const reach = proto.halfW + PLAYER_HALF_W + 4;

    if (distance > reach) {
      dirX = toPlayerX / distance;
      dirY = toPlayerY / distance;
      speed = proto.chargeSpeed;
    } else if (beast.attackCooldown === 0) {
      beast.attackCooldown = proto.attackTicks;
      strikes = true;
    }
    // Au contact, elle regarde Adam, même immobile.
    if (distance > 0) beast.facing = facingOf(toPlayerX, toPlayerY);
  } else if (beast.state === 'return') {
    const distance = Math.sqrt(homeSq);

    dirX = toHomeX / distance;
    dirY = toHomeY / distance;
  } else {
    wander(beast, rng, homeSq, leash);
    dirX = beast.dirX;
    dirY = beast.dirY;
  }

  const step = speed * TILE_SIZE * stepSeconds;
  const contact = moveBox(beast, proto, dirX * step, dirY * step, solid);

  beast.moving = beast.x !== beast.prevX || beast.y !== beast.prevY;

  if ((dirX !== 0 || dirY !== 0) && beast.state !== 'chase') beast.facing = facingOf(dirX, dirY);

  // Bloquée en flânant : elle change d'idée au tick suivant plutôt que de pousser.
  if (contact && beast.state === 'roam') beast.wanderTicks = 0;

  return { strikes, shoots, warns, slam };
}

/**
 * La flânerie : un temps immobile, un temps en marche, et le retour vers la
 * tanière quand elle s'en est trop écartée. Un crabe file de côté : sa
 * marche est surtout horizontale, le long de la rive.
 */
function wander(beast: Beast, rng: Rng, homeSq: number, leash: number): void {
  if (beast.wanderTicks <= 0) {
    if (rng() < 0.4) {
      beast.dirX = 0;
      beast.dirY = 0;
    } else {
      const angle = rng() * Math.PI * 2;
      const sideways = beast.proto === 'crab' ? 0.35 : 1;
      const x = Math.cos(angle);
      const y = Math.sin(angle) * sideways;
      const length = Math.hypot(x, y) || 1;

      beast.dirX = x / length;
      beast.dirY = y / length;
    }
    beast.wanderTicks = 20 + Math.floor(rng() * 40);
  }
  beast.wanderTicks -= 1;

  const range = leash * 0.6;

  if (homeSq > range * range) {
    const distance = Math.sqrt(homeSq);

    beast.dirX = (beast.homeX - beast.x) / distance;
    beast.dirY = (beast.homeY - beast.y) / distance;
  }
}
