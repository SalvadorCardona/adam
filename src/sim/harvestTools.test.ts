import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, nextUpgrade } from '../data/buildings.ts';
import { MAX_TOOL, TOOL_GEAR, toolOf } from '../data/gear.ts';
import { TOWN_PLENTY, type ItemId } from '../data/items.ts';
import { RESOURCES } from '../data/resources.ts';
import { decodeSave, encodeSave } from './save.ts';
import { SPARE_CARRY } from './player.ts';
import { HARVEST_PASS_TICKS, HARVEST_REACH_TILES, World } from './world.ts';

/** Un monde neuf, mairie bâtie, et une ressource de surface à deux pas d'Adam. */
function withNode(): { world: World; tx: number; ty: number; item: ItemId } {
  for (let seed = 1; seed < 200; seed += 1) {
    const world = new World(seed);

    for (let dy = -12; dy <= 12; dy += 1) {
      for (let dx = -12; dx <= 12; dx += 1) {
        const tx = Math.floor(world.player.x / TILE_SIZE) + dx;
        const ty = Math.floor(world.player.y / TILE_SIZE) + dy;
        const resource = world.resources.at(tx, ty);

        if (resource && RESOURCES[resource.id].item === 'wood') return { world, tx, ty, item: 'wood' };
      }
    }
  }
  throw new Error('aucun arbre — la génération a changé');
}

/** Rien d'autre que ce nœud à portée : on ne mesure que lui. */
function clearAround(world: World, tx: number, ty: number): void {
  for (let y = ty - 6; y <= ty + 6; y += 1) {
    for (let x = tx - 6; x <= tx + 6; x += 1) {
      if (x === tx && y === ty) continue;
      while (world.resources.at(x, y)) world.resources.take(x, y);
    }
  }
}

/** Pose Adam à `tiles` cases du centre de la tuile, sans autre ressource alentour, et laisse passer un passage de récolte. */
function harvestAt(tiles: number): number {
  const { world, tx, ty, item } = withNode();

  clearAround(world, tx, ty);
  world.player.x = (tx + 0.5) * TILE_SIZE + tiles * TILE_SIZE;
  world.player.y = (ty + 0.5) * TILE_SIZE;
  world.player.inventory.remove(item, world.player.inventory.count(item));
  for (let i = 0; i < HARVEST_PASS_TICKS; i += 1) world.tick();
  return world.player.inventory.count(item);
}

describe('portée de la récolte', () => {
  it('passe de 1,25 à 1,75 tuile', () => {
    expect(HARVEST_REACH_TILES).toBe(1.75);
  });

  it('récolte à une tuile et demie, plus rien à deux', () => {
    expect(harvestAt(1.5)).toBeGreaterThan(0);
    expect(harvestAt(1.9)).toBe(0);
  });
});

