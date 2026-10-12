import { describe, expect, it } from 'vitest';
import { CHUNK_TILES, TILE_SIZE } from '../core/grid.ts';
import { DISCOVERIES, DISCOVERY_KINDS, DISCOVERY_TIERS, discoveryTier } from '../data/discoveries.ts';
import { validatePrototypes } from '../data/validate.ts';
import { chestOfChunk } from './chests.ts';
import { rollDiscoveryLoot, rollRuinReward, spotOfChunk, tierAt, type Spot } from './discoveries.ts';
import { oreAt, resourceAt, terrainAt } from './terrain.ts';
import { deserialize } from './save.ts';
import { World } from './world.ts';

const SEEDS = [1, 7, 42, 100, 2024];

function spots(seed: number, kind: 'ruin' | 'secret', radius: number): Spot[] {
  const found: Spot[] = [];

  for (let cy = -radius; cy <= radius; cy += 1) {
    for (let cx = -radius; cx <= radius; cx += 1) {
      const spot = spotOfChunk(seed, kind, cx, cy);

      if (spot) found.push(spot);
    }
  }
  return found;
}

/** Pose Adam sur la case et laisse le monde tourner un tick. */
function stand(world: World, tx: number, ty: number): void {
  world.player.x = world.player.prevX = (tx + 0.5) * TILE_SIZE;
  world.player.y = world.player.prevY = (ty + 0.5) * TILE_SIZE;
  world.tick();
}

describe('points d’intérêt : la config', () => {
  it('passe la validation des prototypes', () => {
    expect(validatePrototypes()).toEqual([]);
  });

  it('les paliers croissent, et la densité aussi avec la distance', () => {
    expect(discoveryTier(0)).toBe(0);
    expect(discoveryTier(DISCOVERY_TIERS[2])).toBe(2);
    for (const kind of DISCOVERY_KINDS) {
      const { chance } = DISCOVERIES[kind];

      expect(chance[2]).toBeGreaterThanOrEqual(chance[0]);
    }
  });
});

describe('ruines et secrets : la seed', () => {
  it('les pose toujours aux mêmes endroits, sur une case nue — un secret au pied d’un arbre', () => {
    for (const seed of SEEDS) {
      for (const kind of ['ruin', 'secret'] as const) {
        const found = spots(seed, kind, 5);

        expect(found.length, `${kind} seed ${seed}`).toBeGreaterThan(0);
        expect(spots(seed, kind, 5)).toEqual(found);
        for (const spot of found) {
          expect(resourceAt(seed, spot.tx, spot.ty)).toBeNull();
          expect(oreAt(seed, spot.tx, spot.ty)).toBeNull();
          expect(['grass', 'sand']).toContain(terrainAt(seed, spot.tx, spot.ty));
          expect(spot.tier).toBe(tierAt(seed, spot.tx, spot.ty));
          if (kind === 'secret') {
            const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => resourceAt(seed, spot.tx + dx!, spot.ty + dy!) === 'tree');

            expect(next).toBe(true);
          }
        }
      }
    }
  });

  it('plus on s’éloigne du départ, plus il y en a', () => {
    for (const seed of SEEDS) {
      let near = 0;
      let far = 0;

      for (let cy = -8; cy <= 8; cy += 1) {
        for (let cx = -8; cx <= 8; cx += 1) {
          const distance = Math.hypot(cx * CHUNK_TILES, cy * CHUNK_TILES);

          for (const spot of [chestOfChunk(seed, cx, cy), spotOfChunk(seed, 'ruin', cx, cy), spotOfChunk(seed, 'secret', cx, cy)]) {
            if (!spot) continue;
            if (distance < 44) near += 1;
            else if (distance >= 66) far += 1;
          }
        }
      }
      // Quelques chunks près du départ contre beaucoup plus loin : on compare par chunk.
      const nearChunks = Math.PI * 44 ** 2 / CHUNK_TILES ** 2;
      const farChunks = 17 * 17 - Math.PI * 66 ** 2 / CHUNK_TILES ** 2;

      expect(far / farChunks, `seed ${seed}`).toBeGreaterThan(near / nearChunks);
    }
  });

  it('le butin est déterministe, dans la table, et meilleur au palier le plus loin', () => {
    for (const table of DISCOVERIES.chest.loot) {
      const allowed = new Set([...table.pool, ...table.rare.pool].map((entry) => entry.item));

      for (let id = 0; id < 50; id += 1) {
        const loot = rollDiscoveryLoot(3, id, table);

        expect(rollDiscoveryLoot(3, id, table)).toEqual(loot);
        expect(loot.length).toBeGreaterThan(0);
        for (const [item, amount] of loot) {
          expect(allowed.has(item)).toBe(true);
          expect(amount).toBeGreaterThan(0);
        }
      }
    }

    const total = (tier: number): number => {
      let sum = 0;

      for (let id = 0; id < 300; id += 1) for (const [, amount] of rollDiscoveryLoot(5, id, DISCOVERIES.chest.loot[tier]!)) sum += amount;
      return sum;
    };

    expect(total(2)).toBeGreaterThan(total(0));
  });

  it('une ruine donne un plan seulement s’il en reste', () => {
    for (let id = 0; id < 200; id += 1) {
      for (const tier of [0, 1, 2]) expect(rollRuinReward(9, id, tier, 0)).not.toBe('plan');
    }

    const rewards = new Set<string>();

    for (let id = 0; id < 200; id += 1) rewards.add(rollRuinReward(9, id, 2, 2));
    expect(rewards).toEqual(new Set(['plan', 'piece', 'research']));
  });
});

