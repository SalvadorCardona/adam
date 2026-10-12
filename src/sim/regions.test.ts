import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { WILDLIFE } from '../data/enemies.ts';
import type { ItemId } from '../data/items.ts';
import { BIOMES, ERAS, HOME_REGION, REGION_RINGS, eraOf } from '../data/regions.ts';
import { HOME_REGION_ID, REGION_COUNT, regionAt, regionCenter } from './regions.ts';
import { deserialize, serialize } from './save.ts';
import type { Beast, EntityId } from './types.ts';
import { World } from './world.ts';

const SEEDS = [1, 7, 42, 100, 1234, 99999];

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

function guardians(world: World): Beast[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Beast => mobile.kind === 'beast' && mobile.regionOf !== undefined);
}

/** Adam à `tiles` tuiles du repaire de la région, le monde avance d'une seconde : le gardien sort. */
function approach(world: World, id: number, tiles = 4): Beast | undefined {
  const lair = world.regions[id]!.lair!;

  world.player.x = world.player.prevX = (lair.tx + 0.5 + tiles) * TILE_SIZE;
  world.player.y = world.player.prevY = (lair.ty + 0.5) * TILE_SIZE;
  for (let i = 0; i < 21; i += 1) world.tick();
  return guardians(world).find((beast) => beast.regionOf === id);
}

/** Le gardien tombe sous l'arc d'Adam : il n'a plus qu'un point de vie, et Adam tient bon. */
function defeat(world: World, id: number): void {
  const guardian = approach(world, id);

  if (!guardian) throw new Error(`pas de gardien dans la région ${id}`);
  guardian.hp = 0.5;
  for (let i = 0; i < 20 * 10 && world.mobiles.has(guardian.id); i += 1) {
    world.player.hp = world.maxHp();
    world.tick();
  }
}

