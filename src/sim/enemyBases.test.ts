import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId, type BuildingProto } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { WILDLIFE, type WildlifeId } from '../data/enemies.ts';
import { ENEMY_BASE, ENEMY_BASE_LEVELS, ENEMY_BASE_RINGS, GUARD_RANGE, RAIDS, enemyBaseLevel } from '../data/enemyBases.ts';
import { MAX_GEAR, gearOf } from '../data/gear.ts';
import type { ItemId } from '../data/items.ts';
import { CYCLE_TICKS } from './dayNight.ts';
import { baseCenter, baseDoor, breed, inBaseZone, isStanding, raidCapacity, raidTicks } from './enemyBases.ts';
import { earlyCap } from './waves.ts';
import { deserialize, serialize } from './save.ts';
import type { Beast, EnemyBase, EntityId, Mutant } from './types.ts';
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
  if (world.entities.get(id)?.kind === 'site') throw new Error('le chantier ne s’est pas achevé');
}

/** Une partie dont la mairie est debout : le menu s'ouvre. */
function withTownHall(seed = 7): World {
  const world = new World(seed);

  finish(world, world.townHallId);
  return world;
}

/** Centre de la mairie, en tuiles. */
function hallCenter(world: World): { x: number; y: number } {
  const hall = world.entities.get(world.townHallId)!;

  return { x: hall.tx + hall.width / 2, y: hall.ty + hall.height / 2 };
}

function centerTiles(base: EnemyBase): { x: number; y: number } {
  const { x, y } = baseCenter(base);

  return { x: x / TILE_SIZE, y: y / TILE_SIZE };
}

/** Un bâtiment du menu, 1 × 1 ou plus, et une origine dans la zone de `base` où seule la base empêche de bâtir. */
function spotInZone(world: World, base: EnemyBase): { building: BuildingId; tx: number; ty: number } {
  const building = (Object.keys(BUILDINGS) as BuildingId[]).find(
    (id) => world.isUnlocked(id) && !BUILDINGS[id].unique && BUILDINGS[id].kind !== 'drill' && (BUILDINGS[id] as BuildingProto).hallDistance === undefined,
  )!;
  const radius = enemyBaseLevel(base.level).zoneRadius;
  const { x, y } = centerTiles(base);

  // On y est déjà allé : le brouillard de guerre ne cache plus la zone.
  world.revealAround(Math.floor(x), Math.floor(y), radius + 2);
  for (let ty = Math.floor(y - radius); ty <= y + radius; ty += 1) {
    for (let tx = Math.floor(x - radius); tx <= x + radius; tx += 1) {
      if (world.placementBlock(building, tx, ty)?.reason === 'enemyZone') return { building, tx, ty };
    }
  }
  throw new Error('aucune case de la zone n’est libre');
}

/** Adam juste sous l'emprise du bâtiment à poser, à portée de construction. */
function standNear(world: World, spot: { building: BuildingId; tx: number; ty: number }): void {
  const proto = BUILDINGS[spot.building];

  world.player.x = (spot.tx + proto.width / 2) * TILE_SIZE;
  world.player.y = (spot.ty + proto.height + 1) * TILE_SIZE;
}

/** Adam juste sous la base, à portée d'arc, immobile. */
function standBelow(world: World, base: EnemyBase): void {
  world.player.x = (base.tx + ENEMY_BASE.width / 2) * TILE_SIZE;
  world.player.y = (base.ty + ENEMY_BASE.height + 1.5) * TILE_SIZE;
}

/** Les bases sans gardiens, sans cracheurs et sans chefs — donc sans bouclier : ni l'arc ni le Prestige ne s'y mêlent. */
function unguarded(world: World): void {
  for (const base of world.enemyBases) {
    base.guards = 0;
    base.spitters = 0;
    base.chief = 0;
  }
  for (const beast of guardians(world)) world.mobiles.delete(beast.id);
}

