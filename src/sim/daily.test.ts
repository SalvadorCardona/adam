import { describe, expect, it } from 'vitest';
import { DAILY_MOD_IDS, DAILY_MODS } from '../data/dailyMods.ts';
import { COLONY } from '../data/inhabitants.ts';
import { dailyDate, dailyGame, dailyMod, dailySeed, isDailyDate } from './daily.ts';
import { decodeSave, encodeSave } from './save.ts';
import { World } from './world.ts';

describe('la carte du jour', () => {
  it('lit la date UTC, pas celle du fuseau', () => {
    expect(dailyDate(Date.UTC(2026, 9, 17, 23, 59, 59))).toBe('2026-10-17');
    expect(dailyDate(Date.UTC(2026, 9, 18, 0, 0, 0))).toBe('2026-10-18');
  });

  it('reconnaît une vraie date de calendrier', () => {
    expect(isDailyDate('2026-10-17')).toBe(true);
    expect(isDailyDate('2026-02-30')).toBe(false);
    expect(isDailyDate('17/10/2026')).toBe(false);
    expect(() => dailySeed('2026-02-30')).toThrow();
  });

  it('donne la même graine et le même modificateur à tous le même jour', () => {
    // Deux joueurs, deux fuseaux, un seul jour UTC.
    const morning = dailyDate(Date.UTC(2026, 9, 17, 0, 5));
    const evening = dailyDate(Date.UTC(2026, 9, 17, 23, 55));

    expect(dailySeed(morning)).toBe(dailySeed(evening));
    expect(dailyMod(morning)).toBe(dailyMod(evening));
    expect(dailyGame(morning)).toEqual(dailyGame(evening));
    expect(dailySeed('2026-10-17')).toBe(dailySeed('2026-10-17'));
  });

  it('change de carte d’un jour à l’autre, et tire tous les modificateurs sur l’année', () => {
    const seeds = new Set<number>();
    const mods = new Set<string>();

    for (let day = 0; day < 365; day += 1) {
      const date = dailyDate(Date.UTC(2026, 0, 1 + day));

      seeds.add(dailySeed(date));
      mods.add(dailyMod(date));
    }
    expect(seeds.size).toBe(365);
    expect(mods.size).toBe(DAILY_MOD_IDS.length);
  });

  it('applique le modificateur du jour : Colonie de 6, sauvegardée et relue', () => {
    const world = World.newColony(dailySeed('2026-10-17'), { date: '2026-10-17', mod: 'smallColony' });
    const decoded = decodeSave(encodeSave(world, 0));

    expect(world.colonists).toBe(DAILY_MODS.smallColony.startingWorkers);
    expect(world.colonists).toBeLessThan(COLONY.startingWorkers);
    expect(decoded.ok && decoded.world.dailyMap).toEqual({ date: '2026-10-17', mod: 'smallColony' });
    expect(decoded.ok && decoded.world.colonists).toBe(6);
  });

  it('passe les statistiques du modificateur par World.bonus', () => {
    const plain = World.newColony(1);
    const scarce = World.newColony(1, { date: '2026-10-17', mod: 'scarceWood' });

    expect(plain.bonus('woodYield')).toBe(0);
    expect(scarce.bonus('woodYield')).toBe(-0.5);
    expect(plain.dailyMap).toBeNull();
  });
});
