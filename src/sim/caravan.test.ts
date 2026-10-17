import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../data/buildings.ts';
import { CARAVAN, RARE_OFFERS } from '../data/caravan.ts';
import type { ItemId } from '../data/items.ts';
import { drawOffers, isCaravanDay, surplusOffer } from './caravan.ts';
import { CYCLE_TICKS } from './dayNight.ts';
import { deserialize, serialize } from './save.ts';
import type { Caravan, EntityId } from './types.ts';
import { World } from './world.ts';
import { SLOW } from './sweep.ts';

/** Un chantier livré d'office sauf un objet, que le sac apporte : le dernier objet l'achève. */
function finish(world: World, id: EntityId): void {
  const site = world.entities.get(id);

  if (site?.kind !== 'site') throw new Error(`#${id} n'est pas un chantier`);

  const cost = BUILDINGS[site.proto].cost as Partial<Record<ItemId, number>>;
  const [last] = Object.keys(cost) as ItemId[];

  site.delivered = { ...cost, [last!]: cost[last!]! - 1 };
  world.player.inventory.add(last!, 1);
  world.push({ type: 'transferToSite', id });
  world.tick();
}

function withTownHall(seed: number): World {
  const world = new World(seed);

  finish(world, world.townHallId);
  return world;
}

/** Saute au tick du départ de la caravane du jour `day`, puis la laisse se garer. */
function caravanOf(world: World, day: number): Caravan {
  world.cycleStartTick = world.tickCount + 1 - ((day - 1) * CYCLE_TICKS + CARAVAN.arriveAfter);
  world.tick();

  const caravan = world.caravan();

  if (!caravan) throw new Error(`pas de caravane au jour ${day}`);
  for (let i = 0; i < 20 * 60 && caravan.state !== 'parked'; i += 1) world.tick();
  if (caravan.state !== 'parked') throw new Error('la caravane ne s’est pas garée');
  return caravan;
}

/** Adam au contact de la charrette. */
function meet(world: World, caravan: Caravan): void {
  world.player.x = world.player.prevX = caravan.x;
  world.player.y = world.player.prevY = caravan.y + 8;
}

const stockOf =
  (stock: Partial<Record<ItemId, number>>) =>
  (item: ItemId): number =>
    stock[item] ?? 0;