/** Ce que loge une base sur la carte — d'une seule espèce si `proto` est donné. */
function guardians(world: World, base?: EnemyBase, proto?: WildlifeId): Beast[] {
  return [...world.mobiles.values()].filter(
    (mobile): mobile is Beast =>
      mobile.kind === 'beast' && mobile.guardOf !== undefined && (!base || mobile.guardOf === base.id) && (!proto || mobile.proto === proto),
  );
}

function mutants(world: World): Mutant[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Mutant => mobile.kind === 'mutant');
}

/** Ticks entre le lever du premier jour et la tombée de la première nuit. */
const NIGHTFALL = DAY_CYCLE.day + DAY_CYCLE.dusk;

/** Joue jusqu'au tick qui précède la tombée de la nuit `night`, la mairie increvable et Adam chez lui. */
function untilNightfall(world: World, night: number): void {
  const hall = world.entities.get(world.townHallId)!;

  while (world.tickCount < world.cycleStartTick + (night - 1) * CYCLE_TICKS + NIGHTFALL - 1) {
    if (hall.kind !== 'site') hall.hp = 1_000_000;
    world.tick();
  }
}

/** La base de l'anneau 1 la plus proche d'Adam. */
function firstRingBase(world: World): EnemyBase {
  const hall = hallCenter(world);

  return world.enemyBases
    .filter((base) => base.level === 1)
    .sort((a, b) => {
      const ca = centerTiles(a);
      const cb = centerTiles(b);

      return Math.hypot(ca.x - hall.x, ca.y - hall.y) - Math.hypot(cb.x - hall.x, cb.y - hall.y);
    })[0]!;
}

