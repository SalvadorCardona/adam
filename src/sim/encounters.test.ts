import { describe, expect, it } from 'vitest';
import { CHUNK_TILES, TILE_SIZE } from '../core/grid.ts';
import { DISCOVERY_TIERS, discoveryTier } from '../data/discoveries.ts';
import { ENCOUNTERS, ENCOUNTER_KINDS, type EncounterKind } from '../data/encounters.ts';
import { TEST_SCENARIOS } from '../data/testScenario.ts';
import { validatePrototypes } from '../data/validate.ts';
import { encounterOfChunk, waysideOffer } from './encounters.ts';
import { decodeSave, encodeSave } from './save.ts';
import { findSpawn, resourceAt, terrainAt } from './terrain.ts';
import { stageScenario } from './testScenario.ts';
import type { Caravan, Wanderer } from './types.ts';
import { World } from './world.ts';

function run(world: World, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i += 1) {
    world.tick();
    each?.();
  }
}

function wanderers(world: World, role: Wanderer['role']): Wanderer[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Wanderer => mobile.kind === 'wanderer' && mobile.role === role);
}

function merchants(world: World): Caravan[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Caravan => mobile.kind === 'caravan' && mobile.encounterId !== undefined);
}

function standAt(world: World, x: number, y: number): void {
  Object.assign(world.player, { x, y, prevX: x, prevY: y });
}

/** Une partie de test où survivant, marchand et biche sont posés, Adam à trois pas du survivant. */
function stage(): { world: World; wounded: Wanderer; deer: Wanderer; merchant: Caravan } {
  const world = stageScenario(TEST_SCENARIOS.encounter);

  return { world, wounded: wanderers(world, 'wounded')[0]!, deer: wanderers(world, 'deer')[0]!, merchant: merchants(world)[0]! };
}

function hallDoor(world: World): { x: number; y: number } {
  const hall = world.entities.get(world.townHallId)!;

  return { x: (hall.tx + hall.width / 2) * TILE_SIZE, y: (hall.ty + hall.height + 0.5) * TILE_SIZE };
}

describe('rencontres de la route : la seed', () => {
  it('sont déterministes, sur une case nue hors de la clairière', () => {
    for (const kind of ENCOUNTER_KINDS) {
      let found = 0;

      for (let cy = -8; cy <= 8; cy += 1) {
        for (let cx = -8; cx <= 8; cx += 1) {
          const encounter = encounterOfChunk(11, kind, cx, cy);

          expect(encounterOfChunk(11, kind, cx, cy)).toEqual(encounter);
          if (!encounter) continue;
          found += 1;

          const [sx, sy] = findSpawn(11);

          expect(Math.floor(encounter.tx / CHUNK_TILES)).toBe(cx);
          expect(Math.floor(encounter.ty / CHUNK_TILES)).toBe(cy);
          expect(terrainAt(11, encounter.tx, encounter.ty)).toBe('grass');
          expect(resourceAt(11, encounter.tx, encounter.ty)).toBeNull();
          expect(Math.hypot(encounter.tx - sx, encounter.ty - sy)).toBeGreaterThanOrEqual(ENCOUNTERS.minSpawnTiles);
        }
      }
      expect(found).toBeGreaterThan(0);
    }
    // Une autre seed pose d'autres rencontres.
    const here = JSON.stringify(Array.from({ length: 30 }, (_, i) => encounterOfChunk(11, 'deer', i - 15, 2)));
    const there = JSON.stringify(Array.from({ length: 30 }, (_, i) => encounterOfChunk(12, 'deer', i - 15, 2)));

    expect(here).not.toBe(there);
  });

  it('sont plus fréquentes plus loin du départ', () => {
    for (const kind of ENCOUNTER_KINDS) {
      const hits = [0, 0, 0];
      const chunks = [0, 0, 0];

      for (let seed = 1; seed <= 60; seed += 1) {
        const [sx, sy] = findSpawn(seed);

        for (let cy = -4; cy <= 4; cy += 1) {
          for (let cx = -4; cx <= 4; cx += 1) {
            const tier = discoveryTier(Math.hypot((cx + 0.5) * CHUNK_TILES - sx, (cy + 0.5) * CHUNK_TILES - sy));

            chunks[tier]! += 1;
            if (encounterOfChunk(seed, kind, cx, cy)) hits[tier]! += 1;
          }
        }
      }
      expect(chunks.every((count) => count > 0)).toBe(true);
      expect(hits[2]! / chunks[2]!).toBeGreaterThan(hits[0]! / chunks[0]!);
    }
    expect(DISCOVERY_TIERS).toHaveLength(3);
  });

  it('donne au marchand une seule offre, rare, la même pour la même seed', () => {
    const offer = waysideOffer(5, 1234, 1);

    expect(waysideOffer(5, 1234, 1)).toEqual(offer);
    expect(offer.kind).toBe('wayside');
    expect(offer.done).toBe(false);
    expect(Object.keys(offer.items).length).toBeGreaterThan(0);
  });

  it('sont validées avec les autres données', () => {
    expect(validatePrototypes().filter((error) => error.includes('ENCOUNTERS'))).toEqual([]);
  });
});