describe('régions — géométrie', () => {
  it('la prairie de départ entoure la mairie, et chaque tuile tombe dans une région connue', () => {
    for (const seed of SEEDS) {
      const center = regionCenter(seed);

      expect(regionAt(seed, Math.floor(center.x), Math.floor(center.y))).toBe(HOME_REGION_ID);
      for (let ty = -150; ty <= 150; ty += 7) {
        for (let tx = -150; tx <= 150; tx += 7) {
          const id = regionAt(seed, tx, ty);

          expect(id).toBeGreaterThanOrEqual(0);
          expect(id).toBeLessThan(REGION_COUNT);
        }
      }
    }
  });

  it('chaque région à conquérir a un repaire dans ses bords, et la carte mêle au moins trois biomes', () => {
    for (const seed of SEEDS) {
      const world = new World(seed);
      const biomes = new Set(world.regions.filter((region) => region.ring >= 0).map((region) => region.biome));

      expect(world.regions).toHaveLength(REGION_COUNT);
      expect(world.regions[HOME_REGION_ID]!.biome).toBe(HOME_REGION.biome);
      for (const region of world.regions.slice(1)) {
        expect(region.lair, `région ${region.id}, seed ${seed}`).not.toBeNull();
        expect(regionAt(seed, region.lair!.tx, region.lair!.ty)).toBe(region.id);
      }
      expect(biomes.size, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('les ères suivent les objectifs, et les anneaux lointains en demandent une plus avancée', () => {
    expect(eraOf(0)).toBe(0);
    expect(eraOf(ERAS[1].objective)).toBe(1);
    expect(eraOf(99)).toBe(ERAS.length - 1);
    expect(REGION_RINGS[0].era).toBe(0);
    expect(REGION_RINGS[REGION_RINGS.length - 1]!.era).toBeGreaterThan(0);
  });
});

describe('régions — conquête', () => {
  it('une colonie neuve ne tient que la prairie de départ, et ne bâtit ni ne pave ailleurs', () => {
    const world = World.newColony(100);
    const region = world.regions[1]!;
    const lair = region.lair!;

    expect([...world.conquered]).toEqual([HOME_REGION_ID]);
    // Tout est exploré : seul le refus de région peut tomber.
    world.fog.enabled = false;
    world.player.x = world.player.prevX = (lair.tx + 3.5) * TILE_SIZE;
    world.player.y = world.player.prevY = (lair.ty + 3.5) * TILE_SIZE;
    expect(world.canPlace('home', lair.tx, lair.ty)).toBe('region');
    expect(world.roadBlock(lair.tx, lair.ty)).toBe('region');
  });

  it('sans l’ère de son anneau, le gardien ne se montre pas : la région est verrouillée', () => {
    const world = World.newColony(100);
    const far = world.regions.find((region) => region.ring === 1)!;

    expect(world.regionState(far.id)).toBe('locked');
    expect(approach(world, far.id)).toBeUndefined();

    world.objective = ERAS[REGION_RINGS[1].era].objective;
    expect(world.regionState(far.id)).toBe('open');
    expect(approach(world, far.id)).toBeDefined();
  });

  it('vaincre le gardien conquiert sa région : trois régions, trois gardiens, leur spécialité au sol', () => {
    const world = World.newColony(100);
    const conquered: number[] = [];
    const drops = new Set<ItemId>();

    world.objective = ERAS[2].objective;
    world.events.on('regionConquered', ({ id }) => conquered.push(id));

    const targets = [1, ...world.regions.filter((region) => region.ring === 1).map((region) => region.id).slice(0, 1), REGION_COUNT - 1];

    for (const id of targets) {
      const region = world.regions[id]!;
      const guardian = approach(world, id);

      expect(guardian?.proto).toBe(BIOMES[region.biome].guardian);
      // Plus loin, plus coriace.
      expect(world.beastMaxHp(guardian!)).toBe(Math.round(WILDLIFE[guardian!.proto].hp * REGION_RINGS[region.ring]!.hpScale));
      defeat(world, id);
      expect(world.regionState(id)).toBe('conquered');
      // Au sol, ou déjà glissée dans le sac d'Adam, au contact.
      for (const mobile of world.mobiles.values()) if (mobile.kind === 'pickup') drops.add(mobile.item);
      for (const [item] of world.player.inventory.entries()) drops.add(item);
      expect(drops.has(BIOMES[region.biome].specialty!)).toBe(true);
    }
    expect(conquered).toEqual(targets);
    expect(world.conquered.size).toBe(4);

    // Conquise, la région se bâtit.
    const lair = world.regions[1]!.lair!;

    world.fog.enabled = false;
    world.player.x = world.player.prevX = (lair.tx + 3.5) * TILE_SIZE;
    world.player.y = world.player.prevY = (lair.ty + 3.5) * TILE_SIZE;
    expect(world.canPlace('home', lair.tx, lair.ty)).not.toBe('region');
  });

  it('les régions conquises et la vie d’un gardien blessé passent la sauvegarde', () => {
    const world = World.newColony(100);

    world.objective = ERAS[2].objective;
    defeat(world, 1);

    const guardian = approach(world, 2)!;

    guardian.hp -= 3;
    world.push({ type: 'setMoveAxis', x: 0, y: 0 });
    // Adam s'éloigne : le gardien rentre, avec ce qu'il lui reste.
    world.player.x = world.player.prevX = regionCenter(100).x * TILE_SIZE;
    world.player.y = world.player.prevY = (regionCenter(100).y + 3) * TILE_SIZE;
    for (let i = 0; i < 21; i += 1) world.tick();

    const reloaded = deserialize(JSON.parse(JSON.stringify(serialize(world))));

    expect([...reloaded.conquered].sort((a, b) => a - b)).toEqual([HOME_REGION_ID, 1]);
    expect(reloaded.snapshot().regions).toEqual(world.snapshot().regions);
    expect(reloaded.snapshot().regions!.guardians).toHaveLength(1);
  });

  it('une sauvegarde d’avant les régions tient pour conquises la prairie et les régions déjà bâties', () => {
    const world = new World(100);

    finish(world, world.townHallId);

    const lair = world.regions[3]!.lair!;

    world.fog.enabled = false;
    world.player.x = world.player.prevX = (lair.tx + 0.5) * TILE_SIZE;
    world.player.y = world.player.prevY = (lair.ty + 6.5) * TILE_SIZE;

    // Une maison près du repaire, sur la première emprise libre.
    const spot = [...Array(9).keys()].flatMap((dy) => [...Array(9).keys()].map((dx) => ({ tx: lair.tx + dx - 4, ty: lair.ty + dy - 4 })))
      .find(({ tx, ty }) => world.regionAt(tx, ty) === 3 && world.regionAt(tx + 1, ty + 1) === 3 && world.canPlace('home', tx, ty) === null)!;

    world.push({ type: 'placeBuilding', building: 'home', tx: spot.tx, ty: spot.ty });
    world.tick();

    const legacy: Partial<ReturnType<typeof serialize>> = serialize(world);

    delete legacy.regions;
    const reloaded = deserialize(JSON.parse(JSON.stringify(legacy)));

    expect(world.conquered.size).toBe(REGION_COUNT);
    expect([...reloaded.conquered].sort((a, b) => a - b)).toEqual([HOME_REGION_ID, 3]);
  });
});
