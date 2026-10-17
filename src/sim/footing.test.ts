import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import { RECIPES } from '../data/recipes.ts';
import type { PlacementRejection } from './commands.ts';
import { footingAt, footingHalf } from './footing.ts';
import { decodeSave, encodeSave } from './save.ts';
import { findSpawn, homeOres, oreAt, terrainAt } from './terrain.ts';
import { World } from './world.ts';
import { SWEEP_SEEDS } from './sweep.ts';

const DRILL = BUILDINGS.drill;
const DEPOSITS = DRILL.deposits;
/** Assez près du départ pour qu'aucune base mutante n'y tienne sa zone. */
const CLEARING = 20;

/** Ce que porte une case : le filon s'il y en a un, sinon le terrain. */
type Cell = ItemId | 'grass' | 'sand' | 'water' | 'rock';

function cellAt(seed: number, tx: number, ty: number): Cell {
  return oreAt(seed, tx, ty)?.item ?? terrainAt(seed, tx, ty);
}

function cellsOf(seed: number, tx: number, ty: number): Cell[] {
  const cells: Cell[] = [];

  for (let y = ty; y < ty + DRILL.height; y += 1) {
    for (let x = tx; x < tx + DRILL.width; x += 1) cells.push(cellAt(seed, x, y));
  }
  return cells;
}

const count = (cells: readonly Cell[], cell: Cell): number => cells.filter((c) => c === cell).length;

/**
 * La première emprise de foreuse, près d'un départ, dont les cases passent
 * le filtre : la carte n'est jamais stockée, on cherche la combinaison voulue
 * dans les seeds plutôt que de la fabriquer. Une emprise à poser reste dans
 * la clairière (`reach` court) : plus loin, les bases mutantes tiennent leur zone.
 */
function find(accept: (cells: Cell[]) => boolean, reach = 40): { seed: number; tx: number; ty: number } {
  for (let seed = 1; seed < 400; seed += 1) {
    const [sx, sy] = findSpawn(seed);

    for (let ty = sy - reach; ty <= sy + reach; ty += 1) {
      for (let tx = sx - reach; tx <= sx + reach; tx += 1) {
        if (accept(cellsOf(seed, tx, ty))) return { seed, tx, ty };
      }
    }
  }
  throw new Error('combinaison introuvable — la génération des filons a changé');
}

/** Une partie où Adam se tient à côté de l'emprise et en a cassé les rochers. */
function worldAt(seed: number, tx: number, ty: number): World {
  const world = new World(seed);

  for (let y = ty; y < ty + DRILL.height; y += 1) {
    for (let x = tx; x < tx + DRILL.width; x += 1) world.resources.clear(x, y);
  }
  world.player.x = (tx - 0.5) * TILE_SIZE;
  world.player.y = (ty + DRILL.height + 0.5) * TILE_SIZE;
  return world;
}

/** Pousse la pose et rend ce que le tick en a dit : le refus et son filon, ou `null` s'il l'a posée. */
function place(world: World, tx: number, ty: number): { reason: PlacementRejection; ore: ItemId | null } | null {
  let refused: { reason: PlacementRejection; ore: ItemId | null } | null = null;

  world.events.on('placementRejected', (event) => (refused = event));
  world.push({ type: 'placeBuilding', building: 'drill', tx, ty });
  world.tick();
  return refused;
}