describe('Adam fouille', () => {
  it('une ruine donne sa récompense, une fois ; elle reste fouillée après une sauvegarde', () => {
    const world = World.newColony(7);
    const spot = spots(7, 'ruin', 4).find((candidate) => world.spotOfChunk('ruin', Math.floor(candidate.tx / CHUNK_TILES), Math.floor(candidate.ty / CHUNK_TILES)) !== null)!;
    const finds: string[] = [];

    world.events.on('discoveryFound', ({ kind, reward }) => finds.push(`${kind}:${reward}`));
    expect(world.isFound(spot.id)).toBe(false);
    stand(world, spot.tx, spot.ty);
    expect(finds).toHaveLength(1);
    expect(world.isFound(spot.id)).toBe(true);

    stand(world, spot.tx, spot.ty);
    expect(finds).toHaveLength(1);

    const copy = deserialize(JSON.parse(JSON.stringify(world.snapshot())));
    const again: string[] = [];

    copy.events.on('discoveryFound', ({ kind }) => again.push(kind));
    expect(copy.isFound(spot.id)).toBe(true);
    stand(copy, spot.tx, spot.ty);
    expect(again).toEqual([]);
  });

  it('un secret verse son butin dans le sac', () => {
    const world = World.newColony(7);
    const spot = spots(7, 'secret', 4).find((candidate) => world.spotOfChunk('secret', Math.floor(candidate.tx / CHUNK_TILES), Math.floor(candidate.ty / CHUNK_TILES)) !== null)!;
    const finds: { items: [string, number][] }[] = [];

    world.events.on('discoveryFound', (find) => finds.push(find));
    stand(world, spot.tx, spot.ty);
    expect(finds).toHaveLength(1);
    expect(finds[0]!.items.length).toBeGreaterThan(0);
    for (const [item, amount] of finds[0]!.items) expect(world.player.inventory.count(item as 'wood')).toBeGreaterThanOrEqual(amount);
  });

  it('un coffre donne du butin en plus de sa pièce', () => {
    const world = World.newColony(7);
    const finds: { kind: string; items: [string, number][] }[] = [];
    const chest = [-2, -1, 0, 1, 2].flatMap((cy) => [-2, -1, 0, 1, 2].map((cx) => world.chestOfChunk(cx, cy))).find((candidate) => candidate !== null)!;

    world.events.on('discoveryFound', (find) => finds.push(find));
    stand(world, chest.tx, chest.ty);
    expect(finds.map(({ kind }) => kind)).toEqual(['chest']);
    expect(finds[0]!.items.length).toBeGreaterThan(0);
  });

  it('les anciennes sauvegardes se chargent sans ruines trouvées', () => {
    const world = World.newColony(7);
    const state = JSON.parse(JSON.stringify(world.snapshot())) as Record<string, unknown>;

    delete state.spots;
    delete state.chests;
    expect(() => deserialize(state)).not.toThrow();
  });
});
