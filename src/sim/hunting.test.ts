import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../data/buildings.ts';
import { COLONY } from '../data/inhabitants.ts';
import type { ItemId } from '../data/items.ts';
import { HUNTING } from '../data/needs.ts';
import { World } from './world.ts';

function withTown(seed = 11): World {
  const world = new World(seed);

  for (const [item, amount] of Object.entries(BUILDINGS.townHall.cost) as [ItemId, number][]) {
    world.player.inventory.add(item, amount);
  }
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();
  if (!world.townStock()) throw new Error('la mairie ne s’est pas achevée');
  return world;
}

describe('chasse', () => {
  it('la viande déposée à la mairie devient de la nourriture', () => {
    const world = withTown();
    const town = world.townStock()!;
    const food = town.count('food');

    expect(food).toBe(COLONY.startingStock.food);
    town.add('meat', 3);
    for (let i = 0; i < HUNTING.convertTicks; i += 1) world.tick();

    expect(town.count('meat')).toBe(0);
    expect(town.count('food')).toBe(food + 3 * HUNTING.foodPerMeat);
  });

  it('la viande réservée à un job n’est pas convertie', () => {
    const world = withTown();
    const town = world.townStock()!;

    town.add('meat', 3);
    town.reserveOut('meat', 2);
    for (let i = 0; i < HUNTING.convertTicks; i += 1) world.tick();

    expect(town.count('meat')).toBe(2);
  });

  it('la ferme est au menu dès le départ : la chasse seule ne suit pas la population', () => {
    expect(BUILDINGS.farm.menu).toBe(true);
    expect(withTown().inMenu('farm')).toBe(true);
  });
});
