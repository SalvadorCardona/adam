/**
 * Les ouvriers : les porteurs de la maison des constructeurs, les
 * logisticiens et les bâtisseurs des postes, les bûcherons de la cabane — et, entre deux
 * tâches, leur flânerie.
 *
 * Pas d'A* par porteur — cent porteurs qui recalculent un chemin, c'est fini.
 * Pour commencer, la **ligne droite** : un porteur passe derrière les arbres
 * et les bâtiments, comme on contourne sans y penser, mais jamais dans l'eau.
 * Ce n'est pas le pas qui l'arrête au bord d'un lac : un job dont le trajet
 * traverserait l'eau n'est tout simplement pas créé (`clearLine`). Le jour
 * où arriveront les champs de flux, seul le corps de `walkToward()` changera.
 *
 * Ce module ne décide rien de ce qui est porté : c'est `jobs.ts`. Il fait
 * avancer un ouvrier vers un point et dit s'il y est.
 */

import { TILE_SIZE, distanceSq, floorDiv } from '../core/grid.ts';
import { hash3 } from '../core/rng.ts';
import { CLINIC } from '../data/clinic.ts';
import { ROADS } from '../data/roads.ts';
import { NEEDS } from '../data/needs.ts';
import { BUILDERS, EX_MUTANT, FARMERS, FORESTERS, LOGISTICIANS, LUMBERJACKS, PORTERS, WANDER } from '../data/workers.ts';
import { KID_SPEED_TILES } from './kids.ts';
import { facingOf } from './motion.ts';
import { moodPace, traitPace } from './housing.ts';
import { needsPace } from './needs.ts';
import type { RoadTest } from './roads.ts';
import { isWalkable, terrainAt } from './terrain.ts';
import type { Farmer, Forester, Kid, Lumberjack, Patient, Wandering, Worker } from './types.ts';

/** Ce qui marche en ligne droite : un ouvrier, un bûcheron, un forestier, un fermier, un patient — et un enfant qui va manger. */
type Walker = Worker | Lumberjack | Forester | Farmer | Patient | Kid;

/** Pas d'échantillonnage d'une ligne droite, en pixels : moins d'un quart de tuile, aucun coin d'eau n'échappe. */
const LINE_STEP = TILE_SIZE / 4;

/**
 * Vitesse de marche, en tuiles par seconde : un porteur, un ex-mutant, un
 * bûcheron, un enfant, un patient qui boitille. Un ouvrier malheureux — il a
 * trop dormi dehors — traîne les pieds, un content va un peu plus vite (`moodPace`), et son trait pèse (`traitPace`) ; un enfant, qui dort à
 * sa nurserie, jamais.
 */
function speedOf(walker: Walker): number {
  if (walker.kind === 'patient') return CLINIC.limpSpeed;
  return baseSpeed(walker) * paceOf(walker) * (walker.kind === 'kid' ? 1 : moodPace(walker.happiness) * traitPace(walker.trait));
}

function baseSpeed(walker: Exclude<Walker, Patient>): number {
  if (walker.kind === 'kid') return KID_SPEED_TILES;
  if (walker.kind === 'lumberjack') return LUMBERJACKS.speed;
  if (walker.kind === 'forester') return FORESTERS.speed;
  if (walker.kind === 'farmer') return FARMERS.speed;
  if (walker.logistician) return LOGISTICIANS.speed;
  if (walker.builder) return BUILDERS.speed;
  return walker.exMutant ? EX_MUTANT.speed : PORTERS.speed;
}

/** Affamé, il traîne les pieds ; en route pour manger, il se traîne au moins à l'allure d'un affamé. */
function paceOf(walker: Exclude<Walker, Patient>): number {
  const pace = needsPace(walker.needs);

  return walker.meal === null ? pace : Math.max(pace, NEEDS[walker.meal].weakPace);
}

/** Ce qu'un ouvrier porte en un voyage : un ex-mutant, plus fort, ou un logisticien, du métier, en prend davantage. */
export function carryOf(worker: Worker): number {
  if (worker.logistician) return LOGISTICIANS.carry;
  if (worker.builder) return BUILDERS.carry;
  return worker.exMutant ? EX_MUTANT.carry : PORTERS.carry;
}

