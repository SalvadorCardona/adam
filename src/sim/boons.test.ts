import { describe, expect, it } from 'vitest';
import { BOON_IDS, BOON_OFFER, BOONS, type BoonId } from '../data/boons.ts';
import { drawBoons } from './boons.ts';
import { deserialize, serialize } from './save.ts';
import { World } from './world.ts';

/** La mairie bâtie, puis le temps jusqu'à la première aube. */
function firstDawn(seed = 1): World {
  const world = new World(seed);

  world.player.inventory.add('wood', 25);
  world.player.inventory.add('stone', 12);
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();
  while (world.clock()?.phase !== 'night') world.tick();
  while (world.clock()?.phase !== 'dawn') world.tick();
  world.tick();
  return world;
}

describe('faveurs de l’aube', () => {
  it('trois faveurs distinctes, tirées de la seed et de la nuit', () => {
    for (let night = 1; night < 30; night += 1) {
      const choices = drawBoons(42, night);

      expect(choices).toHaveLength(BOON_OFFER.choices);
      expect(new Set(choices).size).toBe(BOON_OFFER.choices);
      expect(drawBoons(42, night)).toEqual(choices);
    }
    // Sur une partie, toutes finissent par sortir.
    const seen = new Set<BoonId>();

    for (let night = 1; night < 40; night += 1) for (const id of drawBoons(7, night)) seen.add(id);
    expect(seen.size).toBe(BOON_IDS.length);
  });

  it('l’aube les propose ; un colis va en ville, une seule fois', () => {
    const world = firstDawn();
    const offer = world.boonOffer();

    expect(offer?.night).toBe(1);

    const index = offer!.choices.findIndex((id) => BOONS[id].effect.kind === 'items');
    const pick = index >= 0 ? index : 0;
    const boon = BOONS[offer!.choices[pick]!];
    const town = world.townStock()!;
    const before = Object.fromEntries(town.entries());

    world.push({ type: 'chooseBoon', index: pick });
    world.tick();
    expect(world.boonOffer()).toBeNull();
    if (boon.effect.kind === 'items') {
      for (const [item, amount] of Object.entries(boon.effect.items)) {
        expect(town.count(item as never)).toBeGreaterThanOrEqual((before[item] ?? 0) + Math.min(amount, 1));
      }
    }

    // Une deuxième carte n'est plus à prendre.
    world.push({ type: 'chooseBoon', index: pick });
    world.tick();
    expect(world.boonOffer()).toBeNull();
  });

  it('un coup de pouce s’ajoute à la statistique pour la journée, puis s’éteint', () => {
    let world: World | null = null;
    let index = -1;

    // Une graine dont la première aube propose un coup de pouce.
    for (let seed = 1; seed < 40 && index < 0; seed += 1) {
      const choices = drawBoons(seed, 1);

      index = choices.findIndex((id) => BOONS[id].effect.kind === 'stat');
      if (index >= 0) world = firstDawn(seed);
    }

    const boonId = world!.boonOffer()!.choices[index]!;
    const effect = BOONS[boonId].effect;

    if (effect.kind !== 'stat') throw new Error('pas un coup de pouce');

    const before = world!.bonus(effect.stat);

    world!.push({ type: 'chooseBoon', index });
    world!.tick();
    expect(world!.bonus(effect.stat)).toBeCloseTo(before + effect.amount);
    expect(world!.activeBoon()?.id).toBe(boonId);

    // La sauvegarde garde le coup de pouce.
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(world!))));

    expect(loaded.activeBoon()?.id).toBe(boonId);

    for (let i = 0; i < BOON_OFFER.durationTicks; i += 1) world!.tick();
    expect(world!.activeBoon()).toBeNull();
    expect(world!.bonus(effect.stat)).toBeCloseTo(before);
  });

  it('une offre pas choisie survit au rechargement', () => {
    const world = firstDawn(3);
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(world))));

    expect(loaded.boonOffer()).toEqual(world.boonOffer());
  });
});
