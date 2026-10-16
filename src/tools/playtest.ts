/**
 * Le joueur simulé, en série : des parties jouées par le bot de
 * `sim/playtest.ts`, sans rendu, et leur résumé en tableau.
 *
 *   npm run playtest -- --seeds 50 --minutes 60
 *   npm run playtest -- --seeds 20 --strategy afk --json rapports.json
 *
 * Options :
 * - `--seeds N` : nombre de parties (10) ; `--from S` : première graine (1),
 *   les suivantes à la suite ; `--random` : une première graine au hasard ;
 * - `--minutes M` : minutes de jeu par partie (60) ;
 * - `--strategy base|afk|both` : le joueur qui suit les objectifs, celui qui
 *   ne fait plus rien après la mairie, ou les deux (`base`) ;
 * - `--json fichier` : écrit tous les rapports, un par partie ;
 * - `--jobs J` : parties menées de front, une par fil (le nombre de cœurs) :
 *   `playtestPool.ts`.
 *
 * Le tableau donne, par mesure, la médiane, le 10e et le 90e centile sur les
 * parties où elle existe, et combien en ont une (`n`) : « Chapitre 3 » n'a de
 * temps que pour les parties qui l'ont fini. Voir `src/tools/README.md`.
 */

import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import { CHAPTERS } from '../data/objectives.ts';
import type { PlaytestOptions, PlaytestReport, Strategy } from '../sim/playtest.ts';
import { runPlaytests } from './playtestPool.ts';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      seeds: { type: 'string', default: '10' },
      from: { type: 'string', default: '1' },
      random: { type: 'boolean', default: false },
      minutes: { type: 'string', default: '60' },
      strategy: { type: 'string', default: 'base' },
      json: { type: 'string' },
      jobs: { type: 'string', default: String(availableParallelism()) },
    },
  });
  const seeds = Number(values.seeds);
  const minutes = Number(values.minutes);
  const from = values.random ? Math.floor(Math.random() * 1_000_000) : Number(values.from);
  const strategies: Strategy[] = values.strategy === 'both' ? ['base', 'afk'] : [values.strategy as Strategy];

  if (!Number.isInteger(seeds) || seeds < 1 || !(minutes > 0) || strategies.some((s) => s !== 'base' && s !== 'afk')) {
    console.error('Usage : npm run playtest -- --seeds 50 --minutes 60 [--strategy base|afk|both] [--from 1] [--json rapports.json]');
    process.exit(1);
  }

  const jobs: PlaytestOptions[] = strategies.flatMap((strategy) => Array.from({ length: seeds }, (_, i) => ({ seed: from + i, strategy, minutes })));
  const started = performance.now();

  console.log(`${jobs.length} parties de ${minutes} min, graines ${from} à ${from + seeds - 1}, ${strategies.join(' et ')}…`);

  const reports = await runPlaytests(jobs, Number(values.jobs), (done) => process.stdout.write(`\r${done}/${jobs.length}`));

  process.stdout.write('\n');
  reports.sort((a, b) => a.strategy.localeCompare(b.strategy) || a.seed - b.seed);
  for (const strategy of strategies) {
    const runs = reports.filter((report) => report.strategy === strategy);

    console.log(`\n## Stratégie « ${strategy} » — ${runs.length} parties de ${minutes} min\n`);
    console.log(table(summarize(runs)));
  }
  console.log(`\nTemps réel : ${((performance.now() - started) / 1000).toFixed(1)} s`);
  if (values.json) {
    writeFileSync(values.json, `${JSON.stringify(reports, null, 2)}\n`);
    console.log(`Rapports écrits dans ${values.json}`);
  }
}

/* ------------------------------------------------------------------ résumé */

interface Row {
  label: string;
  values: number[];
  /** Sur combien de parties la mesure pouvait exister. */
  of: number;
  unit: string;
}

const minutesOf = (seconds: number): number => seconds / 60;

