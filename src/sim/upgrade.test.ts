import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, MENU_BUILDING_IDS, buildingLevel, maxLevel, nextUpgrade } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { UpgradeRejection } from './commands.ts';
import { SAVE_VERSION, decodeSave, encodeSave } from './save.ts';
import type { Tower } from './types.ts';
import { World } from './world.ts';

const REINFORCE = nextUpgrade('watchtower', 1)!;

/** Un monde neuf, mairie bâtie, et une tour de guet finie juste à côté — dans le rayon de la ville. */
function withTower(seed = 11): { world: World; tower: Tower } {
  const world = new World(seed);

  for (const [item, amount] of Object.entries(BUILDINGS.townHall.cost) as [ItemId, number][]) {
    world.player.inventory.add(item, amount);
  }
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();

  const hall = world.entities.get(world.townHallId)!;

  for (let dx = -6; dx <= 6; dx += 1) {
    const tx = hall.tx + dx;
    const ty = hall.ty + hall.height + 1;

    if (world.canPlace('watchtower', tx, ty) !== null) continue;

    for (const [item, amount] of Object.entries(BUILDINGS.watchtower.cost) as [ItemId, number][]) {
      world.player.inventory.add(item, amount);
    }
    world.push({ type: 'placeBuilding', building: 'watchtower', tx, ty });
    world.tick();

    const site = [...world.entities.values()].find((entity) => entity.kind === 'site')!;

    world.push({ type: 'transferToSite', id: site.id });
    world.tick();

    const tower = world.entities.get(site.id);

    if (tower?.kind !== 'tower') throw new Error('la tour ne s’est pas achevée');
    for (const [item, amount] of world.player.inventory.entries()) world.player.inventory.remove(item, amount);
    return { world, tower };
  }
  throw new Error('aucune place pour la tour');
}

function rejections(world: World): UpgradeRejection[] {
  const found: UpgradeRejection[] = [];

  world.events.on('upgradeRejected', ({ reason }) => found.push(reason));
  return found;
}

function fill(world: World, amounts: Partial<Record<ItemId, number>>, into = world.player.inventory): void {
  for (const [item, amount] of Object.entries(amounts) as [ItemId, number][]) into.add(item, amount);
}

describe('niveaux de bâtiment', () => {
  it('la tour renforcée n’est plus un bâtiment du menu : c’est le niveau 2 de la tour de guet', () => {
    expect(Object.keys(BUILDINGS)).not.toContain('reinforcedTower');
    expect(MENU_BUILDING_IDS).not.toContain('reinforcedTower');
    expect(maxLevel('watchtower')).toBe(2);
    expect(maxLevel('forge')).toBe(1);
    expect(nextUpgrade('watchtower', 2)).toBeNull();
  });

  it('reprend les stats de l’ancienne tour renforcée, pour le coût de l’ancienne moins la tour de base', () => {
    const level = buildingLevel('watchtower', 2);

    expect(level.hp).toBe(90);
    expect(level.weapon).toBe('reinforcedBow');
    expect(WEAPONS.reinforcedBow).toMatchObject({ range: 10, cooldown: 14 });
    expect(level.sprite).toBe('reinforcedTower');
    expect(REINFORCE.cost).toEqual({ stone: 2, ironPlate: 4 });
    expect(REINFORCE.action).toBe('Renforcer');
    expect(buildingLevel('watchtower', 1).hp).toBe(BUILDINGS.watchtower.hp);
  });
});

