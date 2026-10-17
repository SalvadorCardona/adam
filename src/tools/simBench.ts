/**
 * Le banc de la simulation : une ville de 60 habitants rejouée deux jours et
 * deux nuits de vague, sans rendu, chronométrée tick par tick.
 *
 *   npm run bench:sim -- [--runs 3] [--ticks 12200]
 *
 * Donne les ms par tick (moyenne, de jour, de nuit) et les réveils du
 * scheduler par tick (`World.wakesLastTick`), comme le compteur de
 * performances du jeu, puis une empreinte du rejeu : `World.checksum` de
 * chaque tick, les événements émis et l'état final sauvegardé. Deux versions
 * du code qui ont la même empreinte se sont comportées pareil.
 */

import { parseArgs } from 'node:util';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import { TEST_SCENARIOS, type TestScenarioProto } from '../data/testScenario.ts';
import { CYCLE_TICKS } from '../sim/dayNight.ts';
import { stageScenario } from '../sim/testScenario.ts';
import { World } from '../sim/world.ts';

const SCENARIO: TestScenarioProto = {
  ...TEST_SCENARIOS.base,
  research: ['militia', 'fortification'],
  town: { wood: 400, stone: 300, food: 600, water: 600, ironPlate: 40 },
};

/** Ce que la ville du banc a en plus de la petite base, posé au plus près de la mairie. */
const EXTRA: readonly BuildingId[] = ['home', 'home', 'home', 'home', 'watchtower', 'watchtower', 'archerTower', 'barracks'];

const COLONISTS = 60;

/** La ville du banc : le scénario, 60 ouvriers, la nuit 6, Adam devant la mairie. */
function benchWorld(): World {
  const staged = stageScenario(SCENARIO);
  const hall = staged.entities.get(staged.townHallId)!;

  for (const building of EXTRA) build(staged, building, hall.tx, hall.ty);

  const state = staged.snapshot();

  state.colonists = COLONISTS;
  // La nuit 6 : des vagues fournies, un gros mutant.
  state.cycleStartTick -= 5 * CYCLE_TICKS;

  const world = World.restore(state);
  const x = (hall.tx + hall.width / 2) * TILE_SIZE;
  const y = (hall.ty + hall.height + 1) * TILE_SIZE;

  Object.assign(world.player, { x, y, prevX: x, prevY: y });
  return world;
}

/** Pose `building` à la première place libre autour de (hx, hy), et le bâtit avec le sac d'Adam. */
function build(world: World, building: BuildingId, hx: number, hy: number): void {
  const { width, height, cost } = BUILDINGS[building];

  for (let ring = 6; ring < 30; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;

        const tx = hx + dx;
        const ty = hy + dy;

        stand(world, tx, ty, width, height);
        if (world.canPlace(building, tx, ty) !== null) continue;

        const before = new Set(world.entities.keys());

        world.push({ type: 'placeBuilding', building, tx, ty });
        world.tick();

        const id = [...world.entities.keys()].find((key) => !before.has(key))!;

        for (const [item, amount] of Object.entries(cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
        world.push({ type: 'transferToSite', id });
        world.tick();
        return;
      }
    }
  }
  throw new Error(`banc : pas de place pour ${building}`);
}

function stand(world: World, tx: number, ty: number, width: number, height: number): void {
  const x = (tx + width / 2) * TILE_SIZE;
  const y = (ty + height + 0.5) * TILE_SIZE;

  Object.assign(world.player, { x, y, prevX: x, prevY: y });
}

function hashText(text: string, hash = 0x811c9dc5): number {
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}

interface Run {
  ms: number;
  dayMs: number;
  dayTicks: number;
  nightMs: number;
  nightTicks: number;
  wakes: number;
  print: string;
  foes: number;
}

function run(ticks: number): Run {
  const world = benchWorld();
  const barracks = [...world.entities.values()].find((entity) => entity.kind === 'barracks');
  let events = 0x811c9dc5;
  let sums = 0x811c9dc5;
  const emit = world.events.emit.bind(world.events);

  world.events.emit = (event, payload) => {
    events = hashText(`${String(event)}:${JSON.stringify(payload) ?? ''}`, events);
    emit(event, payload);
  };

  const result: Run = { ms: 0, dayMs: 0, dayTicks: 0, nightMs: 0, nightTicks: 0, wakes: 0, print: '', foes: 0 };

  for (let tick = 0; tick < ticks; tick += 1) {
    // Une armée à recruter, une formation à la fois : flèches, compagnons et cibles ont de quoi faire.
    if (barracks && tick % 400 === 0) world.push({ type: 'recruitCompanion', barracks: barracks.id, role: tick % 800 === 0 ? 'archer' : 'warrior' });

    const start = performance.now();

    world.tick();

    const ms = performance.now() - start;
    const phase = world.clock()?.phase;

    result.ms += ms;
    result.wakes += world.wakesLastTick();
    if (phase === 'night') {
      result.nightMs += ms;
      result.nightTicks += 1;
    } else {
      result.dayMs += ms;
      result.dayTicks += 1;
    }
    let foes = 0;

    for (const mobile of world.mobiles.values()) if (mobile.kind === 'mutant') foes += 1;
    result.foes = Math.max(result.foes, foes);
    sums = hashText(String(world.checksum()), sums);
  }

  const people = [...world.mobiles.values()].filter((mobile) => mobile.kind !== 'mutant').length;
  const state = hashText(JSON.stringify(world.snapshot()));

  result.print = `checksums ${sums.toString(16)} · événements ${events.toString(16)} · état ${state.toString(16)} · nuit ${world.night} · mobiles ${people} · mutants au plus ${result.foes} · défaite ${world.defeated}`;
  return result;
}

const { values } = parseArgs({ options: { runs: { type: 'string', default: '3' }, ticks: { type: 'string', default: '12200' } } });
const runs = Number(values.runs);
const ticks = Number(values.ticks);
const results: Run[] = [];

for (let i = 0; i < runs; i += 1) {
  const result = run(ticks);

  results.push(result);
  console.log(
    `#${i + 1} ${(result.ms / ticks).toFixed(3)} ms/tick · jour ${(result.dayMs / result.dayTicks).toFixed(3)} · nuit ${(result.nightMs / result.nightTicks).toFixed(3)} · ${(result.wakes / ticks).toFixed(2)} réveils/tick`,
  );
}

const best = results.reduce((a, b) => (b.ms < a.ms ? b : a));

console.log(`meilleur : ${(best.ms / ticks).toFixed(3)} ms/tick, nuit ${(best.nightMs / best.nightTicks).toFixed(3)} ms/tick (${best.nightTicks} ticks)`);
console.log(results[0]!.print);
if (results.some((result) => result.print !== results[0]!.print)) console.log('ATTENTION : empreintes différentes d’un passage à l’autre');
