import { describe, expect, it } from 'vitest';
import type { ItemId } from '../data/items.ts';
import { siteLedger } from './siteLedger.ts';
import type { Site } from './types.ts';
import { World } from './world.ts';

type Stock = Partial<Record<ItemId, number>>;

/** Un chantier de cabane de bûcheron (8 bois, 4 pierre), avec ce qu'il a reçu. */
function site(delivered: Stock): Site {
  return { kind: 'site', id: 7, proto: 'lumberCamp', tx: 0, ty: 0, width: 2, height: 2, delivered, work: 0 };
}

const none = (): number => 0;
const stock = (items: Stock) => ({ available: (item: ItemId) => items[item] ?? 0 });

describe('siteLedger', () => {
  it('compte, objet par objet du coût, le livré et le manquant', () => {
    const lines = siteLedger(site({ wood: 6 }), none, stock({ wood: 3, stone: 9 }));

    expect(lines.map(({ item, needed, delivered, missing, done }) => ({ item, needed, delivered, missing, done }))).toEqual([
      { item: 'wood', needed: 8, delivered: 6, missing: 2, done: false },
      { item: 'stone', needed: 4, delivered: 0, missing: 4, done: false },
    ]);
  });

  it('marque complet un objet tout livré, sans compter un surplus', () => {
    const [wood] = siteLedger(site({ wood: 12 }), none, stock({}));

    expect(wood).toMatchObject({ delivered: 8, missing: 0, done: true, dry: false });
  });

  it('dit ce qui est en route, plafonné à ce qui manque', () => {
    const lines = siteLedger(site({ wood: 6 }), (item) => (item === 'wood' ? 5 : 1), stock({}));

    expect(lines.map((line) => line.incoming)).toEqual([2, 1]);
  });

  it('dit ce que la ville en a, ou rien sans mairie', () => {
    expect(siteLedger(site({}), none, stock({ wood: 3 })).map((line) => line.inTown)).toEqual([3, 0]);
    expect(siteLedger(site({}), none, null).map((line) => line.inTown)).toEqual([null, null]);
  });

  it('est à sec quand la ville n’en a plus et que rien ne vient combler le manque', () => {
    const [wood, stone] = siteLedger(site({}), none, stock({ wood: 1 }));

    expect(wood!.dry).toBe(false);
    expect(stone!.dry).toBe(true);
  });

  it('n’est pas à sec si ce qui est en route suffit, ni sans mairie', () => {
    expect(siteLedger(site({ stone: 1 }), () => 3, stock({}))[1]!.dry).toBe(false);
    expect(siteLedger(site({}), none, null).some((line) => line.dry)).toBe(false);
  });

  it('se lit sur le monde : le chantier de la mairie, sans ville, n’est jamais à sec', () => {
    const world = new World(1);
    const hall = world.entities.get(world.townHallId)!;

    expect(hall.kind).toBe('site');
    if (hall.kind !== 'site') return;

    const lines = world.siteLedger(hall);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.inTown === null && !line.dry && line.incoming === 0)).toBe(true);
  });
});

describe('relevé hors du rayon de la mairie', () => {
  it('une cabane posée hors du rayon, ville pleine : rien en ville, à sec', () => {
    const world = new World(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();
    world.tick();

    const hall = world.warehouse()!;

    hall.store.add('wood', 60);
    hall.store.add('stone', 39);

    const far = { kind: 'site', id: 9999, proto: 'lumberCamp', tx: hall.tx + 40, ty: hall.ty, width: 2, height: 2, delivered: {}, work: 0 } as Site;
    const near = { ...far, tx: hall.tx + 4 } as Site;
    world.entities.set(far.id, far);
    world.entities.set(near.id, { ...near, id: 9998 });

    expect(world.inTownRange(far)).toBe(false);
    expect(world.siteLedger(far).map((line) => [line.inTown, line.dry])).toEqual([[0, true], [0, true]]);
    expect(world.siteLedger({ ...near, id: 9998 }).map((line) => line.dry)).toEqual([false, false]);
  });
});
