import { describe, expect, it } from 'vitest';
import { TILE_SIZE, coordKey } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { FOG_VISION } from '../data/fog.ts';
import type { ItemId } from '../data/items.ts';
import { FogOfWar, type SavedFog } from './fog.ts';
import { deserialize, serialize, type WorldState } from './save.ts';
import type { EntityId } from './types.ts';
import { World } from './world.ts';

/** La tuile d'Adam. */
function adamTile(world: World): { tx: number; ty: number } {
  return { tx: Math.floor(world.player.x / TILE_SIZE), ty: Math.floor(world.player.y / TILE_SIZE) };
}

/** Adam se tient au centre de la tuile (tx, ty) ; le tick suivant, il y voit. */
function teleport(world: World, tx: number, ty: number): void {
  const x = (tx + 0.5) * TILE_SIZE;
  const y = (ty + 0.5) * TILE_SIZE;

  Object.assign(world.player, { x, y, prevX: x, prevY: y });
  world.tick();
}

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
}

/** Un emplacement où `building` se pose, près de la mairie ; Adam se tient juste dessous. */
function freeSpot(world: World, building: 'watchtower'): { tx: number; ty: number } {
  const hall = world.entities.get(world.townHallId)!;

  for (let ring = 4; ring < 12; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;

        const tx = hall.tx + dx;
        const ty = hall.ty + dy;
        const x = (tx + 1) * TILE_SIZE;
        const y = (ty + 3.5) * TILE_SIZE;

        Object.assign(world.player, { x, y, prevX: x, prevY: y });
        if (world.canPlace(building, tx, ty) === null) return { tx, ty };
      }
    }
  }
  throw new Error('aucun emplacement près de la mairie');
}

/** Une case portant un arbre de la carte, à `from` tuiles au moins de la mairie, en marchant vers l'est. */
function treeEastOf(world: World, from: number): { tx: number; ty: number } {
  const hall = world.entities.get(world.townHallId)!;

  for (let dx = from; dx < from + 200; dx += 1) {
    for (let dy = -6; dy <= 6; dy += 1) {
      const tx = hall.tx + dx;
      const ty = hall.ty + dy;

      if (world.resources.at(tx, ty)?.id === 'tree' && !world.enemyZoneAt(tx, ty)) return { tx, ty };
    }
  }
  throw new Error('pas d’arbre à l’est');
}

