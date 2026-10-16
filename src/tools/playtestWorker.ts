/**
 * Un fil du joueur simulé (`playtestPool.ts`) : ses parties, l'une après
 * l'autre, chaque rapport renvoyé dès qu'il est prêt.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { playtest } from '../sim/playtest.ts';
import type { PlaytestJob } from './playtestPool.ts';

for (const job of workerData as PlaytestJob[]) parentPort!.postMessage(playtest(job));