describe('rencontres de la route : apparition', () => {
  it('se montrent à l’approche d’Adam, se rangent quand il s’éloigne, et ne reviennent pas une fois résolues', () => {
    const world = new World(31);
    const hall = world.entities.get(world.townHallId)!;
    let target: { id: number; kind: EncounterKind; tx: number; ty: number } | null = null;

    for (let radius = 1; radius < 12 && !target; radius += 1) {
      for (let dy = -radius; dy <= radius && !target; dy += 1) {
        for (let dx = -radius; dx <= radius && !target; dx += 1) {
          for (const kind of ENCOUNTER_KINDS) {
            const found = world.encounterOfChunk(kind, Math.floor(hall.tx / CHUNK_TILES) + dx, Math.floor(hall.ty / CHUNK_TILES) + dy);

            if (found && !world.isSolid(found.tx, found.ty)) target = found;
          }
        }
      }
    }
    expect(target).not.toBeNull();

    const { id, kind, tx, ty } = target!;
    const x = (tx + 0.5) * TILE_SIZE;
    const y = (ty + 0.5) * TILE_SIZE;
    const present = (): boolean => [...world.mobiles.values()].some((mobile) => (mobile.kind === 'wanderer' || mobile.kind === 'caravan') && mobile.encounterId === id);

    standAt(world, x + 10 * TILE_SIZE, y);
    run(world, 40);
    expect(present()).toBe(true);
    expect(world.isEncounterResolved(id)).toBe(false);

    standAt(world, x + 60 * TILE_SIZE, y);
    run(world, 40);
    expect(present()).toBe(false);

    standAt(world, x + 10 * TILE_SIZE, y);
    run(world, 40);
    expect(present()).toBe(true);

    // Résolue (et rangée), elle ne revient plus.
    (world as unknown as { resolveEncounter(id: number, kind: EncounterKind): void }).resolveEncounter(id, kind);
    standAt(world, x + 60 * TILE_SIZE, y);
    run(world, 40);
    standAt(world, x + 10 * TILE_SIZE, y);
    run(world, 40);
    expect(present()).toBe(false);
  });
});

