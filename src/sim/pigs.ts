/**
 * Les cochons : sauvages en forêt, puis apprivoisés derrière Adam.
 *
 * Comme la faune, deux moitiés :
 * - les **points d'apparition** ne sont jamais stockés (`pigSpotsOfChunk`) :
 *   chaque chunk tire quelques points de la seed ; un point qui tombe en
 *   forêt, hors d'un arbre ou d'un rocher, et que la chance retient, est un
 *   cochon possible — rare. Un cochon apprivoisé vide son point un temps
 *   (`PIGS.wild.respawnTicks`), dans `World.dens` ;
 * - les **cochons** sont des mobiles, peuplés et rangés par `World.stepPigs`.
 *
 * Un cochon n'a pas de points de vie, ne frappe jamais, et l'arc d'Adam ne le
 * voit pas : ce n'est pas un `Foe`. Il n'a que trois idées (`PigState`) :
 * flâner, suivre Adam, ou détaler. Pas de pathfinding : il glisse le long de
 * ce qui l'arrête.
 */

import { CHUNK_TILES, TILE_SIZE } from '../core/grid.ts';
import { hash3, type Rng } from '../core/rng.ts';
import { PIGS } from '../data/pigs.ts';
import { facingOf, moveBox, type SolidTest } from './motion.ts';
import { habitatAt, resourceAt } from './terrain.ts';
import type { Pig } from './types.ts';

export interface PigSpot {
  /** Id déterministe, calculé sur (seed, chunk, tirage) : il clé l'état du point dans `World.dens`. */
  id: number;
  tx: number;
  ty: number;
}

/** Ce qu'un cochon a fait ce tick, que le monde annonce. */
export type PigStep = 'tamed' | 'scared' | 'lost' | null;

/** Les points de cochon d'un chunk, tels que la seed les dessine. */
export function pigSpotsOfChunk(seed: number, cx: number, cy: number): PigSpot[] {
  const spots: PigSpot[] = [];

  for (let draw = 0; draw < PIGS.wild.drawsPerChunk; draw += 1) {
    const id = hash3(hash3(seed ^ 0x3c6ef372, 11, draw), cx, cy);

    if ((id >>> 16) / 65536 >= PIGS.wild.chance) continue;

    const tx = cx * CHUNK_TILES + (id % CHUNK_TILES);
    const ty = cy * CHUNK_TILES + ((id >>> 8) % CHUNK_TILES);

    if (habitatAt(seed, tx, ty) !== 'forest') continue;
    if (resourceAt(seed, tx, ty) !== null) continue;
    spots.push({ id, tx, ty });
  }
  return spots;
}

const distance = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

/**
 * Un tick de cochon. `scare` : la bête sauvage ou le mutant le plus proche
 * qui l'effraierait, s'il y en a un à portée ; `canTame` : aucun autre
 * cochon ne suit déjà Adam.
 */