/**
 * Avance d'un tick vers (x, y), en ligne droite. Renvoie `true` à
 * l'arrivée — le marcheur est alors posé exactement sur le point.
 * `onRoad` : sur une tuile pavée, le pas s'allonge (`ROADS.speed`) ; c'est la
 * tuile de départ du pas qui compte.
 */
export function walkToward(worker: Walker, x: number, y: number, stepSeconds: number, onRoad?: RoadTest): boolean {
  const dx = x - worker.x;
  const dy = y - worker.y;
  const distance = Math.hypot(dx, dy);
  const paved = onRoad?.(floorDiv(worker.x, TILE_SIZE), floorDiv(worker.y, TILE_SIZE)) ?? false;
  const speed = speedOf(worker) * (paved ? ROADS.speed : 1) * TILE_SIZE * stepSeconds;

  worker.prevX = worker.x;
  worker.prevY = worker.y;

  if (distance <= speed) {
    worker.x = x;
    worker.y = y;
    worker.moving = distance > 0;
    return true;
  }

  worker.x += (dx / distance) * speed;
  worker.y += (dy / distance) * speed;
  worker.moving = true;
  worker.facing = facingOf(dx, dy);
  return false;
}

/** Reste sur place ce tick : le rendu n'interpole plus. */
export function standStill(worker: Walker): void {
  worker.prevX = worker.x;
  worker.prevY = worker.y;
  worker.moving = false;
}

/** La ligne droite de (x0, y0) à (x1, y1) reste-t-elle hors de l'eau ? */
export function clearLine(seed: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / LINE_STEP));

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const tx = floorDiv(x0 + (x1 - x0) * t, TILE_SIZE);
    const ty = floorDiv(y0 + (y1 - y0) * t, TILE_SIZE);

    if (!isWalkable(terrainAt(seed, tx, ty))) return false;
  }
  return true;
}

/**
 * Un tick de flânerie autour de `home` (la porte) : marcher, à petite allure,
 * vers le point en cours ; arrivé, souffler un moment, puis tirer le point
 * suivant. Le hasard est un hachage de la seed, de l'ouvrier et du tick —
 * déterministe, sans toucher au PRNG du monde. Pas de chemin : un point dont
 * la ligne droite passerait par l'eau est simplement refusé, et l'ouvrier
 * reste où il est jusqu'au tirage suivant.
 */
export function wander(
  walker: (Worker | Lumberjack | Forester | Farmer) & Wandering,
  home: { x: number; y: number },
  seed: number,
  tick: number,
  stepSeconds: number,
  onRoad?: RoadTest,
): void {
  const range = WANDER.radius * TILE_SIZE;

  // Trop loin de chez lui — il rentre d'un job — : il revient d'abord à sa porte.
  if (distanceSq(walker.wanderX, walker.wanderY, home.x, home.y) > range * range) {
    walker.wanderX = home.x;
    walker.wanderY = home.y;
    walker.wanderTicks = 0;
  }

  if (walker.wanderTicks > 0) {
    walker.wanderTicks -= 1;
    standStill(walker);
    return;
  }

  // Il rentre d'un job d'un bon pas ; il ne traîne les pieds qu'une fois devant chez lui.
  const far = distanceSq(walker.x, walker.y, home.x, home.y) > range * range;

  if (!walkToward(walker, walker.wanderX, walker.wanderY, far ? stepSeconds : stepSeconds * WANDER.pace, onRoad)) return;

  const roll = (salt: number): number => hash3(seed ^ walker.id, tick, salt) / 4294967296;
  const angle = roll(1) * Math.PI * 2;
  const distance = (0.3 + roll(2) * 0.7) * range;
  const x = home.x + Math.cos(angle) * distance;
  // Aplati vers le bas : il flâne devant sa porte, pas sur son toit.
  const y = home.y + Math.abs(Math.sin(angle)) * distance * 0.7;

  walker.wanderTicks = WANDER.pauseTicks + Math.floor(roll(3) * WANDER.pauseJitter);
  if (clearLine(seed, walker.x, walker.y, x, y)) {
    walker.wanderX = x;
    walker.wanderY = y;
  }
}

/** Un ouvrier tout juste logé : il flâne à partir de sa porte. */
export function wanderFrom(x: number, y: number): Wandering {
  return { wanderX: x, wanderY: y, wanderTicks: 0 };
}