describe('bases mutantes', () => {
  it.skipIf(!SLOW)('se posent en anneaux autour de la mairie, de plus en plus fortes, et laissent la ville de départ libre', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const world = new World(seed);
      const hall = hallCenter(world);

      ENEMY_BASE_RINGS.forEach((ring) => {
        const bases = world.enemyBases.filter((base) => base.level === ring.level);

        // Un lac peut trouer un anneau, jamais le vider.
        expect(bases.length).toBeGreaterThanOrEqual(Math.ceil(ring.count / 2));
        for (const base of bases) {
          const { x, y } = centerTiles(base);
          const distance = Math.hypot(x - hall.x, y - hall.y);

          expect(Math.abs(distance - ring.radius)).toBeLessThanOrEqual(ENEMY_BASE.search + 2);
          expect(base.hp).toBe(enemyBaseLevel(ring.level).hp);
        }

        // Tout autour : les bases d'un anneau couvrent au moins trois quadrants.
        const quadrants = new Set(bases.map((base) => {
          const { x, y } = centerTiles(base);

          return `${Math.sign(Math.round(x - hall.x))}:${Math.sign(Math.round(y - hall.y))}`;
        }));

        expect(quadrants.size).toBeGreaterThanOrEqual(3);
      });

      // Plus loin, plus coriace.
      expect(enemyBaseLevel(2).hp).toBeGreaterThan(enemyBaseLevel(1).hp);
      expect(enemyBaseLevel(3).hp).toBeGreaterThan(enemyBaseLevel(2).hp);

      // Rien ne tient la clairière (fer à 20 tuiles du départ) : 20 tuiles autour de la mairie restent à bâtir.
      for (let dy = -20; dy <= 20; dy += 1) {
        for (let dx = -20; dx <= 20; dx += 1) {
          if (dx * dx + dy * dy > 400) continue;
          expect(world.enemyZoneAt(Math.floor(hall.x + dx), Math.floor(hall.y + dy))).toBeNull();
        }
      }
    }
  });

  it('interdit de bâtir et de récolter dans sa zone', () => {
    const world = withTownHall();
    const base = firstRingBase(world);
    const spot = spotInZone(world, base);
    const { building, tx, ty } = spot;
    let refused: string | null = null;

    world.events.on('placementRejected', ({ reason }) => (refused = reason));
    standNear(world, spot);
    expect(world.canPlace(building, tx, ty)).toBe('enemyZone');
    world.push({ type: 'placeBuilding', building, tx, ty });
    world.tick();
    expect(refused).toBe('enemyZone');
    expect([...world.entities.values()].some((entity) => entity.tx === tx && entity.ty === ty)).toBe(false);

    // Un arbre dans la zone : Adam à côté n'en tire rien.
    const radius = enemyBaseLevel(base.level).zoneRadius;
    const { x, y } = centerTiles(base);
    let tree: { tx: number; ty: number } | null = null;

    for (let ty2 = Math.floor(y - radius); ty2 <= y + radius && !tree; ty2 += 1) {
      for (let tx2 = Math.floor(x - radius); tx2 <= x + radius && !tree; tx2 += 1) {
        if (world.resources.at(tx2, ty2) && inBaseZone(base, tx2, ty2) && inBaseZone(base, tx2, ty2 + 1)) tree = { tx: tx2, ty: ty2 };
      }
    }
    if (!tree) return;

    const before = world.resources.at(tree.tx, tree.ty)!.remaining;

    for (const [item, amount] of world.player.inventory.entries()) world.player.inventory.remove(item, amount);
    world.player.x = (tree.tx + 0.5) * TILE_SIZE;
    world.player.y = (tree.ty + 1.6) * TILE_SIZE;
    for (let i = 0; i < 60; i += 1) world.tick();
    expect(world.resources.at(tree.tx, tree.ty)?.remaining).toBe(before);
  });

  it('ne bouge pas sous un arc trop faible, et le dit', () => {
    const world = withTownHall();
    const base = firstRingBase(world);
    // La mairie bâtie en a déjà rapporté : on compte ce qui vient en plus.
    const prestige = world.prestige;
    let resisted = 0;

    world.events.on('enemyBaseResisted', () => (resisted += 1));
    // Sans gardiens : l'arc les abattrait, et leur Prestige se mêlerait à celui de la base.
    unguarded(world);
    expect(world.player.gear).toBeLessThan(base.level);
    standBelow(world, base);
    for (let i = 0; i < 400; i += 1) world.tick();

    expect(base.hp).toBe(enemyBaseLevel(base.level).hp);
    expect(resisted).toBeGreaterThan(0);
    expect(world.prestige).toBe(prestige);
  });

  it('tombe sous un arc de son niveau : sa zone se libère, le Prestige monte, son butin tombe, et elle ne revient pas', () => {
    const world = withTownHall();
    const base = firstRingBase(world);
    const spot = spotInZone(world, base);
    const { building, tx, ty } = spot;
    const destroyed: number[] = [];
    const prestige = world.prestige;
    let loot = 0;

    world.events.on('enemyBaseDestroyed', ({ id }) => destroyed.push(id));
    world.events.on('lootDropped', () => (loot += 1));
    unguarded(world);
    world.player.gear = base.level;
    standBelow(world, base);
    for (let i = 0; i < 6000 && isStanding(base); i += 1) {
      // Ses boules de feu ne sont pas l'objet de ce test : Adam tient debout.
      world.player.hp = 100;
      world.tick();
    }

    expect(destroyed).toEqual([base.id]);
    expect(world.prestige - prestige).toBe(enemyBaseLevel(base.level).prestige);
    expect(loot).toBeGreaterThan(0);
    expect(world.enemyZoneAt(tx, ty)).toBeNull();
    standNear(world, spot);
    expect(world.canPlace(building, tx, ty)).toBeNull();

    // Ni au chargement, ni plus tard : elle reste à terre.
    const copy = deserialize(JSON.parse(JSON.stringify(serialize(world))));

    for (let i = 0; i < 200; i += 1) copy.tick();
    expect(copy.enemyBase(base.id)?.hp).toBe(0);
    expect(copy.prestige).toBe(world.prestige);
    expect(copy.enemyZoneAt(tx, ty)).toBeNull();
  });

  it('se forge à la forge : chaque arc entame un niveau de plus', () => {
    expect(gearOf(0).cost).toEqual({});
    for (let level = 1; level <= MAX_GEAR; level += 1) expect(Object.keys(gearOf(level).cost).length).toBeGreaterThan(0);
    expect(MAX_GEAR).toBeGreaterThanOrEqual(ENEMY_BASE_RINGS[ENEMY_BASE_RINGS.length - 1]!.level);
  });

  it('une ancienne sauvegarde sans bases les découvre au chargement, hors des zones déjà bâties', () => {
    const world = withTownHall();
    const base = firstRingBase(world);
    const spot = spotInZone(world, base);
    const { building, tx, ty } = spot;

    // Une partie d'avant les bases : un chantier là où la base aurait tenu sa zone.
    base.hp = 0;
    standNear(world, spot);
    world.push({ type: 'placeBuilding', building, tx, ty });
    world.tick();
    expect([...world.entities.values()].some((entity) => entity.tx === tx && entity.ty === ty)).toBe(true);

    const state = JSON.parse(JSON.stringify(serialize(world))) as Record<string, unknown>;

    delete state['enemyBases'];
    delete state['prestige'];
    delete (state['player'] as Record<string, unknown>)['gear'];

    const copy = deserialize(state);

    expect(copy.enemyBases.length).toBeGreaterThan(0);
    expect(copy.enemyBase(base.id)).toBeUndefined();
    expect(copy.prestige).toBe(0);
    expect(copy.player.gear).toBe(0);
    for (const other of copy.enemyBases) {
      for (const entity of copy.entities.values()) expect(inBaseZone(other, entity.tx, entity.ty)).toBe(false);
    }
    for (let i = 0; i < 100; i += 1) copy.tick();
  });
});

