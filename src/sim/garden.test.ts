import { describe, expect, it } from 'vitest';
import { PERKS, PERK_IDS, SEED_REWARDS, seedsFor, type ColonyScore } from '../data/perks.ts';
import {
  EMPTY_GARDEN,
  GARDEN_VERSION,
  activePerks,
  canPlant,
  decodeGarden,
  encodeGarden,
  harvestSeeds,
  plant,
} from './garden.ts';

const NONE: ColonyScore = { waves: 0, children: 0, buildings: 1, bases: 0, population: 0, minutes: 0, victory: false };

describe('jardin des souvenirs', () => {
  it('le barème paie la victoire, les bases abattues, la population et le temps', () => {
    const base = seedsFor(NONE);

    expect(seedsFor({ ...NONE, victory: true })).toBe(base + SEED_REWARDS.victory);
    expect(seedsFor({ ...NONE, bases: 2 })).toBe(base + 2 * SEED_REWARDS.perBase);
    expect(seedsFor({ ...NONE, population: 7 })).toBe(base + 2 * SEED_REWARDS.perPopulationStep);
    expect(seedsFor({ ...NONE, minutes: 25 })).toBe(base + 2 * SEED_REWARDS.perMinutesStep);
    expect(seedsFor({ ...NONE, minutes: 100000 })).toBe(base + SEED_REWARDS.maxTimeSeeds);
  });

  it('une colonie refondée après le Signal repart avec ses bonus, et les graines survivent', () => {
    const score = { ...NONE, waves: 10, victory: true };
    let garden = harvestSeeds({ ...EMPTY_GARDEN }, seedsFor(score));

    garden = plant(garden, 'woodStart');
    expect(garden.planted).toEqual(['woodStart']);
    expect(activePerks(decodeGarden(encodeGarden(garden)))).toEqual(['woodStart']);
  });

  it('une défaite rapporte toujours des graines, et plus quand la colonie a tenu', () => {
    const worst = seedsFor(NONE);
    const better = seedsFor({ ...NONE, waves: 3, children: 1, buildings: 4 });

    expect(worst).toBeGreaterThan(0);
    expect(better).toBeGreaterThan(worst);
  });

  it('planter coûte des graines et ne se fait qu’une fois', () => {
    const cost = PERKS.woodStart.cost;
    let garden = harvestSeeds({ ...EMPTY_GARDEN }, cost * 2);

    garden = plant(garden, 'woodStart');
    expect(garden.seeds).toBe(cost);
    expect(garden.planted).toEqual(['woodStart']);
    expect(canPlant(garden, 'woodStart')).toBe(false);
    expect(plant(garden, 'woodStart')).toBe(garden);
  });

  it('refuse de planter sans assez de graines', () => {
    const garden = harvestSeeds({ ...EMPTY_GARDEN }, PERKS.freeTower.cost - 1);

    expect(canPlant(garden, 'freeTower')).toBe(false);
    expect(plant(garden, 'freeTower')).toBe(garden);
  });

  it('« Partie pure » met les bonus de côté sans les perdre', () => {
    const garden = { seeds: 0, planted: [...PERK_IDS], pure: false };

    expect(activePerks(garden)).toEqual(PERK_IDS);
    expect(activePerks({ ...garden, pure: true })).toEqual([]);
  });

  it('se relit tel qu’il a été écrit', () => {
    const garden = { seeds: 7, planted: ['bigBag' as const, 'sharpAxe' as const], pure: true };

    expect(decodeGarden(encodeGarden(garden))).toEqual(garden);
  });

  it('un jardin illisible, d’une autre version ou retouché redevient vide sans lever', () => {
    expect(decodeGarden('{"version":')).toEqual(EMPTY_GARDEN);
    expect(decodeGarden(JSON.stringify({ version: GARDEN_VERSION + 1, garden: { seeds: 3, planted: [], pure: false } }))).toEqual(
      EMPTY_GARDEN,
    );
    expect(decodeGarden(JSON.stringify({ version: GARDEN_VERSION, garden: { seeds: -4, planted: [], pure: false } }))).toEqual(
      EMPTY_GARDEN,
    );
  });

  it('un bonus disparu du jeu est oublié, les autres restent', () => {
    const text = JSON.stringify({ version: GARDEN_VERSION, garden: { seeds: 2, planted: ['bigBag', 'jetpack'], pure: false } });

    expect(decodeGarden(text)).toEqual({ seeds: 2, planted: ['bigBag'], pure: false });
  });
});
