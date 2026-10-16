import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { RESOURCES } from '../data/resources.ts';
import { findDeposit } from './deposits.ts';
import { terrainAt } from './terrain.ts';
import { World } from './world.ts';

const SEEDS = [1, 42, 99, 1234];
const nothingSeen = (): boolean => false;
const everythingSeen = (): boolean => true;

describe('findDeposit', () => {
  it('trouve toujours de la pierre et du bois autour du départ', () => {
    for (const seed of SEEDS) {
      const world = new World(seed);
      const { x, y } = world.player;

      for (const item of ['stone', 'wood'] as const) {
        const deposit = findDeposit(world, item, x, y, nothingSeen);

        expect(deposit, `${item}, seed ${seed}`).not.toBeNull();
        expect(RESOURCES[world.resources.at(deposit!.tx, deposit!.ty)!.id].item).toBe(item);
        expect(deposit!.known).toBe(false);
      }
    }
  });

  it('préfère ce qui a déjà été vu, même plus loin', () => {
    const world = new World(42);
    const { x, y } = world.player;
    const nearest = findDeposit(world, 'stone', x, y, everythingSeen)!;
    const hidden = (tx: number, ty: number): boolean => tx !== nearest.tx || ty !== nearest.ty;
    const other = findDeposit(world, 'stone', x, y, hidden)!;

    expect(nearest.known).toBe(true);
    expect(other.known).toBe(true);
    expect(other).not.toEqual(nearest);
  });

  it('oublie un rocher vidé', () => {
    const world = new World(42);
    const { x, y } = world.player;
    const first = findDeposit(world, 'stone', x, y, everythingSeen)!;

    while (world.resources.take(first.tx, first.ty));

    const next = findDeposit(world, 'stone', x, y, everythingSeen)!;

    expect(next).not.toEqual(first);
  });

  it('prend le plus proche', () => {
    const world = new World(99);
    const x = world.player.x;
    const y = world.player.y;
    const deposit = findDeposit(world, 'wood', x, y, everythingSeen)!;
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    const best = (deposit.tx - tx) ** 2 + (deposit.ty - ty) ** 2;

    for (let dy = -12; dy <= 12; dy += 1) {
      for (let dx = -12; dx <= 12; dx += 1) {
        if (dx * dx + dy * dy >= best) continue;
        expect(world.resources.at(tx + dx, ty + dy)?.id).not.toBe('tree');
      }
    }
  });

  it('ne cherche rien pour un objet sans gisement', () => {
    const world = new World(1);

    expect(findDeposit(world, 'food', world.player.x, world.player.y, everythingSeen)).toBeNull();
  });
});

describe('findDeposit — l’eau du puits', () => {
  it('montre la tuile d’eau la plus proche, vue ou non', () => {
    for (const seed of [7, 2026, 12345]) {
      const world = World.newColony(seed);
      const found = findDeposit(world, 'water', world.player.x, world.player.y, () => false);

      expect(found).not.toBeNull();
      expect(terrainAt(seed, found!.tx, found!.ty)).toBe('water');
      expect(found!.known).toBe(false);
      expect(findDeposit(world, 'water', world.player.x, world.player.y, () => true)?.known).toBe(true);
    }
  });
});
