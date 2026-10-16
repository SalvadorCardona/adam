/**
 * Des parties du joueur simulé menées de front, une file par fil
 * (`worker_threads`) : le monde ne tourne que sur un cœur, et cinquante
 * parties d'une heure prendraient sinon de longues minutes.
 *
 * Les fils chargent `playtestWorker.ts` tel quel, par Node (qui efface les
 * types) : sous Vitest aussi, la simulation y tourne sans la transformation
 * des modules, qui la ralentit de moitié. C'est ce qui garde le test court
 * (`sim/playtest.test.ts`) sous les 20 s.
 */

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { PlaytestOptions, PlaytestReport } from '../sim/playtest.ts';

/** Ce qu'un fil reçoit : ses parties, jouées l'une après l'autre. */
export type PlaytestJob = Omit<PlaytestOptions, 'now'>;

/**
 * Joue toutes les parties sur `threads` fils au plus (le nombre de cœurs par
 * défaut) et rend leurs rapports dans l'ordre des parties. `progress` est
 * appelé à chaque partie finie, avec le nombre de parties finies.
 */
export function runPlaytests(jobs: readonly PlaytestJob[], threads = availableParallelism(), progress?: (done: number) => void): Promise<PlaytestReport[]> {
  const count = Math.max(1, Math.min(threads, jobs.length));
  const shares = Array.from({ length: count }, (_, i) => jobs.map((job, index) => ({ job, index })).filter(({ index }) => index % count === i));
  const reports: PlaytestReport[] = new Array<PlaytestReport>(jobs.length);
  let done = 0;

  return new Promise((resolve, reject) => {
    let running = shares.length;

    for (const share of shares) {
      const worker = new Worker(new URL('./playtestWorker.ts', import.meta.url), { workerData: share.map(({ job }) => job) });
      let next = 0;

      worker.on('message', (report: PlaytestReport) => {
        reports[share[next]!.index] = report;
        next += 1;
        done += 1;
        progress?.(done);
      });
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`fil du joueur simulé arrêté (code ${code})`));
        running -= 1;
        if (running === 0) resolve(reports);
      });
    }
  });
}
