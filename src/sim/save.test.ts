import { describe, expect, it } from 'vitest';
import { TILE_SIZE, worldToTile } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import type { ItemId } from '../data/items.ts';
import { RECIPES } from '../data/recipes.ts';
import type { Command } from './commands.ts';
import { BUILD_REACH_TILES } from './player.ts';
import { nameOf, sexOf } from './inhabitants.ts';
import { xpForLevel } from './levels.ts';
import { SAVE_VERSION, decodeSave, deserialize, encodeSave, peekSave, serialize } from './save.ts';
import { oreAt } from './terrain.ts';
import type { EntityId } from './types.ts';
import { World } from './world.ts';
import { SLOW } from './sweep.ts';

/** Remplit le sac, colle Adam à l'emprise, livre au contact : le dernier objet achève le chantier. */
function completeSite(world: World, id: EntityId): void {
  const site = world.entities.get(id);

  if (site?.kind !== 'site') throw new Error(`#${id} n'est pas un chantier`);

  for (const [item, amount] of Object.entries(BUILDINGS[site.proto].cost) as [ItemId, number][]) {
    world.player.inventory.add(item, amount);
  }

  // Sous l'emprise, au milieu : la tuile du dessous est libre dans la clairière comme ailleurs.
  const below = { tx: site.tx + Math.floor(site.width / 2), ty: site.ty + site.height };

  if (world.isSolid(below.tx, below.ty)) throw new Error('pied du chantier encombré');
  world.player.x = (below.tx + 0.5) * TILE_SIZE;
  world.player.y = (below.ty + 0.5) * TILE_SIZE;
  world.push({ type: 'setMoveAxis', x: 0, y: -1 });

  for (let i = 0; i < 400; i += 1) {
    world.tick();

    const current = world.entities.get(id);

    if (current?.kind !== 'site') break;
  }
  world.push({ type: 'setMoveAxis', x: 0, y: 0 });
  world.tick();

  if (world.entities.get(id)?.kind === 'site') throw new Error('le chantier ne s’est pas achevé');
}

/** Pose et achève un bâtiment sur la première case posable à portée. */
function build(world: World, building: BuildingId): void {
  const origin = worldToTile(world.player.x, world.player.y);

  for (let dy = -BUILD_REACH_TILES; dy <= BUILD_REACH_TILES; dy += 1) {
    for (let dx = -BUILD_REACH_TILES; dx <= BUILD_REACH_TILES; dx += 1) {
      const tx = origin.tx + dx;
      const ty = origin.ty + dy;

      if (world.canPlace(building, tx, ty) !== null || world.isSolid(tx + 1, ty + BUILDINGS[building].height)) continue;

      const before = new Set(world.entities.keys());

      world.push({ type: 'placeBuilding', building, tx, ty });
      world.tick();

      const id = [...world.entities.keys()].find((key) => !before.has(key));

      if (id === undefined) throw new Error('le chantier n’a pas été ouvert');
      completeSite(world, id);
      return;
    }
  }
  throw new Error('aucune case posable à portée');
}

/** Mène Adam près du filon le plus proche et casse les rochers qui le couvrent. */
function clearNearestOre(world: World): void {
  const origin = worldToTile(world.player.x, world.player.y);

  for (let r = 0; r <= 24; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const tx = origin.tx + dx;
        const ty = origin.ty + dy;

        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !oreAt(world.seed, tx, ty)) continue;

        for (let y = ty - 2; y <= ty + 2; y += 1) {
          for (let x = tx - 2; x <= tx + 2; x += 1) world.resources.clear(x, y);
        }
        world.player.x = (tx + 0.5) * TILE_SIZE;
        world.player.y = (ty + 3.5) * TILE_SIZE;
        return;
      }
    }
  }
  throw new Error('aucun filon près d’Adam');
}