describe('bases mutantes — production et sorties', () => {
  it('produit des assaillants le jour, jusqu’à sa capacité, puis attend la nuit', () => {
    const base: EnemyBase = { id: 1, tx: 0, ty: 0, level: 1, hp: ENEMY_BASE_LEVELS[0].hp, raiders: 0, brood: 0, guards: 2, spitters: 1, mend: 0, chief: 36, fire: 70 };
    const capacity = raidCapacity(1, 1);
    const ticks = raidTicks(1, 1);
    const counts: number[] = [];

    for (let i = 0; i < ticks * (capacity + 2); i += 1) {
      const { raider } = breed(base, 1);

      if (raider) counts.push(base.raiders);
      expect(base.raiders).toBeLessThanOrEqual(capacity);
    }
    expect(counts).toEqual(Array.from({ length: capacity }, (_, k) => k + 1));
    // Pleine, son compte ne court plus : elle n'en refera un que la réserve partie.
    expect(base.brood).toBe(0);
  });

  it('produit plus vite et en garde plus à mesure que les nuits passent ; les anneaux lointains s’éveillent plus tard', () => {
    for (let night = 1; night < 30; night += 1) {
      expect(raidTicks(1, night + 1)).toBeLessThanOrEqual(raidTicks(1, night));
      expect(raidCapacity(1, night + 1)).toBeGreaterThanOrEqual(raidCapacity(1, night));
      expect(raidCapacity(1, night)).toBeLessThanOrEqual(RAIDS.capacityMax);
    }
    expect(raidTicks(1, 9)).toBeLessThan(raidTicks(1, 1) / 2);
    for (const level of ENEMY_BASE_LEVELS.slice(1)) expect(raidCapacity(ENEMY_BASE_LEVELS.indexOf(level) + 1, level.raid.from - 1)).toBe(0);
  });

  it('remplit les badges le jour seulement, puis les vide à la nuit tombée', () => {
    const world = withTownHall();
    const reserve = (): number => world.enemyBases.reduce((sum, base) => sum + base.raiders, 0);
    const dusk = world.cycleStartTick + DAY_CYCLE.day;

    for (let i = 0; i < 20 * 60; i += 1) world.tick();
    const morning = reserve();

    while (world.tickCount < dusk) world.tick();
    // La grâce de la première nuit : la réserve commune monte jusqu'au plafond, pas au-delà.
    expect(reserve()).toBeGreaterThanOrEqual(morning);
    expect(reserve()).toBe(earlyCap(1));

    // Le crépuscule : plus rien ne se produit.
    const evening = JSON.stringify(world.enemyBases);

    untilNightfall(world, 1);
    expect(JSON.stringify(world.enemyBases)).toBe(evening);

    const stocked = reserve();
    const doors = world.enemyBases.filter((base) => base.raiders > 0).map((base) => ({ door: baseDoor(base), raiders: base.raiders }));

    expect(stocked).toBeGreaterThan(0);
    world.tick();
    expect(reserve()).toBe(0);
    expect(mutants(world)).toHaveLength(stocked);
    // Chaque base a fait sortir les siens à sa porte.
    for (const { door, raiders } of doors) {
      expect(mutants(world).filter((mutant) => Math.hypot(mutant.x - door.x, mutant.y - door.y) < 1.5 * TILE_SIZE)).toHaveLength(raiders);
    }

    // La nuit, rien ne se refait.
    const night = JSON.stringify(world.enemyBases);

    for (let i = 0; i < 200; i += 1) world.tick();
    expect(JSON.stringify(world.enemyBases)).toBe(night);
  });

  it('une base abattue ne produit plus rien et n’envoie plus personne', () => {
    const world = withTownHall();
    const base = firstRingBase(world);

    base.raiders = 2;
    base.hp = 0;
    expect(breed(base, 1)).toEqual({ raider: false, guard: false });

    untilNightfall(world, 1);
    expect(base.raiders).toBe(2);
    world.tick();

    const door = baseDoor(base);

    expect(mutants(world).filter((mutant) => Math.hypot(mutant.x - door.x, mutant.y - door.y) < 3 * TILE_SIZE)).toHaveLength(0);
  });

  it('ses gardiens sortent quand Adam approche, chargent Adam dans la zone sans jamais en sortir, et ne partent pas en vague', () => {
    const world = withTownHall();
    const base = firstRingBase(world);
    const center = baseCenter(base);
    const leash = WILDLIFE.guardian.leashRadius * TILE_SIZE;
    const hits = new Set<number>();

    world.events.on('playerHurt', ({ by }) => hits.add(by));
    expect(guardians(world, base)).toHaveLength(0);

    // Adam à la limite où ils se montrent, puis dans la zone.
    world.player.x = center.x;
    world.player.y = center.y + (GUARD_RANGE.showTiles - 1) * TILE_SIZE;
    for (let i = 0; i < 21; i += 1) world.tick();
    expect(guardians(world, base, 'guardian')).toHaveLength(enemyBaseLevel(base.level).guards.count);
    expect(guardians(world, base, 'spitter')).toHaveLength(enemyBaseLevel(base.level).guards.spitters);
    expect(guardians(world, base, 'chief')).toHaveLength(1);

    for (let i = 0; i < 20 * 20; i += 1) {
      // Adam dans la zone, l'arc au repos, et il reste debout : on regarde les gardiens.
      world.player.x = center.x + 3 * TILE_SIZE;
      world.player.y = center.y + 3 * TILE_SIZE;
      world.player.bowCooldown = 100;
      world.player.hp = 100;
      world.tick();
      for (const guard of guardians(world, base)) {
        expect(Math.hypot(guard.x - center.x, guard.y - center.y)).toBeLessThanOrEqual(leash + TILE_SIZE);
      }
    }
    expect(guardians(world, base).some((guard) => hits.has(guard.id))).toBe(true);

    // Adam file hors de la zone, hors de portée d'arc du chef : ils le lâchent sans sortir, puis rentrent.
    for (let i = 0; i < 20 * 10; i += 1) {
      world.player.x = center.x + (WILDLIFE.chief.giveUpRadius + 1) * TILE_SIZE;
      world.player.y = center.y;
      world.tick();
      for (const guard of guardians(world, base)) {
        expect(Math.hypot(guard.x - center.x, guard.y - center.y)).toBeLessThanOrEqual(leash + TILE_SIZE);
      }
    }
    expect(guardians(world, base).every((guard) => guard.state !== 'chase')).toBe(true);

    world.player.x = center.x + (GUARD_RANGE.hideTiles + 2) * TILE_SIZE;
    for (let i = 0; i < 21; i += 1) world.tick();
    expect(guardians(world, base)).toHaveLength(0);
    // Rentrés, pas tués.
    expect(base.guards).toBe(enemyBaseLevel(base.level).guards.count);
  });

  it('refait le jour, lentement, un gardien tombé', () => {
    const base: EnemyBase = { id: 1, tx: 0, ty: 0, level: 1, hp: ENEMY_BASE_LEVELS[0].hp, raiders: 0, brood: 0, guards: ENEMY_BASE_LEVELS[0].guards.count - 1, spitters: 1, mend: 0, chief: 36, fire: 70 };
    const { guards } = ENEMY_BASE_LEVELS[0];

    for (let i = 0; i < guards.respawnTicks - 1; i += 1) expect(breed(base, 1).guard).toBe(false);
    expect(breed(base, 1).guard).toBe(true);
    expect(base.guards).toBe(guards.count);
    for (let i = 0; i < guards.respawnTicks * 2; i += 1) breed(base, 1);
    expect(base.guards).toBe(guards.count);
  });

  it('un gardien abattu manque à sa base jusqu’à ce qu’elle le refasse', () => {
    const world = withTownHall();
    const base = firstRingBase(world);
    const center = baseCenter(base);

    world.player.x = center.x;
    world.player.y = center.y + 6 * TILE_SIZE;
    for (let i = 0; i < 21; i += 1) world.tick();

    const posted = guardians(world, base);
    let died = 0;

    world.events.on('beastDied', ({ proto }) => {
      if (proto === 'guardian') died += 1;
    });
    for (const guard of posted) guard.hp = 0.5;
    for (let i = 0; i < 400 && died === 0; i += 1) world.tick();
    expect(died).toBeGreaterThan(0);
    expect(base.guards).toBe(enemyBaseLevel(base.level).guards.count - died);
  });

  it('sauvegarde réserve, compte, gardiens et gardiens sortis ; une ancienne sauvegarde charge ses bases à réserve vide', () => {
    const world = withTownHall();
    const base = firstRingBase(world);
    const center = baseCenter(base);

    for (let i = 0; i < 20 * 120; i += 1) world.tick();
    base.raiders = 2;
    base.guards = 1;
    base.mend = 33;
    world.player.x = center.x;
    world.player.y = center.y + 20 * TILE_SIZE;
    for (let i = 0; i < 21; i += 1) world.tick();
    expect(guardians(world, base, 'guardian')).toHaveLength(1);

    const copy = deserialize(JSON.parse(JSON.stringify(serialize(world))));

    expect(copy.enemyBases).toEqual(world.enemyBases);
    expect(guardians(copy, base)).toEqual(guardians(world, base));
    for (let i = 0; i < 400; i += 1) {
      world.tick();
      copy.tick();
    }
    expect(copy.enemyBases).toEqual(world.enemyBases);
    expect(guardians(copy)).toEqual(guardians(world));

    // Une sauvegarde d'avant les sorties : ni réserve, ni compte, ni gardiens notés.
    const state = JSON.parse(JSON.stringify(serialize(world))) as Record<string, unknown>;

    for (const raw of state['enemyBases'] as Record<string, unknown>[]) {
      delete raw['raiders'];
      delete raw['brood'];
      delete raw['guards'];
      delete raw['mend'];
    }
    state['nextWaveHeading'] = 1.5;

    const old = deserialize(state);

    for (const loaded of old.enemyBases) {
      expect(loaded.raiders).toBe(0);
      expect(loaded.guards).toBe(isStanding(loaded) ? enemyBaseLevel(loaded.level).guards.count : 0);
    }
    for (let i = 0; i < 100; i += 1) old.tick();
  });

  it.skipIf(!SLOW)('deux parties de même seed produisent et lâchent les mêmes assaillants', () => {
    const run = (): string => {
      const world = withTownHall(42);

      untilNightfall(world, 2);
      for (let i = 0; i < 20 * 20; i += 1) world.tick();
      return JSON.stringify({ bases: world.enemyBases, mutants: mutants(world) });
    };

    expect(run()).toBe(run());
  }, 30_000);
});