function summarize(runs: PlaytestReport[]): Row[] {
  const rows: Row[] = [];
  const of = runs.length;
  const row = (label: string, unit: string, values: (number | null | undefined)[]): void => {
    rows.push({ label, unit, of, values: values.filter((value): value is number => value !== null && value !== undefined) });
  };

  row('Mairie bâtie', 'min', runs.map((run) => run.milestones.townHall && minutesOf(run.milestones.townHall.gameSeconds)));

  const lastChapter = Math.max(-1, ...runs.flatMap((run) => run.milestones.chapters.map((chapter) => chapter.index)));

  for (let index = 0; index <= lastChapter; index += 1) {
    row(
      `Chapitre ${index + 1} fini (${CHAPTERS[index]?.title ?? '?'})`,
      'min',
      runs.map((run) => {
        const done = run.milestones.chapters.find((chapter) => chapter.index === index);

        return done && minutesOf(done.gameSeconds);
      }),
    );
  }
  row('Arrivée d’Ève', 'min', runs.map((run) => run.milestones.eve && minutesOf(run.milestones.eve.gameSeconds)));
  row('Première naissance', 'min', runs.map((run) => run.milestones.firstBirth && minutesOf(run.milestones.firstBirth.gameSeconds)));
  row('Morts (toutes causes)', '', runs.map((run) => run.deaths.total));
  row('Morts de faim', '', runs.map((run) => run.deaths.byCause.hunger ?? 0));
  row('Morts de soif', '', runs.map((run) => run.deaths.byCause.thirst ?? 0));
  row('… de soif, un puits plein', '', runs.map((run) => run.deaths.list.filter((death) => death.wellHadWater).length));
  row('Première mort, nuit', '', runs.map((run) => run.deaths.list[0]?.night));
  row('Adam à terre', 'fois', runs.map((run) => run.playerKnockouts));
  row('Nuits tenues', '', runs.map((run) => run.final.nightsSurvived));
  row('Mairie tombée, nuit', '', runs.map((run) => run.fallNight));

  const lastNight = Math.max(0, ...runs.flatMap((run) => run.waves.map((wave) => wave.night)));

  for (let night = 1; night <= lastNight; night += 1) {
    const waves = runs.map((run) => run.waves.find((wave) => wave.night === night));

    row(`Nuit ${night} : effectif de la vague`, '', waves.map((wave) => wave?.count));
    row(`Nuit ${night} : PV de la mairie à l’aube`, '%', waves.map((wave) => wave && (100 * wave.hallHp) / wave.hallMaxHp));
  }
  row('Sans rien à faire', 'min', runs.map((run) => minutesOf(run.idleSeconds)));
  row('Ouvriers à la fin', '', runs.map((run) => run.final.workers));
  row('Bâtiments à la fin', '', runs.map((run) => run.final.buildings));
  row('Temps réel par partie', 's', runs.map((run) => run.wallMs / 1000));
  return rows;
}

/** Le centile `p` (0 à 100) d'une liste, par interpolation linéaire. */
export function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = ((sorted.length - 1) * p) / 100;
  const low = Math.floor(at);
  const high = Math.ceil(at);

  return sorted[low]! + (sorted[high]! - sorted[low]!) * (at - low);
}

function table(rows: Row[]): string {
  const format = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  const lines = rows.map((row) => {
    const stat = (p: number): string => (row.values.length > 0 ? format(percentile(row.values, p)) : '—');

    return [row.label, row.unit, stat(50), stat(10), stat(90), `${row.values.length}/${row.of}`];
  });
  const header = ['Mesure', 'unité', 'médiane', 'p10', 'p90', 'n'];
  const widths = header.map((title, i) => Math.max(title.length, ...lines.map((line) => line[i]!.length)));
  const render = (cells: string[]): string => `| ${cells.map((cell, i) => (i < 2 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!))).join(' | ')} |`;

  const rule = `| ${widths.map((width, i) => (i < 2 ? '-'.repeat(width) : `${'-'.repeat(width - 1)}:`)).join(' | ')} |`;

  return [render(header), rule, ...lines.map(render)].join('\n');
}

await main();