describe('assise d’une foreuse', () => {
  it('moitié filon, moitié herbe : deux et deux pour un 2 × 2', () => {
    expect(footingHalf(DRILL.width, DRILL.height)).toBe(2);
    // Une emprise d'aire impaire donne sa case de trop à l'herbe.
    expect(footingHalf(3, 3)).toBe(4);
  });

  for (const ore of DEPOSITS) {
    it(`accepte 2 cases de ${ore} et 2 d’herbe, et la foreuse extrait ${ore}`, () => {
      const { seed, tx, ty } = find((cells) => count(cells, ore) === 2 && count(cells, 'grass') === 2, CLEARING);
      const footing = footingAt(seed, DEPOSITS, tx, ty, DRILL.width, DRILL.height);

      expect(footing.valid).toBe(true);
      expect(footing.ore).toBe(ore);
      expect(footing.tiles.map((tile) => tile.state).sort()).toEqual(['grass', 'grass', 'ore', 'ore']);

      const world = worldAt(seed, tx, ty);

      expect(world.placementBlock('drill', tx, ty)).toBeNull();
      expect(place(world, tx, ty)).toBeNull();

      const site = [...world.entities.values()].find((entity) => entity.proto === 'drill');

      expect(site?.kind).toBe('site');
      expect(world.oreUnder('drill', tx, ty)).toBe(ore);
    });

    it(`refuse 4 cases de ${ore}, en le nommant`, () => {
      const { seed, tx, ty } = find((cells) => count(cells, ore) === 4);
      const world = worldAt(seed, tx, ty);
      const block = world.placementBlock('drill', tx, ty);

      expect(block?.reason).toBe('footing');
      expect(block?.ore).toBe(ore);
      // Les deux cases de filon en trop sont fautives.
      expect(block?.tiles).toHaveLength(2);
      expect(place(world, tx, ty)).toEqual({ reason: 'footing', ore });
      expect([...world.entities.values()].some((entity) => entity.proto === 'drill')).toBe(false);
    });
  }

  const refusals: [string, (cells: Cell[]) => boolean, number][] = [
    ['3 cases de filon et 1 d’herbe', (cells) => count(cells, 'ironOre') === 3 && count(cells, 'grass') === 1, 1],
    ['1 case de filon et 3 d’herbe', (cells) => count(cells, 'ironOre') === 1 && count(cells, 'grass') === 3, 1],
    ['4 cases d’herbe', (cells) => count(cells, 'grass') === 4, 2],
    ['2 cases de filon et du sable', (cells) => count(cells, 'ironOre') === 2 && count(cells, 'sand') > 0, 0],
    ['2 cases de filon et de l’eau', (cells) => count(cells, 'ironOre') === 2 && count(cells, 'water') > 0, 0],
    ['2 cases de filon et de la roche', (cells) => count(cells, 'stone') === 2 && count(cells, 'rock') > 0, 0],
    [
      'deux filons différents',
      (cells) => DEPOSITS.filter((ore) => count(cells, ore) > 0).length === 2 && count(cells, 'grass') === 0,
      0,
    ],
  ];

  for (const [name, accept, wrong] of refusals) {
    it(`refuse ${name}`, () => {
      const { seed, tx, ty } = find(accept);
      const footing = footingAt(seed, DEPOSITS, tx, ty, DRILL.width, DRILL.height);
      const world = worldAt(seed, tx, ty);
      const block = world.placementBlock('drill', tx, ty);

      expect(footing.valid).toBe(false);
      if (wrong > 0) expect(footing.tiles.filter((tile) => tile.state === 'wrong')).toHaveLength(wrong);
      // Le juge du fantôme et celui du tick : la même faute, les mêmes cases.
      expect(block?.reason).toBe('footing');
      expect(block?.tiles).toEqual(
        footing.tiles.filter((tile) => tile.state === 'wrong').map(({ tx: x, ty: y }) => ({ tx: x, ty: y })),
      );
      expect(place(world, tx, ty)).toEqual({ reason: 'footing', ore: footing.ore });
    });
  }

  it('refuse une case d’herbe déjà bâtie', () => {
    const { seed, tx, ty } = find((cells) => count(cells, 'ironOre') === 2 && count(cells, 'grass') === 2, CLEARING);
    const world = worldAt(seed, tx, ty);
    const grass = world.footing('drill', tx, ty)!.tiles.find((tile) => tile.state === 'grass')!;

    // Une maison collée à la foreuse, sur une de ses cases d'herbe.
    world.chunks.occupy(999_999, grass.tx, grass.ty, 1, 1);
    expect(world.canPlace('drill', tx, ty)).toBe('occupied');
  });

  it('les filons du départ ont chacun un bord où poser une foreuse, sur un balayage de seeds', () => {
    for (let seed = 0; seed < SWEEP_SEEDS; seed += 1) {
      for (const node of homeOres(seed)) {
        let found = false;

        for (let ty = node.ty - node.radius - 1; ty <= node.ty + node.radius && !found; ty += 1) {
          for (let tx = node.tx - node.radius - 1; tx <= node.tx + node.radius && !found; tx += 1) {
            const footing = footingAt(seed, DEPOSITS, tx, ty, DRILL.width, DRILL.height);

            found =
              footing.valid && footing.tiles.some((tile) => tile.state === 'ore' && oreAt(seed, tile.tx, tile.ty)?.id === node.id);
          }
        }
        expect({ seed, ore: node.item, found }).toEqual({ seed, ore: node.item, found: true });
      }
    }
  }, 30_000);
});

describe('foreuse d’une ancienne sauvegarde', () => {
  /*
   * Avant la règle, une foreuse se posait sur n'importe quelle case de
   * filon — plein filon compris. Elle reste où elle est, et elle extrait.
   */
  it('reste en place hors de la règle, et continue d’extraire', () => {
    const { seed, tx, ty } = find((cells) => count(cells, 'ironOre') === 2 && count(cells, 'grass') === 2, CLEARING);
    const world = worldAt(seed, tx, ty);

    expect(place(world, tx, ty)).toBeNull();

    const site = [...world.entities.values()].find((entity) => entity.proto === 'drill')!;

    // Le chantier rempli depuis le sac : la foreuse est debout, et extrait.
    for (const [item, amount] of Object.entries(DRILL.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
    world.push({ type: 'transferToSite', id: site.id });
    world.tick();
    expect(world.entities.get(site.id)?.kind).toBe('drill');

    // La sauvegarde la met en plein filon de fer, comme l'ancienne règle le permettait.
    const iron = homeOres(seed).find((node) => node.item === 'ironOre')!;
    const old = { tx: iron.tx, ty: iron.ty };
    const file = JSON.parse(encodeSave(world, 0)) as { state: { entities: Record<string, unknown>[] } };

    Object.assign(file.state.entities.find((entity) => entity['id'] === site.id)!, old);
    expect(footingAt(seed, DEPOSITS, old.tx, old.ty, DRILL.width, DRILL.height).valid).toBe(false);

    const loaded = decodeSave(JSON.stringify(file));

    if (!loaded.ok) throw new Error(`sauvegarde refusée : ${loaded.reason}`);

    const drill = loaded.world.entities.get(site.id);

    if (drill?.kind !== 'drill') throw new Error('la foreuse n’a pas survécu au chargement');
    expect([drill.tx, drill.ty]).toEqual([old.tx, old.ty]);
    // Pas de rocher né sous elle : le filon a pris un bord, ses cases bâties restent nues.
    for (let y = old.ty; y < old.ty + DRILL.height; y += 1) {
      for (let x = old.tx; x < old.tx + DRILL.width; x += 1) expect(loaded.world.resources.at(x, y)).toBeNull();
    }

    for (let i = 0; i < RECIPES.mineOre.duration * 3; i += 1) loaded.world.tick();
    expect(drill.store.count('ironOre')).toBeGreaterThan(0);
  });
});