describe('survivant blessé', () => {
  it('suit Adam en boitant jusqu’à la mairie, où il devient un colon', () => {
    const { world, wounded } = stage();
    const before = world.colonists;
    const events: string[] = [];
    let name = '';

    world.events.on('woundedFollowing', () => events.push('following'));
    world.events.on('survivorJoined', (event) => {
      events.push('joined');
      name = event.name;
    });

    // Adam à trois pas : il ne se passe rien tant qu'il ne le touche pas.
    run(world, 20);
    expect(wounded.state).toBe('idle');

    standAt(world, wounded.x - TILE_SIZE, wounded.y);
    run(world, 2);
    expect(wounded.state).toBe('following');

    const door = hallDoor(world);

    run(world, 600, () => {
      // Adam marche vers la mairie, d'un pas plus vif que le boiteux.
      const dx = door.x - world.player.x;
      const dy = door.y - world.player.y;
      const length = Math.hypot(dx, dy);
      const step = Math.min(length, 4.5 * TILE_SIZE * 0.05);

      if (length > 0) standAt(world, world.player.x + (dx / length) * step, world.player.y + (dy / length) * step);
    });

    expect(events).toEqual(['following', 'joined']);
    expect(name.length).toBeGreaterThan(0);
    expect(world.colonists).toBe(before + 1);
    expect(world.isEncounterResolved(wounded.encounterId)).toBe(true);

    const worker = world.mobiles.get(wounded.id);

    expect(worker?.kind).toBe('worker');
    expect(world.nameFor(worker as never)).toBe(name);
    expect(wanderers(world, 'wounded')).toHaveLength(0);
  });

  it('fuit si un ennemi l’attaque en route, puis attend qu’Adam le reprenne', () => {
    const { world, wounded } = stage();
    const fled: string[] = [];

    world.events.on('woundedFled', ({ reason }) => fled.push(reason));
    standAt(world, wounded.x - TILE_SIZE, wounded.y);
    run(world, 2);
    expect(wounded.state).toBe('following');

    (world as unknown as { spawnMutant(proto: string, emerge: number, target: number, point: { x: number; y: number }): unknown }).spawnMutant('mutant', 0, world.townHallId, { x: wounded.x + 2 * TILE_SIZE, y: wounded.y });
    run(world, 2);
    expect(wounded.state).toBe('fleeing');
    expect(fled).toEqual(['scare']);

    const from = { x: wounded.x, y: wounded.y };

    run(world, 20);
    expect(Math.hypot(wounded.x - from.x, wounded.y - from.y)).toBeGreaterThan(TILE_SIZE);
    run(world, ENCOUNTERS.wounded.fleeTicks + 5);
    expect(wounded.state).toBe('idle');
    expect(world.colonists).toBe(10);
  });

  it('renonce à suivre Adam resté trop loin', () => {
    const { world, wounded } = stage();
    const fled: string[] = [];

    world.events.on('woundedFled', ({ reason }) => fled.push(reason));
    standAt(world, wounded.x - TILE_SIZE, wounded.y);
    run(world, 2);
    // Adam file plus vite que le boiteux : l'écart grandit jusqu'à ce qu'il renonce.
    run(world, 1000, () => {
      // Aucun ennemi alentour : seule la distance compte.
      for (const mobile of [...world.mobiles.values()]) if (mobile.kind === 'mutant' || mobile.kind === 'beast') world.mobiles.delete(mobile.id);
      standAt(world, world.player.x - 4.5 * TILE_SIZE * 0.05, world.player.y);
    });
    expect(wounded.state).toBe('idle');
    expect(fled).toEqual(['lost']);
  });
});

describe('marchand ambulant', () => {
  it('propose une seule offre sur place, la paie, puis repart — sans être la caravane du calendrier', () => {
    const { world, merchant } = stage();

    expect(world.caravan()).toBeUndefined();
    expect(merchant.offers).toHaveLength(1);

    const [offer] = merchant.offers;
    const reached: number[] = [];

    world.events.on('caravanReached', ({ id }) => reached.push(id));
    standAt(world, merchant.x, merchant.y + 10);
    run(world, 2);
    expect(reached).toEqual([merchant.id]);

    world.push({ type: 'trade', caravan: merchant.id, offer: 0 });
    run(world, 2);
    for (const [item, amount] of Object.entries(offer!.items)) {
      expect(world.player.inventory.count(item as never) + (world.townStock()?.count(item as never) ?? 0)).toBeGreaterThanOrEqual(amount);
    }
    expect(world.isEncounterResolved(merchant.encounterId!)).toBe(true);

    run(world, 400);
    expect(merchants(world)).toHaveLength(0);
  });

  it('refuse l’échange sans de quoi payer', () => {
    const { world, merchant } = stage();
    const rejected: string[] = [];

    world.events.on('tradeRejected', ({ reason }) => rejected.push(reason));
    for (const [item, count] of world.player.inventory.entries()) world.player.inventory.remove(item, count);
    standAt(world, merchant.x, merchant.y + 10);
    world.push({ type: 'trade', caravan: merchant.id, offer: 0 });
    run(world, 2);
    expect(rejected).toEqual(['missingItems']);
    expect(world.isEncounterResolved(merchant.encounterId!)).toBe(false);
  });
});

