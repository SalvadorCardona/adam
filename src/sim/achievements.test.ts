import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import { AchievementTracker, tally } from './achievements.ts';
import { decodeCollection, earnedSkins, emptyCollection, encodeCollection, type Collection } from './collection.ts';
import type { AchievementId } from '../data/achievements.ts';
import { World } from './world.ts';

function track(world = new World(11), collection: Collection = emptyCollection()): { world: World; tracker: AchievementTracker; got: AchievementId[]; saves: () => number } {
  const got: AchievementId[] = [];
  let saves = 0;
  const tracker = new AchievementTracker(world, collection, {
    onUnlock: (id) => got.push(id),
    onChange: () => void (saves += 1),
  });

  return { world, tracker, got, saves: () => saves };
}

function dawn(world: World, night: number): void {
  world.stats.nightsSurvived += 1;
  world.events.emit('dawnBroke', { night, reward: [], to: 'town' });
}

describe('succès — conditions', () => {
  it('« Premier toit » tombe quand la mairie est bâtie, et une seule fois', () => {
    const { world, tracker, got } = track();

    tracker.update();
    expect(got).not.toContain('firstRoof');

    for (const [item, amount] of Object.entries(BUILDINGS.townHall.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();
    tracker.update();
    tracker.update();
    expect(got.filter((id) => id === 'firstRoof')).toHaveLength(1);
  });

  it('compte les ennemis abattus, les coffres et les trocs', () => {
    const { world, tracker, got } = track();

    world.events.emit('mutantDied', { id: 1, x: 0, y: 0 });
    world.events.emit('chestOpened', { id: 1, tx: 0, ty: 0, x: 0, y: 0 });
    tracker.update();
    expect(tally(world, tracker.collection).kills).toBe(1);
    expect(got).toEqual(expect.arrayContaining(['firstShot', 'firstChest']));
  });

  it('« Rempart intact » : dix nuits d’affilée, et un bâtiment perdu remet la série à zéro', () => {
    const { world, tracker, got } = track();

    for (let night = 1; night <= 9; night += 1) dawn(world, night);
    world.events.emit('buildingDestroyed', { id: 5, proto: 'farm', tx: 0, ty: 0 });
    dawn(world, 10);
    tracker.update();
    expect(tally(world, tracker.collection).cleanNights).toBe(0);
    expect(got).not.toContain('cleanTen');

    for (let night = 11; night <= 20; night += 1) dawn(world, night);
    tracker.update();
    expect(got).toContain('cleanTen');
  });

  it('« Ventres pleins » : un mort de faim remet la série à zéro, et dévoile le secret « Régime sec »', () => {
    const { world, tracker, got } = track();

    for (let night = 1; night <= 9; night += 1) dawn(world, night);
    world.events.emit('workerStarved', { id: 7, name: 'Lina', need: 'hunger', x: 0, y: 0 });
    dawn(world, 10);
    tracker.update();
    expect(got).not.toContain('fedTen');
    expect(got).toContain('dryDiet');

    for (let night = 11; night <= 20; night += 1) dawn(world, night);
    tracker.update();
    expect(got).toContain('fedTen');
  });

  it('la chute de la mairie donne le secret, puis une nouvelle colonie repart de zéro', () => {
    const { world, tracker, got } = track();

    world.events.emit('chestOpened', { id: 1, tx: 0, ty: 0, x: 0, y: 0 });
    world.events.emit('townHallDestroyed', {});
    expect(got).toContain('hallFell');
    expect(tracker.collection.unlocked).toContain('firstChest');
    expect(tracker.collection.run.stats.chests).toBe(0);
    expect(tracker.collection.run.stats.fallen).toBe(0);
  });

  it('une colonie neuve efface les compteurs mais garde les succès', () => {
    const { world, tracker } = track();

    for (let i = 0; i < 10; i += 1) world.events.emit('chestOpened', { id: i, tx: 0, ty: 0, x: 0, y: 0 });
    tracker.update();
    expect(tracker.collection.unlocked).toContain('treasure10');
    tracker.newRun();
    // Les écouteurs d'origine comptent toujours après la remise à zéro.
    world.events.emit('chestOpened', { id: 99, tx: 0, ty: 0, x: 0, y: 0 });
    expect(tracker.collection.run.stats.chests).toBe(1);
    expect(tracker.collection.unlocked).toContain('treasure10');
  });
});

describe('collection — persistance', () => {
  it('survit à un aller-retour, skins gagnés compris', () => {
    const { world, tracker } = track();

    world.events.emit('chestOpened', { id: 1, tx: 0, ty: 0, x: 0, y: 0 });
    tracker.update();

    const back = decodeCollection(encodeCollection(tracker.collection));

    expect(back).toEqual(tracker.collection);
    expect(earnedSkins(back)).toContain('hatFlower');
  });

  it('redevient vide si elle est illisible, et ignore un succès disparu', () => {
    expect(decodeCollection('pas du json')).toEqual(emptyCollection());
    expect(decodeCollection(JSON.stringify({ version: 99, collection: {} }))).toEqual(emptyCollection());

    const text = JSON.stringify({ version: 1, collection: { ...emptyCollection(), unlocked: ['firstShot', 'inconnu'], found: ['forge', 'tour'] } });

    expect(decodeCollection(text).unlocked).toEqual(['firstShot']);
    expect(decodeCollection(text).found).toEqual(['forge']);
  });
});

describe('commande grantPieces', () => {
  it('ajoute les pièces gagnées une fois, sans toucher aux pièces du départ', () => {
    const world = new World(11);
    const found: string[] = [];

    world.events.on('pieceFound', ({ piece }) => found.push(piece));
    world.push({ type: 'grantPieces', pieces: ['hatCap', 'hatCap', 'hairShort'] });
    world.tick();
    world.push({ type: 'grantPieces', pieces: ['hatCap'] });
    world.tick();
    expect(world.player.wardrobe.filter((piece) => piece === 'hatCap')).toHaveLength(1);
    expect(world.player.wardrobe).not.toContain('hairShort');
    expect(found).toEqual(['hatCap']);
  });

  it('au départ d’une colonie, elle est silencieuse', () => {
    const world = new World(11);
    const found: string[] = [];

    world.events.on('pieceFound', ({ piece }) => found.push(piece));
    world.push({ type: 'grantPieces', pieces: ['hatCap'], silent: true });
    world.tick();
    expect(world.player.wardrobe).toContain('hatCap');
    expect(world.player.unseenPieces).not.toContain('hatCap');
    expect(found).toEqual([]);
  });
});