export function stepPig(pig: Pig, player: { x: number; y: number }, scare: { x: number; y: number } | null, canTame: boolean, isSolid: SolidTest, rng: Rng, stepSeconds: number): PigStep {
  const toPlayerX = player.x - pig.x;
  const toPlayerY = player.y - pig.y;
  const gap = Math.hypot(toPlayerX, toPlayerY);
  let result: PigStep = null;
  let dirX = 0;
  let dirY = 0;
  let speed: number = PIGS.wild.speed;

  switch (pig.state) {
    case 'wild':
      if (canTame && gap <= PIGS.tame.radius * TILE_SIZE) {
        // Adam reste près : il s'arrête, le regarde, et se laisse approcher.
        pig.tame += 1;
        pig.facing = facingOf(toPlayerX, toPlayerY);
        if (pig.tame >= PIGS.tame.ticks) {
          pig.state = 'follow';
          pig.loose = 0;
          result = 'tamed';
        }
      } else {
        pig.tame = Math.max(0, pig.tame - PIGS.tame.decay);
        wander(pig, rng);
        dirX = pig.dirX;
        dirY = pig.dirY;
      }
      break;

    case 'follow': {
      if (scare) {
        run(pig, pig.x - scare.x, pig.y - scare.y);
        result = 'scared';
        break;
      }
      // Trop longtemps loin d'Adam : il perd sa trace et s'enfuit — doucement, il reviendra à l'état sauvage.
      pig.loose = gap > PIGS.follow.looseDistance * TILE_SIZE ? pig.loose + 1 : Math.max(0, pig.loose - 2);
      if (pig.loose >= PIGS.follow.patienceTicks) {
        run(pig, pig.x - player.x, pig.y - player.y);
        result = 'lost';
        break;
      }
      if (gap > PIGS.follow.distance * TILE_SIZE) {
        dirX = toPlayerX / gap;
        dirY = toPlayerY / gap;
        speed = PIGS.follow.speed;
      } else {
        pig.facing = facingOf(toPlayerX, toPlayerY);
      }
      break;
    }

    case 'flee':
      pig.fleeTicks -= 1;
      dirX = pig.dirX;
      dirY = pig.dirY;
      speed = PIGS.flee.speed;
      if (pig.fleeTicks <= 0) {
        // Calmé : il redevient sauvage là où il s'est arrêté.
        pig.state = 'wild';
        pig.denId = 0;
        pig.homeX = pig.x;
        pig.homeY = pig.y;
        pig.tame = 0;
        pig.wanderTicks = 0;
      }
      break;
  }

  const step = speed * TILE_SIZE * stepSeconds;
  const contact = moveBox(pig, { halfW: PIGS.wild.halfW, halfH: PIGS.wild.halfH }, dirX * step, dirY * step, isSolid);

  pig.moving = pig.x !== pig.prevX || pig.y !== pig.prevY;
  if (dirX !== 0 || dirY !== 0) pig.facing = facingOf(dirX, dirY);
  // Bloqué en flânant ou en fuyant, il change d'idée plutôt que de pousser.
  if (contact) {
    if (pig.state === 'wild') pig.wanderTicks = 0;
    else if (pig.state === 'flee') turn(pig, rng);
  }
  return result;
}

/** Il détale, dos à ce qui l'effraie. */
function run(pig: Pig, awayX: number, awayY: number): void {
  const length = distance(0, 0, awayX, awayY) || 1;

  pig.state = 'flee';
  pig.fleeTicks = PIGS.flee.ticks;
  pig.dirX = awayX / length;
  pig.dirY = awayY / length;
  pig.tame = 0;
  pig.loose = 0;
}

/** Contre un obstacle en fuyant, il part de côté. */
function turn(pig: Pig, rng: Rng): void {
  const angle = Math.atan2(pig.dirY, pig.dirX) + (rng() < 0.5 ? 1 : -1) * (Math.PI / 2);

  pig.dirX = Math.cos(angle);
  pig.dirY = Math.sin(angle);
}

/** La flânerie : un temps immobile, un temps en marche, et le retour vers son point quand il s'en écarte trop. */
function wander(pig: Pig, rng: Rng): void {
  if (pig.wanderTicks <= 0) {
    if (rng() < 0.5) {
      pig.dirX = 0;
      pig.dirY = 0;
    } else {
      const angle = rng() * Math.PI * 2;

      pig.dirX = Math.cos(angle);
      pig.dirY = Math.sin(angle);
    }
    pig.wanderTicks = 20 + Math.floor(rng() * 40);
  }
  pig.wanderTicks -= 1;

  const range = PIGS.wild.leashRadius * TILE_SIZE;
  const away = distance(pig.x, pig.y, pig.homeX, pig.homeY);

  if (away > range) {
    pig.dirX = (pig.homeX - pig.x) / away;
    pig.dirY = (pig.homeY - pig.y) / away;
  }
}