describe('biche dorée', () => {
  it('fuit Adam quand il s’approche trop', () => {
    const { world, deer } = stage();

    standAt(world, deer.x - TILE_SIZE, deer.y);
    run(world, 2);
    expect(deer.state).toBe('fleeing');

    const gap = (): number => Math.hypot(deer.x - world.player.x, deer.y - world.player.y);
    const before = gap();

    run(world, 20);
    expect(gap()).toBeGreaterThan(before);
  });

  it('se laisse approcher si Adam reste à portée, et laisse une pièce de garde-robe', () => {
    const { world, deer } = stage();
    const caught: number[] = [];
    const pieces = world.player.wardrobe.length;
    const found: string[] = [];

    world.events.on('deerCaught', ({ id }) => caught.push(id));
    world.events.on('pieceFound', ({ source }) => found.push(source));

    run(world, ENCOUNTERS.deer.catchTicks + 20, () => {
      if (deer.state === 'fleeing' || !world.mobiles.has(deer.id)) return;
      // À portée sans la serrer : à 3,5 tuiles de sa position.
      standAt(world, deer.x + 3.5 * TILE_SIZE, deer.y);
    });
    expect(caught).toEqual([deer.id]);
    expect(found).toEqual(['encounter']);
    expect(world.player.wardrobe.length).toBe(pieces + 1);
    expect(world.mobiles.has(deer.id)).toBe(false);
    expect(world.isEncounterResolved(deer.encounterId)).toBe(true);
  });

  it('perd sa jauge si Adam s’éloigne', () => {
    const { world, deer } = stage();

    standAt(world, deer.x + 3.5 * TILE_SIZE, deer.y);
    run(world, 30);
    expect(deer.gauge).toBeGreaterThan(0);
    standAt(world, deer.x + 20 * TILE_SIZE, deer.y);
    run(world, 120);
    expect(deer.gauge).toBe(0);
  });
});

describe('rencontres : sauvegarde', () => {
  /** Les rencontres résolues telles que le fichier de sauvegarde les écrit. */
  const written = (world: World): number[] => (JSON.parse(encodeSave(world, 0)) as { state: { encounters: number[] } }).state.encounters;

  function reload(world: World): World {
    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error('sauvegarde illisible');
    return decoded.world;
  }

  it('garde les rencontres résolues et le survivant qui suit Adam', () => {
    const { world, wounded, deer } = stage();

    standAt(world, wounded.x - TILE_SIZE, wounded.y);
    run(world, 2);
    (world as unknown as { resolveEncounter(id: number, kind: EncounterKind): void }).resolveEncounter(deer.encounterId, 'deer');

    const loaded = reload(world);
    const saved = wanderers(loaded, 'wounded')[0]!;

    expect(loaded.isEncounterResolved(deer.encounterId)).toBe(true);
    expect(loaded.isEncounterResolved(wounded.encounterId)).toBe(false);
    expect(saved).toMatchObject({ id: wounded.id, state: 'following', encounterId: wounded.encounterId, sex: wounded.sex });
    expect(merchants(loaded)[0]?.encounterId).toBe(merchants(world)[0]!.encounterId);
    expect(loaded.caravan()).toBeUndefined();
    // Écrit à nouveau, la partie rechargée est la même.
    expect(written(loaded)).toEqual(written(world));
  });

  it('lit une ancienne sauvegarde, sans rencontre résolue', () => {
    const world = new World(9);
    const file = JSON.parse(encodeSave(world, 0)) as { state: Record<string, unknown> };

    delete file.state['encounters'];

    const decoded = decodeSave(JSON.stringify(file));

    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(written(decoded.world)).toEqual([]);
  });

  it('est la même pour deux parties de même seed et mêmes gestes', () => {
    const a = stage();
    const b = stage();

    for (const { world, wounded } of [a, b]) {
      standAt(world, wounded.x - TILE_SIZE, wounded.y);
      run(world, 100);
    }
    expect(a.world.checksum()).toBe(b.world.checksum());
  });
});