describe('la ville a assez', () => {
  it('le seuil est à 150', () => {
    expect(TOWN_PLENTY).toBe(150);
  });

  it('Adam continue de récolter tant qu’un besoin posé l’attend', () => {
    const world = new World(1);

    for (const [item, amount] of Object.entries(BUILDINGS.townHall.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    // La mairie peut s'améliorer en pierre : son coût en bois est un besoin posé.
    const upgrade = nextUpgrade('townHall', 1)!;
    const wood = (upgrade.cost)['wood'] ?? 0;

    expect(wood).toBeGreaterThan(0);
    expect(world.placedNeed('wood')).toBe(wood);

    // Un chantier posé s'y ajoute.
    const hall = world.entities.get(world.townHallId)!;
    let placed = false;

    for (let dx = -8; dx <= 8 && !placed; dx += 1) {
      if (world.canPlace('home', hall.tx + dx, hall.ty + hall.height + 1) !== null) continue;
      world.push({ type: 'placeBuilding', building: 'home', tx: hall.tx + dx, ty: hall.ty + hall.height + 1 });
      world.tick();
      placed = true;
    }
    expect(placed).toBe(true);
    expect(world.placedNeed('wood')).toBeGreaterThan(wood);

    // Le stock couvre tout : la ville a assez, mais le chantier garde sa part dans le sac.
    world.townStock()!.add('wood', TOWN_PLENTY);
    expect(world.townHasPlenty('wood')).toBe(true);
    expect(world.carryLimit('wood')).toBeGreaterThan(SPARE_CARRY);
  });
});

describe('hache et pioche', () => {
  it('ont trois niveaux, chacun avec un coût', () => {
    expect(MAX_TOOL).toBe(3);
    for (const slot of ['axe', 'pickaxe'] as const) {
      expect(TOOL_GEAR[slot]).toHaveLength(MAX_TOOL);
      for (let level = 1; level <= MAX_TOOL; level += 1) expect(Object.keys(toolOf(slot, level).cost).length).toBeGreaterThan(0);
    }
  });

  it('s’ajoutent à World.bonus en un seul point', () => {
    const world = new World(1);

    expect(world.bonus('woodYield')).toBe(0);
    expect(world.bonus('oreYield')).toBe(0);
    world.player.axe = 2;
    world.player.pickaxe = 3;
    expect(world.bonus('woodYield')).toBe(2);
    expect(world.bonus('oreYield')).toBe(3);
  });

  it('donnent une unité de plus par coup à chaque niveau de hache', () => {
    const base = harvestAt(0);
    const { world, tx, ty, item } = withNode();

    clearAround(world, tx, ty);
    expect(base).toBe(1);
    world.player.axe = 2;
    world.player.x = (tx + 0.5) * TILE_SIZE;
    world.player.y = (ty + 0.5) * TILE_SIZE;
    world.player.inventory.remove(item, world.player.inventory.count(item));
    for (let i = 0; i < HARVEST_PASS_TICKS; i += 1) world.tick();
    expect(world.player.inventory.count(item)).toBeGreaterThanOrEqual(3);
  });

  it('se forgent à la forge, payés le sac d’abord', () => {
    const world = new World(1);

    for (const [item, amount] of Object.entries(BUILDINGS.townHall.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();
    world.researchDone.push('mining', 'metalworking');

    const hall = world.entities.get(world.townHallId)!;
    let forge: number | null = null;

    for (let dx = -8; dx <= 8 && forge === null; dx += 1) {
      const [tx, ty] = [hall.tx + dx, hall.ty + hall.height + 1];

      if (world.canPlace('forge', tx, ty) !== null) continue;
      for (const [item, amount] of Object.entries(BUILDINGS.forge.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
      world.push({ type: 'placeBuilding', building: 'forge', tx, ty });
      world.tick();
      forge = [...world.entities.values()].find((entity) => entity.kind === 'site')!.id;
      world.push({ type: 'transferToSite', id: forge });
      world.tick();
    }
    expect(forge).not.toBeNull();
    for (const [item, amount] of world.player.inventory.entries()) world.player.inventory.remove(item, amount);

    const rejected: string[] = [];

    world.events.on('gearRejected', ({ reason }) => rejected.push(reason));
    world.push({ type: 'craftTool', forge: forge!, slot: 'axe' });
    world.tick();
    expect(rejected).toEqual(['missingItems']);

    for (const [item, amount] of Object.entries(toolOf('axe', 1).cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
    world.push({ type: 'craftTool', forge: forge!, slot: 'axe' });
    world.tick();
    expect(world.player.axe).toBe(1);
    expect(world.player.pickaxe).toBe(0);
    expect(world.bonus('woodYield')).toBe(1);
  });

  it('sont sauvegardés avec le joueur', () => {
    const world = new World(1);

    world.player.axe = 1;
    world.player.pickaxe = 3;

    const loaded = decodeSave(encodeSave(world, 0));

    expect(loaded.ok && loaded.world.player.axe).toBe(1);
    expect(loaded.ok && loaded.world.player.pickaxe).toBe(3);
  });
});