describe('FogOfWar', () => {
  it('trois états : inexplorée, visible, puis explorée quand la source s’en va', () => {
    const fog = new FogOfWar();

    expect(fog.sight(0, 0)).toBe('unexplored');
    fog.begin();
    fog.source(1, 0, 0, 3);
    fog.end();
    expect(fog.sight(0, 0)).toBe('visible');
    expect(fog.sight(3, 0)).toBe('visible');
    expect(fog.sight(4, 0)).toBe('unexplored');

    fog.begin();
    fog.source(1, 20, 0, 3);
    fog.end();
    expect(fog.sight(0, 0)).toBe('explored');
    expect(fog.sight(20, 0)).toBe('visible');
  });

  it('les rayons s’additionnent : une case reste vue tant qu’une source la couvre', () => {
    const fog = new FogOfWar();

    fog.begin();
    fog.source(1, 0, 0, 4);
    fog.source(2, 6, 0, 4);
    fog.end();
    // L'union : chaque disque, et leur recouvrement.
    expect(fog.sight(-4, 0)).toBe('visible');
    expect(fog.sight(10, 0)).toBe('visible');
    expect(fog.sight(3, 0)).toBe('visible');

    // La première rentre : le recouvrement reste vu par la seconde, le reste de son disque ne l'est plus.
    fog.begin();
    fog.source(2, 6, 0, 4);
    fog.end();
    expect(fog.sight(3, 0)).toBe('visible');
    expect(fog.sight(-4, 0)).toBe('explored');
    expect(fog.sourceCount).toBe(1);
  });

  it('traverse les bords de chunk et les coordonnées négatives', () => {
    const fog = new FogOfWar();

    fog.begin();
    fog.source(1, -1, -1, 2);
    fog.end();
    expect(fog.sight(-3, -1)).toBe('visible');
    expect(fog.sight(1, -1)).toBe('visible');
    expect(fog.sight(-1, 1)).toBe('visible');
    expect(fog.sight(2, -1)).toBe('unexplored');
  });

  it('ne repeint rien pour une source qui n’a pas bougé', () => {
    const fog = new FogOfWar();

    fog.begin();
    fog.source(1, 5, 5, 6);
    fog.end();

    const revision = fog.revision;

    fog.begin();
    fog.source(1, 5, 5, 6);
    fog.end();
    expect(fog.revision).toBe(revision);
  });

  it('se sauvegarde en plages et se relit à l’identique', () => {
    const fog = new FogOfWar();

    fog.begin();
    fog.source(1, 40, -7, 9);
    fog.source(2, -30, 12, 5);
    fog.end();

    const copy = new FogOfWar();

    copy.restore(JSON.parse(JSON.stringify(fog.toJSON())) as SavedFog);
    expect(copy.exploredCount()).toBe(fog.exploredCount());
    expect(copy.sight(40, -7)).toBe('explored');
    expect(copy.sight(0, 0)).toBe('unexplored');
    expect(copy.toJSON()).toEqual(fog.toJSON());
  });

  it('ne ré-encode que les chunks changés, et une case explorée de plus se retrouve à la sauvegarde', () => {
    const fog = new FogOfWar();

    fog.reveal(8, 8, 3);
    fog.reveal(100, 100, 3);

    const before = fog.toJSON();

    expect(fog.toJSON()).toEqual(before);
    fog.reveal(12, 8, 3);

    const after = fog.toJSON();
    const fresh = new FogOfWar();

    fresh.reveal(8, 8, 3);
    fresh.reveal(100, 100, 3);
    fresh.reveal(12, 8, 3);
    expect(after).toEqual(fresh.toJSON());
    expect(after.explored['0,0']).not.toEqual(before.explored['0,0']);
    // Une sauvegarde rendue ne partage rien avec le cache : la modifier ne l'abîme pas.
    after.explored['0,0']!.push(1);
    expect(fog.toJSON()).toEqual(fresh.toJSON());
  });
});

