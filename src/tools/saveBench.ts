/**
 * Le banc de la sauvegarde : le joueur simulé joue une partie (2 h par
 * défaut) et, toutes les cinq minutes de jeu, on chronomètre ce que coûte
 * une sauvegarde automatique — `World.snapshot()`, `JSON.stringify` — et on
 * pèse le texte écrit. Le rapport garde le pire palier : la partie la plus
 * lourde avant la fin, ou avant la chute de la mairie.
 *
 *   npm run bench:save -- [--seed 1] [--minutes 120] [--runs 20] [--explore 0]
 *
 * `--explore R` explore en plus un disque de R tuiles autour d'Adam à la fin :
 * le bot reste près de la mairie, un joueur parcourt la carte.
 *
 * Node est plus rapide qu'un téléphone : compter trois à cinq fois plus sur
 * un mobile d'entrée de gamme. `localStorage.setItem` n'existe pas ici ; le
 * panneau `?debug` du jeu donne le temps complet, écriture comprise.
 */

import { parseArgs } from 'node:util';
import { TILE_SIZE } from '../core/grid.ts';
import { SAVE_VERSION, type SaveFile } from '../sim/save.ts';
import { PlaytestBot } from '../sim/playtest.ts';
import { TICKS_PER_SECOND, World } from '../sim/world.ts';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    minutes: { type: 'string', default: '120' },
    runs: { type: 'string', default: '20' },
    explore: { type: 'string', default: '0' },
  },
});

const seed = Number(values.seed);
const minutes = Number(values.minutes);
const runs = Number(values.runs);
const explore = Number(values.explore);
const STEP_MINUTES = 5;

interface Sample {
  minute: number;
  bytes: number;
  snapshotMs: number;
  stringifyMs: number;
  text: string;
}

const median = (list: number[]): number => [...list].sort((x, y) => x - y)[Math.floor(list.length / 2)]!;

/** Le coût d'une sauvegarde du monde tel qu'il est : médianes sur `runs` essais. */
function measure(world: World, minute: number): Sample {
  const snapshots: number[] = [];
  const strings: number[] = [];
  let text = '';

  for (let run = 0; run < runs; run += 1) {
    const a = performance.now();
    const file: SaveFile = { version: SAVE_VERSION, savedAt: Date.now(), state: world.snapshot() };
    const b = performance.now();

    text = JSON.stringify(file);
    snapshots.push(b - a);
    strings.push(performance.now() - b);
  }
  return { minute, bytes: text.length, snapshotMs: median(snapshots), stringifyMs: median(strings), text };
}

const bot = new PlaytestBot(World.newColony(seed), { seed });
const { world } = bot;
let worst: Sample | null = null;

for (let minute = STEP_MINUTES; minute <= minutes; minute += STEP_MINUTES) {
  bot.run(STEP_MINUTES * 60 * TICKS_PER_SECOND);
  if (world.defeated) break;

  const sample = measure(world, minute);

  if (!worst || sample.bytes >= worst.bytes) worst = sample;
}

if (explore > 0 && worst) {
  // Le palier le plus lourd, relu : la partie a pu tomber depuis.
  const heavy = World.restore((JSON.parse(worst.text) as SaveFile).state);

  heavy.fog.reveal(Math.floor(heavy.player.x / TILE_SIZE), Math.floor(heavy.player.y / TILE_SIZE), explore);
  worst = measure(heavy, worst.minute);
}

if (!worst) {
  console.log(`graine ${seed} : la mairie est tombée avant ${STEP_MINUTES} min, rien à mesurer.`);
  process.exit(0);
}

const ms = (value: number): string => `${value.toFixed(2)} ms`;
const state = (JSON.parse(worst.text) as SaveFile).state as unknown as Record<string, unknown>;
const parts = Object.entries(state)
  .map(([key, value]) => [key, JSON.stringify(value)?.length ?? 0] as const)
  .sort((x, y) => y[1] - x[1])
  .slice(0, 6);

console.log(`graine ${seed}, palier le plus lourd : ${worst.minute} min de jeu${world.defeated ? ' (mairie tombée ensuite)' : ''}${explore > 0 ? `, ${explore} tuiles explorées en plus` : ''}`);
console.log(`taille : ${(worst.bytes / 1024).toFixed(1)} ko`);
console.log(`snapshot : ${ms(worst.snapshotMs)}, stringify : ${ms(worst.stringifyMs)} (médianes de ${runs})`);
console.log(`plus gros champs : ${parts.map(([key, size]) => `${key} ${(size / 1024).toFixed(1)} ko`).join(', ')}`);