describe('améliorer un bâtiment', () => {
  it('renforce une tour avec le sac : le coût part, le niveau, les points de vie et l’arme changent', () => {
    const { world, tower } = withTower();
    const upgraded: number[] = [];

    world.events.on('buildingUpgraded', ({ level }) => upgraded.push(level));
    fill(world, REINFORCE.cost);
    expect(world.upgradeMissing(tower)).toEqual({});

    world.push({ type: 'upgradeBuilding', id: tower.id });
    world.tick();

    expect(upgraded).toEqual([2]);
    expect(tower.level).toBe(2);
    expect(tower.hp).toBe(90);
    expect(buildingLevel(tower.proto, tower.level).weapon).toBe('reinforcedBow');
    expect(world.player.inventory.isEmpty()).toBe(true);
    expect(world.upgradeMissing(tower)).toBeNull();
  });

  it('paie comme un « Transférer » : le sac d’abord, puis la ville, sans toucher au promis', () => {
    const { world, tower } = withTower();
    const town = world.townStock()!;

    world.player.inventory.add('ironPlate', 1);
    fill(world, { stone: 2, ironPlate: 3 + 2 }, town);
    // Deux plaques promises à un porteur : la ville ne les donne pas.
    town.reserveOut('ironPlate', 2);

    world.push({ type: 'upgradeBuilding', id: tower.id });
    world.tick();

    expect(tower.level).toBe(2);
    expect(world.player.inventory.count('ironPlate')).toBe(0);
    expect(town.count('ironPlate')).toBe(2);
    expect(town.count('stone')).toBe(0);
  });

  it('refuse sans les ressources, sans rien prendre, et dit ce qui manque', () => {
    const { world, tower } = withTower();
    const refused = rejections(world);

    world.player.inventory.add('ironPlate', 1);
    world.townStock()!.add('ironPlate', 1);
    expect(world.upgradeMissing(tower)).toEqual({ stone: 2, ironPlate: 2 });

    world.push({ type: 'upgradeBuilding', id: tower.id });
    world.tick();

    expect(refused).toEqual(['missingItems']);
    expect(tower.level).toBe(1);
    expect(tower.hp).toBe(BUILDINGS.watchtower.hp);
    expect(world.player.inventory.count('ironPlate')).toBe(1);
    expect(world.townStock()!.count('ironPlate')).toBe(1);
  });

  it('ne renforce pas deux fois', () => {
    const { world, tower } = withTower();
    const refused = rejections(world);

    fill(world, REINFORCE.cost);
    fill(world, REINFORCE.cost);
    world.push({ type: 'upgradeBuilding', id: tower.id });
    world.push({ type: 'upgradeBuilding', id: tower.id });
    world.tick();

    expect(tower.level).toBe(2);
    expect(refused).toEqual(['maxLevel']);
    expect(world.player.inventory.count('ironPlate')).toBe(REINFORCE.cost.ironPlate);
  });

  it('refuse loin de la tour, et sur un chantier', () => {
    const { world, tower } = withTower();
    const refused = rejections(world);

    fill(world, REINFORCE.cost);
    world.player.x += 30 * TILE_SIZE;
    world.push({ type: 'upgradeBuilding', id: tower.id });
    world.push({ type: 'upgradeBuilding', id: world.townHallId + 999 });
    world.tick();

    expect(refused).toEqual(['outOfReach', 'missing']);
    expect(tower.level).toBe(1);
  });

  it('une tour entamée garde sa part de points de vie', () => {
    const { world, tower } = withTower();

    tower.hp = 30;
    fill(world, REINFORCE.cost);
    world.push({ type: 'upgradeBuilding', id: tower.id });
    world.tick();

    expect(tower.hp).toBe(45);
  });
});

describe('sauvegarde des niveaux', () => {
  it('le niveau survit à la sauvegarde', () => {
    const { world, tower } = withTower();

    fill(world, REINFORCE.cost);
    world.push({ type: 'upgradeBuilding', id: tower.id });
    world.tick();

    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.world.entities.get(tower.id)).toMatchObject({ proto: 'watchtower', level: 2, hp: 90 });
  });

  it('refuse un niveau que le bâtiment n’a pas', () => {
    const { world, tower } = withTower();
    const state = world.snapshot();

    state.entities = state.entities.map((entity) => (entity.id === tower.id ? { ...entity, level: 3 } : entity));
    expect(decodeSave(JSON.stringify({ version: SAVE_VERSION, savedAt: 0, state }))).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('une tour renforcée d’une sauvegarde v5 devient une tour de guet au niveau 2, sans perte', () => {
    const { world, tower } = withTower();
    const state = world.snapshot();
    // Une sauvegarde v5 : pas de niveau, et la tour renforcée comme bâtiment à part.
    const v5 = {
      ...state,
      entities: state.entities.map((entity) => {
        const rest: Record<string, unknown> = { ...entity };

        delete rest['level'];

        return entity.id === tower.id ? { ...rest, proto: 'reinforcedTower', hp: 72 } : rest;
      }),
    };

    const decoded = decodeSave(JSON.stringify({ version: 5, savedAt: 3, state: v5 }));

    if (!decoded.ok) throw new Error(decoded.reason);

    const migrated = decoded.world.entities.get(tower.id);

    expect(migrated).toMatchObject({ kind: 'tower', proto: 'watchtower', level: 2, hp: 72 });
    expect(decoded.world.entities.get(world.townHallId)).toMatchObject({ level: 1 });
    expect(decoded.savedAt).toBe(3);
  });

  it('un chantier de tour renforcée v5 devient celui d’une tour de guet, le surplus livré va en ville', () => {
    const { world, tower } = withTower();
    const state = world.snapshot();
    const v5 = {
      ...state,
      entities: state.entities.map((entity) => {
        if (entity.id === tower.id) {
          const { id, tx, ty, width, height } = entity;

          return { kind: 'site', id, proto: 'reinforcedTower', tx, ty, width, height, delivered: { wood: 3, ironPlate: 2 } };
        }

        const rest: Record<string, unknown> = { ...entity };

        delete rest['level'];

        return rest;
      }),
    };

    const decoded = decodeSave(JSON.stringify({ version: 5, savedAt: 0, state: v5 }));

    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.world.entities.get(tower.id)).toMatchObject({ kind: 'site', proto: 'watchtower', delivered: { wood: 3 } });
    expect(decoded.world.townStock()!.count('ironPlate')).toBe(2);
  });
});