describe('brouillard de guerre', () => {
  it('au départ, seuls les alentours de la mairie et d’Adam sont connus', () => {
    const world = new World(7);
    const adam = adamTile(world);
    const hall = world.entities.get(world.townHallId)!;

    expect(world.sightAt(adam.tx, adam.ty)).toBe('visible');
    expect(world.sightAt(hall.tx + 1, hall.ty + 1)).toBe('visible');
    expect(world.sightAt(adam.tx + 30, adam.ty)).toBe('unexplored');
    expect(world.sightAt(adam.tx, adam.ty - 30)).toBe('unexplored');
    // Presque toute la carte est noire : quelques centaines de cases connues.
    expect(world.fog.exploredCount()).toBeLessThan(500);
  });

  it('une colonie neuve connaît sa clairière, sous le voile ; au-delà, l’inconnu', () => {
    const world = World.newColony(7);
    const hall = world.entities.get(world.townHallId)!;

    expect(world.sightAt(hall.tx + 1 - FOG_VISION.home + 2, hall.ty + 1)).toBe('explored');
    expect(world.sightAt(hall.tx + 1 + FOG_VISION.home + 6, hall.ty + 1)).toBe('unexplored');
    expect(world.isUnlocked('fountain')).toBe(false);
  });

  it('Adam révèle en marchant ; la zone quittée reste explorée, plus vue', () => {
    const world = new World(7);
    const start = adamTile(world);
    const known = world.fog.exploredCount();

    teleport(world, start.tx + 30, start.ty);
    expect(world.sightAt(start.tx + 30, start.ty)).toBe('visible');
    expect(world.fog.exploredCount()).toBeGreaterThan(known);

    teleport(world, start.tx + 60, start.ty);
    expect(world.sightAt(start.tx + 30, start.ty)).toBe('explored');
  });

  it('les habitants dehors voient autour d’eux, un petit rayon', () => {
    const world = new World(7);
    const worker = [...world.mobiles.values()].find((mobile) => mobile.kind === 'worker')!;
    const tx = Math.floor(worker.x / TILE_SIZE);
    const ty = Math.floor(worker.y / TILE_SIZE);

    expect(world.sightAt(tx, ty)).toBe('visible');
    expect(FOG_VISION.people).toBeLessThan(FOG_VISION.player);
  });

  it('la tour de guet garde un grand rayon visible en permanence', () => {
    const world = new World(7);

    finish(world, world.townHallId);

    const hall = world.entities.get(world.townHallId)!;
    const { tx, ty } = freeSpot(world, 'watchtower');

    world.push({ type: 'placeBuilding', building: 'watchtower', tx, ty });
    world.tick();

    const site = [...world.entities.values()].find((entity) => entity.proto === 'watchtower')!;
    const far = { tx: tx + 1 + FOG_VISION.buildings.watchtower!, ty: ty + 1 };

    // En chantier, elle ne guette pas encore.
    expect(world.sightAt(far.tx, far.ty)).not.toBe('visible');

    finish(world, site.id);
    expect(world.entities.get(site.id)?.kind).toBe('tower');
    teleport(world, hall.tx - 40, hall.ty);
    expect(world.sightAt(far.tx, far.ty)).toBe('visible');
    expect(world.sightAt(far.tx + 3, far.ty)).not.toBe('visible');
  });

  it('capture figée : un arbre coupé hors de vue reste debout jusqu’à ce qu’on revienne', () => {
    const world = new World(7);
    const tree = treeEastOf(world, 20);
    const key = coordKey(tree.tx, tree.ty);
    const away = adamTile(world);

    // Adam va voir l'arbre, puis s'en va.
    teleport(world, tree.tx, tree.ty + 2);
    teleport(world, away.tx, away.ty);
    expect(world.sightAt(tree.tx, tree.ty)).toBe('explored');

    // Hors de vue, l'arbre tombe : la carte change, ce qu'on en voit non.
    while (world.resources.take(tree.tx, tree.ty)) {
      /* coupé jusqu'au bout */
    }
    expect(world.resources.at(tree.tx, tree.ty)).toBeNull();
    expect(world.lookAt(tree.tx, tree.ty).resource).toBe('tree');
    expect(world.fog.looks.has(key)).toBe(true);

    // De retour : la capture s'efface, la souche se voit.
    teleport(world, tree.tx, tree.ty + 2);
    expect(world.lookAt(tree.tx, tree.ty).resource).toBeNull();
    expect(world.fog.looks.has(key)).toBe(false);
  });

  it('un changement sous les yeux ne laisse aucune capture', () => {
    const world = new World(7);
    const tree = treeEastOf(world, 20);

    teleport(world, tree.tx, tree.ty + 2);
    world.resources.take(tree.tx, tree.ty);
    expect(world.fog.looks.size).toBe(0);
  });

  it('une base mutante explorée reste telle qu’on l’a vue ; jamais vue, elle n’existe pas', () => {
    const world = new World(7);
    const base = world.enemyBases[0]!;

    expect(world.knownEnemyBase(base.id)).toBeUndefined();

    teleport(world, base.tx + 1, base.ty + 4);
    expect(world.knownEnemyBase(base.id)).toBe(base);

    const hp = base.hp;

    teleport(world, base.tx + 60, base.ty);
    // Hors de vue, elle tombe : on la croit debout, jusqu'à y retourner.
    base.hp = 0;
    expect(world.knownEnemyBase(base.id)?.hp).toBe(hp);

    teleport(world, base.tx + 1, base.ty + 4);
    expect(world.knownEnemyBase(base.id)?.hp).toBe(0);
  });

  it('refuse de bâtir sur une case inexplorée, accepte une case explorée hors de vue', () => {
    const world = new World(7);

    finish(world, world.townHallId);

    const hall = world.entities.get(world.townHallId)!;
    const rejected: string[] = [];

    world.events.on('placementRejected', ({ reason }) => rejected.push(reason));

    // Un emplacement libre, loin à l'ouest : jamais vu.
    let spot: { tx: number; ty: number } | null = null;

    for (let dx = 25; dx < 120 && !spot; dx += 1) {
      const tx = hall.tx - dx;

      world.revealAround(tx + 1, hall.ty + 7, 2);
      if (world.canPlace('watchtower', tx, hall.ty + 6) === 'outOfReach') spot = { tx, ty: hall.ty + 6 };
    }
    if (!spot) throw new Error('aucun emplacement libre à l’ouest');

    const fresh = new World(7);

    finish(fresh, fresh.townHallId);
    expect(fresh.placementBlock('watchtower', spot.tx, spot.ty)?.reason).toBe('unexplored');

    // Le tick refuse comme le fantôme, même Adam tout près… s'il n'y voit pas encore.
    fresh.events.on('placementRejected', ({ reason }) => rejected.push(reason));
    fresh.push({ type: 'placeBuilding', building: 'watchtower', tx: spot.tx, ty: spot.ty });
    fresh.tick();
    expect(rejected).toEqual(['unexplored']);

    // Adam y va, puis s'éloigne un peu : la case est explorée, hors de vue — elle se bâtit de près.
    teleport(fresh, spot.tx + 1, spot.ty + 3);
    expect(fresh.canPlace('watchtower', spot.tx, spot.ty)).toBeNull();
  });

  it('se lève au réglage de débogage', () => {
    const world = new World(7);
    const adam = adamTile(world);

    world.push({ type: 'setFog', enabled: false });
    world.tick();
    expect(world.sightAt(adam.tx + 80, adam.ty)).toBe('visible');
    expect(world.knownEnemyBases()).toHaveLength(world.enemyBases.length);

    world.push({ type: 'setFog', enabled: true });
    world.tick();
    expect(world.sightAt(adam.tx + 80, adam.ty)).toBe('unexplored');
  });

  it('se sauvegarde : cases explorées, captures et bases vues', () => {
    const world = new World(7);
    const tree = treeEastOf(world, 20);
    const base = world.enemyBases[0]!;
    const home = adamTile(world);

    teleport(world, tree.tx, tree.ty + 2);
    teleport(world, base.tx + 1, base.ty + 4);
    teleport(world, home.tx, home.ty);
    world.resources.take(tree.tx, tree.ty);
    base.raiders = 3;

    const state = serialize(world);
    const copy = deserialize(JSON.parse(JSON.stringify(state)));

    expect(copy.fog.exploredCount()).toBe(world.fog.exploredCount());
    expect(copy.sightAt(tree.tx, tree.ty)).toBe('explored');
    expect(copy.lookAt(tree.tx, tree.ty)).toEqual(world.lookAt(tree.tx, tree.ty));
    expect(copy.knownEnemyBase(base.id)?.raiders).toBe(0);
    expect(serialize(copy)).toEqual(state);
  });

  it('une ancienne sauvegarde se charge : le bâti et ses alentours sont explorés', () => {
    const world = new World(7);
    const hall = world.entities.get(world.townHallId)!;
    const old: Partial<WorldState> = serialize(world);

    delete old.fog;
    const copy = deserialize(JSON.parse(JSON.stringify(old)));

    expect(copy.sightAt(hall.tx + 1 + FOG_VISION.legacy, hall.ty + 1)).toBe('explored');
    expect(copy.sightAt(hall.tx + 1 + FOG_VISION.legacy + 6, hall.ty + 1)).toBe('unexplored');
    expect(copy.fog.exploredCount()).toBeGreaterThan(world.fog.exploredCount());
  });

  it('est déterministe : même seed, mêmes commandes, même brouillard', () => {
    const run = (): World => {
      const world = new World(11);

      world.push({ type: 'setMoveAxis', x: 1, y: 0.3 });
      for (let i = 0; i < 600; i += 1) world.tick();
      world.push({ type: 'setMoveAxis', x: -0.4, y: -1 });
      for (let i = 0; i < 600; i += 1) world.tick();
      return world;
    };
    const a = run();
    const b = run();

    expect(a.fog.toJSON()).toEqual(b.fog.toJSON());
    expect(a.fog.exploredCount()).toBeGreaterThan(new World(11).fog.exploredCount());
  });
});

describe('compte des cases explorées', () => {
  it('tenu à mesure, il vaut le compte case par case, rechargement compris', () => {
    const world = World.newColony(11);
    const brute = (fog: FogOfWar): number => {
      let count = 0;

      for (let ty = -80; ty < 80; ty += 1) for (let tx = -80; tx < 80; tx += 1) if (fog.sight(tx, ty) !== 'unexplored') count += 1;
      return count;
    };

    world.revealAround(20, 20, 9);
    for (let i = 0; i < 40; i += 1) world.tick();
    expect(world.fog.exploredCount()).toBe(brute(world.fog));

    const copy = new FogOfWar();

    copy.restore(world.fog.toJSON());
    expect(copy.exploredCount()).toBe(world.fog.exploredCount());
  });
});
