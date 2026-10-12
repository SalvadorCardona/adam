import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, RARE_BUILDINGS, STATS, TROPHY_IDS } from './achievements.ts';
import { BUILDINGS } from './buildings.ts';
import { PIECES } from './wardrobe.ts';

describe('succès', () => {
  it('sont une trentaine, de toutes les difficultés', () => {
    expect(ACHIEVEMENT_IDS.length).toBeGreaterThanOrEqual(25);
    expect(ACHIEVEMENT_IDS.length).toBeLessThanOrEqual(32);
    for (const tier of ['first', 'progress', 'challenge', 'secret']) {
      expect(ACHIEVEMENT_IDS.some((id) => ACHIEVEMENTS[id].tier === tier), tier).toBe(true);
    }
  });

  it('lisent une statistique qui existe, avec un but atteignable', () => {
    for (const id of ACHIEVEMENT_IDS) {
      expect(Object.hasOwn(STATS, ACHIEVEMENTS[id].stat), id).toBe(true);
      expect(ACHIEVEMENTS[id].goal, id).toBeGreaterThan(0);
    }
  });

  it('ne donnent que des pièces à trouver, jamais deux fois la même, et chaque trophée une fois', () => {
    const skins: string[] = [];
    const trophies: string[] = [];

    for (const id of ACHIEVEMENT_IDS) {
      const reward = (ACHIEVEMENTS[id] as { reward?: { skin?: keyof typeof PIECES; trophy?: string } }).reward;

      if (reward?.skin) {
        expect((PIECES[reward.skin] as { starter?: boolean }).starter, id).toBeUndefined();
        skins.push(reward.skin);
      }
      if (reward?.trophy) trophies.push(reward.trophy);
    }
    expect(new Set(skins).size).toBe(skins.length);
    expect(new Set(trophies).size).toBe(trophies.length);
    expect([...trophies].sort()).toEqual([...TROPHY_IDS].sort());
  });

  it('comptent tous les bâtiments rares, qui existent', () => {
    expect(ACHIEVEMENTS.rares.goal).toBe(RARE_BUILDINGS.length);
    for (const id of RARE_BUILDINGS) expect(Object.hasOwn(BUILDINGS, id), id).toBe(true);
  });
});
