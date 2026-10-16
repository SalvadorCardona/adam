import { beforeAll, describe, expect, it } from 'vitest';
import { runPlaytests } from '../tools/playtestPool.ts';
import { playtest, type PlaytestReport } from './playtest.ts';

/*
 * Le joueur simulé sur cinq graines, jusqu'au crépuscule de la nuit 5 (une
 * vingtaine de minutes de jeu) : des invariants que la stratégie de base doit
 * tenir sur n'importe quelle graine. Les parties tournent de front, dans des
 * fils Node (`tools/playtestPool.ts`). Le détail des chiffres se lit avec
 * `npm run playtest` (voir `src/tools/README.md`).
 */

const SEEDS = [1, 2, 3, 4, 5];
const NIGHT = 5;

describe('joueur simulé', () => {
  let reports: PlaytestReport[] = [];

  // Et deux fois la même courte partie : la seconde doit redonner la première.
  let replays: PlaytestReport[] = [];

  beforeAll(async () => {
    const jobs = [...SEEDS.map((seed) => ({ seed, minutes: 25, untilNight: NIGHT })), { seed: 7, minutes: 6 }, { seed: 7, minutes: 6 }];

    reports = await runPlaytests(jobs);
    replays = reports.splice(SEEDS.length);
  }, 60_000);

  it.each(SEEDS.map((seed, i) => [seed, i] as const))('graine %i : mairie, chapitres, morts, nuits', (seed, i) => {
    const report = reports[i]!;
    const chapter2 = report.milestones.chapters.find((chapter) => chapter.index === 1);
    const night4 = report.nights[4];

    // La mairie bâtie : le chapitre 1.
    expect(report.milestones.townHall, `graine ${seed}`).not.toBeNull();
    // Pas un mort de soif quand un puits avait de l'eau.
    expect(report.deaths.list.filter((death) => death.wellHadWater), `graine ${seed}`).toEqual([]);
    // Les fondations avant la nuit 4.
    expect(chapter2, `graine ${seed}`).toBeDefined();
    expect(night4 === undefined || chapter2!.gameSeconds < night4, `graine ${seed} : chapitre 2 à ${chapter2?.gameSeconds} s, nuit 4 à ${night4} s`).toBe(true);
    // La mairie debout quand tombe la nuit 5.
    expect(report.fallNight, `graine ${seed}`).toBeNull();
    expect(report.nights[NIGHT], `graine ${seed} : la nuit ${NIGHT} n'est pas tombée`).toBeDefined();
  });

  it('le rapport dit les jalons, les vagues et le temps sans rien à faire', () => {
    const [report] = reports;

    expect(report!.milestones.chapters[0]!.index).toBe(0);
    expect(report!.waves.map((wave) => wave.night)).toEqual([1, 2, 3, 4]);
    for (const wave of report!.waves) expect(wave.hallHp).toBeGreaterThan(0);
    expect(report!.idleSeconds).toBe(report!.activity.idle + report!.activity.stockpile);
  });

  it('la variante AFK bâtit la mairie, puis ne bouge plus', () => {
    const report = playtest({ seed: 1, minutes: 3, strategy: 'afk' });

    expect(report.milestones.townHall).not.toBeNull();
    expect(report.activity.gather + report.activity.deliver + report.activity.place + report.activity.guard).toBeLessThanOrEqual(report.milestones.townHall!.gameSeconds + 1);
  });

  it('est déterministe : la même graine rejoue la même partie', () => {
    const strip = (report: PlaytestReport): string => JSON.stringify(report, (key, value: unknown) => (key === 'wallMs' ? 0 : value));

    expect(strip(replays[1]!)).toBe(strip(replays[0]!));
  });
});