describe('caravane de troc', () => {
  it('passe à partir du jour 4, un jour sur deux', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(isCaravanDay)).toEqual([4, 6, 8, 10]);
  });

  it.skipIf(!SLOW)('seed 42 : des caravanes aux jours 4, 6 et 8, en jouant les journées', () => {
    const world = withTownHall(42);
    const days: number[] = [];

    world.events.on('caravanArriving', ({ day }) => days.push(day));

    while ((world.clock()?.cycle ?? 0) < 9) {
      world.tick();
      // Pas de mutant : la mairie doit tenir jusqu'au jour 9.
      for (const mobile of world.mobiles.values()) if (mobile.kind === 'mutant') world.mobiles.delete(mobile.id);
    }

    expect(days).toEqual([4, 6, 8]);
  }, 120_000);

  it('arrive 30 s après l’aube, se gare à 8 cases de la mairie, repart 90 s plus tard', () => {
    const world = withTownHall(42);
    const hall = world.warehouse()!;
    const caravan = caravanOf(world, 4);
    const left: number[] = [];

    world.events.on('caravanLeaving', () => left.push(world.tickCount));

    const dx = caravan.x / 32 - (hall.tx + hall.width / 2);
    const dy = caravan.y / 32 - (hall.ty + hall.height / 2);

    expect(Math.hypot(dx, dy)).toBeGreaterThan(CARAVAN.distance - 1);
    expect(Math.hypot(dx, dy)).toBeLessThan(CARAVAN.distance + 1);
    expect(world.caravanInTownRange(caravan)).toBe(true);

    const parkedAt = world.tickCount;

    for (let i = 0; i < CARAVAN.stay + 20 * 30 && world.caravan(); i += 1) world.tick();

    expect(left).toEqual([parkedAt + CARAVAN.stay]);
    expect(world.caravan()).toBeUndefined();
  });

  it('propose du charbon contre du minerai à une ville pleine de minerai et sans charbon', () => {
    const offer = surplusOffer(stockOf({ ironOre: 100, coal: 0 }));

    expect(offer).toMatchObject({ kind: 'surplus', cost: { ironOre: 20 }, items: { coal: 4 } });
    // Le manque est ce dont la ville a le moins, pas forcément le charbon.
    expect(surplusOffer(stockOf({ ironOre: 100, coal: 30, wood: 50, stone: 5 }))?.items).toEqual({ stone: 4 });
    // Sous 60, ce n'est pas un surplus.
    expect(surplusOffer(stockOf({ ironOre: 59 }))).toBeNull();
  });

  it('tire trois échanges : surplus → manque, butin, offre rare', () => {
    const offers = drawOffers(42, 4, stockOf({ ironOre: 311, stone: 257, food: 199 }), {});

    expect(offers.map(({ kind }) => kind)).toEqual(['surplus', 'loot', 'rare']);
    expect(offers[0]).toMatchObject({ cost: { ironOre: 20 }, items: { coal: 4 } });
    expect(offers[1]).toMatchObject({ cost: { mutantGoo: 3 }, items: { ironPlate: 1 } });
    expect(offers[2]).toMatchObject({ cost: { wood: 30, stone: 10 }, bag: 10, rare: 'bigBag' });
    // L'offre rare a son plafond sur la partie.
    expect(drawOffers(42, 6, stockOf({}), { bigBag: RARE_OFFERS.bigBag.limit }).map(({ kind }) => kind)).toEqual(['loot']);
  });

  it('même seed, même ville : mêmes offres, même bord de clairière', () => {
    const offersOf = (): Caravan => {
      const world = withTownHall(42);

      world.townStock()!.add('ironOre', 100);
      return caravanOf(world, 6);
    };
    const a = offersOf();
    const b = offersOf();

    expect(a.offers).toEqual(b.offers);
    expect([a.parkX, a.parkY]).toEqual([b.parkX, b.parkY]);
    expect(a.offers[0]).toMatchObject({ kind: 'surplus', cost: { ironOre: 20 }, items: { coal: 4 } });
  });

  it('un échange consomme exactement son coût, sac puis ville, et ne se refait pas', () => {
    const world = withTownHall(42);
    const town = world.townStock()!;

    town.add('ironOre', 100);

    const caravan = caravanOf(world, 4);
    const rejected: string[] = [];

    world.events.on('tradeRejected', ({ reason }) => rejected.push(reason));
    world.player.inventory.add('ironOre', 5);
    meet(world, caravan);

    const coalBefore = world.player.inventory.count('coal') + town.count('coal');

    world.push({ type: 'trade', caravan: caravan.id, offer: 0 });
    world.tick();

    expect(world.player.inventory.count('ironOre')).toBe(0);
    expect(town.count('ironOre')).toBe(85);
    expect(world.player.inventory.count('coal') + town.count('coal')).toBe(coalBefore + 4);
    expect(caravan.offers[0]!.done).toBe(true);

    world.push({ type: 'trade', caravan: caravan.id, offer: 0 });
    world.tick();

    expect(rejected).toEqual(['done']);
    expect(town.count('ironOre')).toBe(85);
    expect(world.player.inventory.count('coal') + town.count('coal')).toBe(coalBefore + 4);
  });

  it('refuse un échange qu’on ne peut pas payer, ou de loin', () => {
    const world = withTownHall(42);
    const caravan = caravanOf(world, 4);
    const rejected: string[] = [];
    const loot = caravan.offers.findIndex(({ kind }) => kind === 'loot');

    world.events.on('tradeRejected', ({ reason }) => rejected.push(reason));
    world.player.inventory.add('mutantGoo', 3);
    world.push({ type: 'trade', caravan: caravan.id, offer: loot });
    world.tick();
    meet(world, caravan);
    world.player.inventory.remove('mutantGoo', 1);
    world.push({ type: 'trade', caravan: caravan.id, offer: loot });
    world.tick();

    expect(rejected).toEqual(['outOfReach', 'missingItems']);
    expect(world.player.inventory.count('mutantGoo')).toBe(2);
  });

  it('l’offre rare agrandit le sac, et la sauvegarde s’en souvient', () => {
    const world = withTownHall(42);
    const caravan = caravanOf(world, 4);
    const rare = caravan.offers.findIndex(({ kind }) => kind === 'rare');
    const capacity = world.player.inventory.capacity;
    const reached: number[] = [];

    world.events.on('caravanReached', ({ id }) => reached.push(id));
    world.townStock()!.add('wood', 30);
    world.townStock()!.add('stone', 10);
    meet(world, caravan);
    world.tick();
    world.push({ type: 'trade', caravan: caravan.id, offer: rare });
    world.tick();

    expect(reached).toEqual([caravan.id]);
    expect(world.player.inventory.capacity).toBe(capacity + 10);
    expect(world.rareTrades).toEqual({ bigBag: 1 });

    const restored = deserialize(JSON.parse(JSON.stringify(serialize(world))));

    expect(restored.player.inventory.capacity).toBe(capacity + 10);
    expect(restored.rareTrades).toEqual({ bigBag: 1 });
    expect(restored.caravan()).toEqual(world.caravan());
  });
});