/** Un axe qui tourne lentement : Adam se promène, heurte, récolte. */
function wander(tick: number): Command {
  const angle = tick / 90;

  return { type: 'setMoveAxis', x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * Une partie bien remplie : mairie debout, nurserie, tour, une vague en
 * cours, un enfant, des ressources entamées et un chantier à moitié livré.
 */
function playedWorld(): World {
  const world = new World(4242);

  completeSite(world, world.townHallId);

  // Une mairie solide : la partie doit tenir jusqu'à la première naissance.
  const hall = world.entities.get(world.townHallId);

  if (hall && hall.kind !== 'site') hall.hp = 1_000_000;
  build(world, 'nursery');

  // De quoi nourrir le premier enfant : sans nourriture, la nurserie attend.
  const nursery = [...world.entities.values()].find((entity) => entity.kind === 'nursery');

  if (!nursery) throw new Error('pas de nurserie');

  // Adam passe entre les arbres et se promène loin d'elle : elle doit tenir sans lui.
  nursery.hp = 1_000_000;
  world.player.inventory.add('food', RECIPES.raiseChild.inputs.food);
  world.push({ type: 'supplyBuilding', id: nursery.id });
  world.tick();

  build(world, 'watchtower');
  // Une foreuse ne se pose que sur un filon : on casse les rochers qui le couvrent.
  clearNearestOre(world);
  // Les vagues visent aussi l'usine : la foreuse doit tenir pour voyager dans la sauvegarde.
  build(world, 'drill');
  const drill = [...world.entities.values()].find((entity) => entity.kind === 'drill');

  if (!drill) throw new Error('pas de foreuse');
  drill.hp = 1_000_000;

  const hasKid = (): boolean => [...world.mobiles.values()].some((mobile) => mobile.kind === 'kid');
  const hasMutant = (): boolean => [...world.mobiles.values()].some((mobile) => mobile.kind === 'mutant');

  while (!(hasKid() && hasMutant()) && world.tickCount < 30_000) {
    if (world.tickCount % 60 === 0) world.push(wander(world.tickCount));
    world.tick();
  }

  // Tombé sous les mutants, Adam ne bâtit pas : on attend qu'il se relève.
  while (world.dead) world.tick();

  // Un chantier entamé, pour que `delivered` voyage aussi.
  const origin = worldToTile(world.player.x, world.player.y);

  for (let dy = -BUILD_REACH_TILES; dy <= BUILD_REACH_TILES; dy += 1) {
    for (let dx = -BUILD_REACH_TILES; dx <= BUILD_REACH_TILES; dx += 1) {
      if (world.canPlace('farm', origin.tx + dx, origin.ty + dy) !== null) continue;
      world.push({ type: 'placeBuilding', building: 'farm', tx: origin.tx + dx, ty: origin.ty + dy });
      world.tick();
      dy = dx = BUILD_REACH_TILES + 1;
    }
  }

  const site = [...world.entities.values()].find((entity) => entity.kind === 'site');

  if (site?.kind !== 'site') throw new Error('pas de chantier entamé');

  const [item] = Object.keys(BUILDINGS[site.proto].cost) as ItemId[];

  site.delivered[item!] = 1;

  return world;
}

/** Joue `ticks` ticks et renvoie la trace des événements. */
function play(world: World, ticks: number): string[] {
  const trace: string[] = [];

  world.events.on('mutantDied', ({ id }) => trace.push(`${world.tickCount}:mutantDied:${id}`));
  world.events.on('arrowShot', ({ x, y }) => trace.push(`${world.tickCount}:arrow:${x},${y}`));
  world.events.on('resourceHarvested', ({ tx, ty }) => trace.push(`${world.tickCount}:harvest:${tx},${ty}`));
  world.events.on('waveStarted', ({ wave }) => trace.push(`${world.tickCount}:wave:${wave}`));
  world.events.on('childBorn', ({ kidId }) => trace.push(`${world.tickCount}:kid:${kidId}`));
  world.events.on('drillProduced', ({ id }) => trace.push(`${world.tickCount}:drill:${id}`));

  for (let i = 0; i < ticks; i += 1) {
    if (world.tickCount % 60 === 0) world.push(wander(world.tickCount));
    world.tick();
  }
  return trace;
}

describe('sauvegarde', () => {
  const original = playedWorld();
  const state = serialize(original);

  it('contient ce que la partie a construit', () => {
    const kinds = new Set(state.entities.map((entity) => entity.kind));

    expect(kinds).toEqual(new Set(['townHall', 'nursery', 'tower', 'drill', 'site']));
    expect(state.mobiles.some((mobile) => mobile.kind === 'kid')).toBe(true);
    expect(state.mobiles.some((mobile) => mobile.kind === 'mutant')).toBe(true);
    expect(state.night).toBeGreaterThan(0);
    expect(Object.keys(state.resources).length).toBeGreaterThan(0);
  });

  it('aller-retour : deserialize(serialize(world)) redonne le même état', () => {
    const copy = deserialize(JSON.parse(JSON.stringify(state)));

    expect(serialize(copy)).toEqual(state);
    expect(copy.population()).toEqual(original.population());
    expect(copy.pendingWakes()).toBe(original.pendingWakes());
    expect(copy.player.inventory.entries()).toEqual(original.player.inventory.entries());
    // L'horloge du HUD reprend à la même heure, au même jour.
    expect(copy.dayDial()).toEqual(original.dayDial());
    expect(copy.dayDial()).not.toBeNull();
  });

  it('la peur de la nuit survit au rechargement : le moral de l’aube est le même', () => {
    const world = new World(4242);

    completeSite(world, world.townHallId);

    const laborers = [...world.mobiles.values()].filter((mobile) => mobile.kind === 'worker');

    expect(laborers.length).toBeGreaterThan(0);
    // Ceux qui ont eu peur pendant la nuit (rempli par `stepFear`).
    const scared = (world as unknown as { scared: Set<number> }).scared;

    for (const worker of laborers) scared.add(worker.id);

    const reloaded = deserialize(JSON.parse(JSON.stringify(serialize(world))));
    const happiness = (target: World): number[] =>
      [...target.mobiles.values()].filter((mobile) => mobile.kind === 'worker').map((mobile) => (mobile as { happiness: number }).happiness);

    for (const target of [world, reloaded]) {
      const clock = target.clock()!;

      // Jusqu'à l'aube suivante, sans traverser la nuit : le prochain tick la lève.
      target.cycleStartTick -= DAY_CYCLE.day + DAY_CYCLE.dusk + DAY_CYCLE.night - clock.offset - 1;
      target.tick();
      expect(target.clock()).toMatchObject({ phase: 'dawn' });
    }
    expect(happiness(reloaded)).toEqual(happiness(world));
    expect(happiness(world)).not.toEqual(happiness(new World(4242)));
  });

  it.skipIf(!SLOW)('le monde rechargé joue exactement la même suite de ticks', () => {
    const reference = deserialize(JSON.parse(JSON.stringify(state)));
    const reloaded = decodeSave(encodeSave(reference, 1));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);

    const expected = play(reference, 4000);
    const actual = play(reloaded.world, 4000);

    expect(expected.length).toBeGreaterThan(0);
    expect(actual).toEqual(expected);
    expect(serialize(reloaded.world)).toEqual(serialize(reference));
  });

  it('le monde restauré est bien celui que la partie originale devient', () => {
    const copy = deserialize(JSON.parse(JSON.stringify(state)));

    play(original, 600);
    play(copy, 600);
    expect(serialize(copy)).toEqual(serialize(original));
  });

  it('garde le sexe de chaque habitant, même celui que la seed ne lui aurait pas tiré', () => {
    const raw = JSON.parse(JSON.stringify(state)) as { mobiles: { kind: string; id: number; sex?: string }[] };
    const kid = raw.mobiles.find((mobile) => mobile.kind === 'kid')!;
    const flipped = kid.sex === 'male' ? 'female' : 'male';

    kid.sex = flipped;
    expect(deserialize(raw).mobiles.get(kid.id)).toMatchObject({ sex: flipped });
  });

  it('une sauvegarde d’avant le sexe des habitants se charge : chacun reçoit celui de la seed, et garde son prénom', () => {
    const raw = JSON.parse(JSON.stringify(state)) as { seed: number; mobiles: { kind: string; id: number; sex?: string }[] };
    const names = new Map<number, string>();

    for (const mobile of raw.mobiles) {
      if (mobile.sex === undefined) continue;
      names.set(mobile.id, nameOf(raw.seed, mobile.id, sexOf(raw.seed, mobile.id)));
      delete mobile.sex;
    }
    expect(names.size).toBeGreaterThan(0);

    const copy = deserialize(raw);

    for (const [id, name] of names) {
      const mobile = copy.mobiles.get(id)!;

      if (!('sex' in mobile)) throw new Error(`habitant ${id} sans sexe`);
      expect(mobile.sex).toBe(sexOf(copy.seed, id));
      expect(nameOf(copy.seed, id, mobile.sex)).toBe(name);
    }
  });

  it('une sauvegarde d’avant la suppression des routes du joueur se charge : les dalles disparaissent', () => {
    const raw = JSON.parse(JSON.stringify(state)) as { roads?: Record<string, number[]> };

    raw.roads = { '0,0': [0, 1, 33], '-1,2': [5] };

    const copy = deserialize(raw);

    expect(serialize(copy)).not.toHaveProperty('roads');
    expect(copy.entities.size).toBe(original.entities.size);
  });

  it('refuse un sexe inconnu', () => {
    const raw = JSON.parse(JSON.stringify(state)) as { mobiles: { kind: string; sex?: string }[] };

    raw.mobiles.find((mobile) => mobile.kind === 'kid')!.sex = 'robot';
    expect(() => deserialize(raw)).toThrow();
  });

  it('enveloppe versionnée : version, date, état', () => {
    const file = JSON.parse(encodeSave(new World(7), 1234)) as Record<string, unknown>;

    expect(file['version']).toBe(SAVE_VERSION);
    expect(file['savedAt']).toBe(1234);
    expect(file['state']).toBeTypeOf('object');
  });

  it('reprend une sauvegarde de la version 4 : la vague devient la nuit, un jour se lève', () => {
    const world = new World(7);

    for (let i = 0; i < 5; i += 1) world.tick();

    const file = JSON.parse(encodeSave(world, 1)) as { state: Record<string, unknown> };
    const state = { ...file.state };

    delete state['night'];
    delete state['cycleStartTick'];
    const v4 = (wave: number, nextWaveTick: number): string =>
      JSON.stringify({ version: 4, savedAt: 1, state: { ...state, wave, nextWaveTick } });

    const standing = decodeSave(v4(3, 900));

    if (!standing.ok) throw new Error(`sauvegarde refusée : ${standing.reason}`);
    expect(standing.world.night).toBe(3);
    expect(standing.world.cycleStartTick).toBe(world.tickCount);
    expect(standing.world.clock()?.phase).toBe('day');

    const building = decodeSave(v4(0, 0));

    if (!building.ok) throw new Error(`sauvegarde refusée : ${building.reason}`);
    expect(building.world.clock()).toBeNull();
  });

  it('ignore sans lever une sauvegarde d’une autre version', () => {
    const file = JSON.parse(encodeSave(new World(7), 1)) as Record<string, unknown>;

    expect(decodeSave(JSON.stringify({ ...file, version: SAVE_VERSION + 1 }))).toEqual({ ok: false, reason: 'version' });
    expect(decodeSave(JSON.stringify({ ...file, version: 0 }))).toEqual({ ok: false, reason: 'version' });
  });

  it('ignore sans lever une sauvegarde corrompue', () => {
    const text = encodeSave(new World(7), 1);
    const file = JSON.parse(text) as { state: Record<string, unknown> };
    const broken = (patch: Record<string, unknown>): string =>
      JSON.stringify({ ...file, state: { ...file.state, ...patch } });

    for (const input of [
      '',
      '{',
      'null',
      '42',
      '[]',
      text.slice(0, text.length / 2),
      JSON.stringify({ version: SAVE_VERSION }),
      JSON.stringify({ version: SAVE_VERSION, savedAt: 1, state: null }),
      broken({ seed: 'abc' }),
      broken({ tick: 1.5 }),
      broken({ player: { ...(file.state['player'] as object), x: null } }),
      broken({ entities: [{ kind: 'site', id: 1, proto: 'castle', tx: 0, ty: 0, delivered: {} }] }),
      broken({ entities: [{ kind: 'drill', id: 1, proto: 'townHall', tx: 0, ty: 0, store: {}, hp: 10 }] }),
      broken({ mobiles: [{ kind: 'dragon', id: 1 }] }),
      broken({ resources: { nimporte: 3 } }),
      broken({ scheduler: { near: 'x', far: [] } }),
    ]) {
      expect(decodeSave(input)).toEqual({ ok: false, reason: 'corrupt' });
    }
  });
});

describe('base mutante entamée par un bonus d\'arc fractionnaire', () => {
  it('se sauvegarde et se recharge avec ses PV décimaux', () => {
    const world = new World(100);
    const base = world.enemyBases[0]!;

    // Niveau 2 : +0,1 de dégâts d'arc ; chef abattu : plus de bouclier.
    world.player.xp = xpForLevel(2);
    base.chief = 0;

    const damage = 1 + world.bonus('bowDamage');

    expect(Number.isInteger(damage)).toBe(false);
    (world as unknown as { hurtBase(target: typeof base, amount: number): void }).hurtBase(base, damage);
    expect(Number.isInteger(base.hp)).toBe(false);

    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(`sauvegarde illisible : ${decoded.reason}`);
    expect(decoded.world.enemyBases.find((entry) => entry.id === base.id)?.hp).toBe(base.hp);
  });
});

describe('peekSave', () => {
  it('lit le jour de l’horloge, les colons, le chapitre et la date sans restaurer le monde', () => {
    const world = new World(7);

    for (let i = 0; i < 10; i += 1) world.tick();
    // Une mairie debout depuis trois cycles et demi : le jour 4.
    world.cycleStartTick = world.tickCount - Math.round(3.5 * (DAY_CYCLE.day + DAY_CYCLE.dusk + DAY_CYCLE.night + DAY_CYCLE.dawn));
    world.colonists = 9;

    const summary = peekSave(encodeSave(world, 1234));

    expect(summary).toEqual({ savedAt: 1234, day: world.dayDial()!.day, colonists: 9, chapter: world.chapter });
    expect(summary!.day).toBeGreaterThan(1);
  });

  it('dit « jour 1 » avant la mairie et rend `null` pour un texte illisible', () => {
    expect(peekSave(encodeSave(new World(7), 1))?.day).toBe(1);
    expect(peekSave('pas du json')).toBeNull();
    expect(peekSave('{"version":11}')).toBeNull();
  });
});
