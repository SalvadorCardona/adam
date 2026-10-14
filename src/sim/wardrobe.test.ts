import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, TILE_SIZE } from '../core/grid.ts';
import { CHESTS } from '../data/chests.ts';
import { BUILDINGS } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import { wardrobeErrors } from '../data/validate.ts';
import {
  DEFAULT_LOOK,
  LOOK_SLOTS,
  LOOT_SOURCES,
  PIECES,
  PIECE_IDS,
  BASE_WARDROBE_LOOT,
  WARDROBE_LOOT,
  WARDROBE_SPARE,
  copyLook,
  isStarter,
  piecesOf,
  type Look,
  type PieceId,
  wardrobeDrop,
} from '../data/wardrobe.ts';
import { adamLookParts } from '../art/adamLook.ts';
import { decodeSave, encodeSave, serialize } from './save.ts';
import type { EntityId } from './types.ts';
import { drawPieces, lookRejection, owns, readLook, readWardrobe, rollPiece } from './wardrobe.ts';
import { World } from './world.ts';
import { chestOfChunk, type Chest } from './chests.ts';
import { findSpawn, oreAt, resourceAt, terrainAt } from './terrain.ts';

/** Les pièces à trouver : tout sauf celles du départ. */
const LOCKED = PIECE_IDS.filter((piece) => !isStarter(piece));

/** Une pièce à trouver de l'emplacement `slot`. */
function lockedOf(slot: (typeof LOOK_SLOTS)[number]): PieceId {
  const piece = piecesOf(slot).find((id) => !isStarter(id));

  if (!piece) throw new Error(`aucune pièce à trouver pour ${slot}`);
  return piece;
}

/** Livre le chantier au contact, depuis le sac : le dernier objet livré l'achève. */
function completeSite(world: World, id: EntityId): void {
  const site = world.entities.get(id);

  if (site?.kind !== 'site') throw new Error(`#${id} n'est pas un chantier`);
  for (const [item, amount] of Object.entries(BUILDINGS[site.proto].cost) as [ItemId, number][]) world.player.inventory.add(item, amount);

  const below = { tx: site.tx + Math.floor(site.width / 2), ty: site.ty + site.height };

  world.player.x = (below.tx + 0.5) * TILE_SIZE;
  world.player.y = (below.ty + 0.5) * TILE_SIZE;
  world.push({ type: 'setMoveAxis', x: 0, y: -1 });
  for (let i = 0; i < 400 && world.entities.get(id)?.kind === 'site'; i += 1) world.tick();
  world.push({ type: 'setMoveAxis', x: 0, y: 0 });
  world.tick();
}

describe('catalogue de la garde-robe', () => {
  it('passe la validation des données : pièces du départ, nuanciers, butin, direction artistique', () => {
    expect(wardrobeErrors()).toEqual([]);
  });

  it('chaque emplacement a plusieurs pièces, et au moins une à trouver', () => {
    for (const slot of LOOK_SLOTS) {
      expect(piecesOf(slot).length, slot).toBeGreaterThanOrEqual(3);
      expect(piecesOf(slot).some((piece) => !isStarter(piece)), slot).toBe(true);
    }
  });

  it('les lunettes d’aviateur sont à trouver', () => {
    expect(PIECES.glassesAviator.slot).toBe('glasses');
    expect(isStarter('glassesAviator')).toBe(false);
  });

  it('une pièce change le dessin d’Adam, et seulement les morceaux qu’elle touche', () => {
    const base = adamLookParts(DEFAULT_LOOK);
    const hatted = adamLookParts({ pieces: { ...DEFAULT_LOOK.pieces, hat: 'hatStraw' }, colors: DEFAULT_LOOK.colors });
    const shod = adamLookParts({ pieces: { ...DEFAULT_LOOK.pieces, shoes: 'shoesBunny' }, colors: DEFAULT_LOOK.colors });

    expect(hatted.down).not.toBe(base.down);
    expect(hatted.foot).toBe(base.foot);
    expect(shod.foot).not.toBe(base.foot);
    expect(shod.down).toBe(base.down);
  });

  it('la couleur des yeux se voit de face et de profil, pas de dos', () => {
    const base = adamLookParts(DEFAULT_LOOK);
    const green = adamLookParts({ pieces: DEFAULT_LOOK.pieces, colors: { ...DEFAULT_LOOK.colors, eyes: 'mint' } });

    expect(green.down).not.toBe(base.down);
    expect(green.side).not.toBe(base.side);
    expect(green.up).toBe(base.up);
  });
});

describe('apparence jugée', () => {
  it('l’Adam par défaut se porte sans rien avoir trouvé', () => {
    expect(lookRejection(DEFAULT_LOOK, [])).toBeNull();
  });

  it('refuse une pièce pas encore trouvée, hors de son emplacement, ou une couleur hors nuancier', () => {
    const locked = lockedOf('glasses');

    expect(lookRejection({ ...DEFAULT_LOOK, pieces: { ...DEFAULT_LOOK.pieces, glasses: locked } }, [])).toBe('locked');
    expect(lookRejection({ ...DEFAULT_LOOK, pieces: { ...DEFAULT_LOOK.pieces, glasses: locked } }, [locked])).toBeNull();
    expect(lookRejection({ ...DEFAULT_LOOK, pieces: { ...DEFAULT_LOOK.pieces, hat: 'beardShort' } }, [])).toBe('slot');
    expect(lookRejection({ ...DEFAULT_LOOK, pieces: { ...DEFAULT_LOOK.pieces, hat: 'hatTophat' as PieceId } }, [])).toBe('unknown');
    expect(lookRejection({ pieces: DEFAULT_LOOK.pieces, colors: { ...DEFAULT_LOOK.colors, eyes: 'toxic' } }, [])).toBe('color');
  });
});

describe('commande dressAdam', () => {
  it('habille Adam et l’annonce au rendu', () => {
    const world = new World(7);
    const seen: Look[] = [];
    const look: Look = { pieces: { ...DEFAULT_LOOK.pieces, beard: 'beardNone', hat: 'hatBandana' }, colors: { ...DEFAULT_LOOK.colors, eyes: 'cyan' } };

    world.events.on('lookChanged', ({ look: changed }) => seen.push(changed));
    world.push({ type: 'dressAdam', look });
    world.tick();

    expect(world.player.look).toEqual(look);
    expect(seen).toEqual([look]);
  });

  it('refuse une pièce pas trouvée : Adam garde sa tenue', () => {
    const world = new World(7);
    const reasons: string[] = [];

    world.events.on('lookRejected', ({ reason }) => reasons.push(reason));
    world.push({ type: 'dressAdam', look: { pieces: { ...DEFAULT_LOOK.pieces, shoes: 'shoesBunny' }, colors: DEFAULT_LOOK.colors } });
    world.tick();

    expect(reasons).toEqual(['locked']);
    expect(world.player.look).toEqual(DEFAULT_LOOK);
  });

  it('la tenue est une copie : changer l’objet de la commande après coup n’habille pas Adam', () => {
    const world = new World(7);
    const look = copyLook(DEFAULT_LOOK);

    look.pieces.hat = 'hatBandana';
    world.push({ type: 'dressAdam', look });
    world.tick();
    look.pieces.hat = 'hatNone';

    expect(world.player.look.pieces.hat).toBe('hatBandana');
  });
});

describe('pièces trouvées', () => {
  it('le tirage est déterministe et ne donne jamais une pièce qu’Adam a déjà', () => {
    for (const source of LOOT_SOURCES) {
      for (let key = 0; key < 40; key += 1) {
        const piece = rollPiece(3, source, key, []);

        expect(rollPiece(3, source, key, [])).toBe(piece);
        if (piece) {
          expect(isStarter(piece)).toBe(false);
          expect(wardrobeDrop(source).weights).toHaveProperty(PIECES[piece].rarity);
        }
      }
    }
  });

  it('un objectif donne toujours une pièce tant qu’il en reste — ses raretés d’abord, puis les autres —, jamais un doublon', () => {
    const found: PieceId[] = [];

    for (let key = 0; found.length < LOCKED.length && key < 500; key += 1) {
      const piece = rollPiece(11, 'objective', key, found);

      expect(piece).not.toBeNull();
      expect(found).not.toContain(piece);
      // Tant qu'il reste une courante ou une rare, l'objectif ne donne pas d'épique.
      const ownRarities = LOCKED.some((id) => !found.includes(id) && PIECES[id].rarity in WARDROBE_LOOT.objective.weights);

      if (ownRarities) expect(PIECES[piece!].rarity in WARDROBE_LOOT.objective.weights).toBe(true);
      found.push(piece!);
    }
    expect(new Set(found)).toEqual(new Set(LOCKED));
    expect(rollPiece(11, 'objective', 999, found)).toBeNull();
  });

  it('garde-robe complète : plus de pièce, du Prestige à la place', () => {
    expect(drawPieces(11, 'chest', 4, LOCKED)).toEqual({ pieces: [], spares: 1 });

    const world = new World(7);
    const spared: number[] = [];

    world.player.wardrobe.push(...LOCKED);
    world.events.on('piecesSpared', ({ prestige }) => spared.push(prestige));
    openNearestChest(world);

    expect(spared).toEqual([WARDROBE_SPARE.prestige]);
    expect(world.prestige).toBe(WARDROBE_SPARE.prestige);
    expect(world.player.wardrobe).toHaveLength(LOCKED.length);
  });

  it('une base de haut niveau donne plus de pièces, et plus rares, qu’une base proche', () => {
    const pieces = (level: number): PieceId[] =>
      Array.from({ length: 200 }, (_, key) => drawPieces(9, 'enemyBase', key, [], wardrobeDrop('enemyBase', level)).pieces).flat();
    const epics = (list: PieceId[]): number => list.filter((piece) => PIECES[piece].rarity === 'epic').length;
    const near = pieces(1);
    const far = pieces(3);

    expect(near).toHaveLength(200);
    expect(far).toHaveLength(200 * (BASE_WARDROBE_LOOT[2].enemyBase.count ?? 1));
    expect(epics(far) / far.length).toBeGreaterThan(epics(near) / near.length);
    // Plusieurs tirages d'une même base : jamais deux fois la même pièce.
    for (let key = 0; key < 50; key += 1) {
      const { pieces: drawn } = drawPieces(9, 'enemyBase', key, [], wardrobeDrop('enemyBase', 3));

      expect(new Set(drawn).size).toBe(drawn.length);
    }
  });

  it('une bête n’en donne que de temps en temps', () => {
    const drops = Array.from({ length: 2000 }, (_, key) => rollPiece(5, 'beast', key, [])).filter((piece) => piece !== null);

    expect(drops.length).toBeGreaterThan(40);
    expect(drops.length).toBeLessThan(200);
  });

  it('bâtir la mairie, premier objectif, fait trouver une pièce — sans toucher au PRNG du monde', () => {
    const world = new World(42);
    const twin = new World(42);
    const found: PieceId[] = [];

    world.events.on('pieceFound', ({ piece, source }) => {
      expect(source).toBe('objective');
      found.push(piece);
    });
    completeSite(world, world.townHallId);
    completeSite(twin, twin.townHallId);

    expect(world.chapter).toBeGreaterThan(0);
    expect(found).toHaveLength(1);
    expect(world.player.wardrobe).toEqual(found);
    expect(owns(world.player.wardrobe, found[0]!)).toBe(true);
    // Le même monde sans écouteur tire la même pièce, et son PRNG est au même point.
    expect(twin.player.wardrobe).toEqual(found);
    expect(world.snapshot().rng).toBe(twin.snapshot().rng);
  });
});

describe('sauvegarde de la garde-robe', () => {
  it('l’apparence et les pièces trouvées survivent à un rechargement', () => {
    const world = new World(9);
    const aviator: PieceId = 'glassesAviator';
    const look: Look = { pieces: { ...DEFAULT_LOOK.pieces, glasses: aviator, hair: 'hairBuzz' }, colors: { eyes: 'violet', hair: 'orange', top: 'cyan' } };

    world.player.wardrobe.push(aviator);
    world.push({ type: 'dressAdam', look });
    world.tick();

    const loaded = decodeSave(encodeSave(world, 0));

    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.world.player.look).toEqual(look);
    expect(loaded.world.player.wardrobe).toEqual([aviator]);
    // Une copie : le monde rechargé ne partage rien avec la sauvegarde.
    expect(serialize(loaded.world).player.look).not.toBe(loaded.world.player.look);
  });

  it('une sauvegarde d’avant la garde-robe se lit : Adam par défaut, rien de trouvé', () => {
    const world = new World(9);
    const file = JSON.parse(encodeSave(world, 0)) as { state: { player: Record<string, unknown> } };

    delete file.state.player['look'];
    delete file.state.player['wardrobe'];

    const loaded = decodeSave(JSON.stringify(file));

    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.world.player.look).toEqual(DEFAULT_LOOK);
    expect(loaded.world.player.wardrobe).toEqual([]);
  });

  it('une pièce inconnue, pas trouvée ou hors de sa place reprend la valeur par défaut de son emplacement', () => {
    const look = readLook(
      { pieces: { ...DEFAULT_LOOK.pieces, hat: 'hatTophat', shoes: 'shoesBunny', glasses: 'beardFull' }, colors: { eyes: 'toxic', hair: 'coral', top: 42 } },
      [],
    );

    expect(look.pieces.hat).toBe(DEFAULT_LOOK.pieces.hat);
    expect(look.pieces.shoes).toBe(DEFAULT_LOOK.pieces.shoes);
    expect(look.pieces.glasses).toBe(DEFAULT_LOOK.pieces.glasses);
    expect(look.colors).toEqual({ ...DEFAULT_LOOK.colors, hair: 'coral' });
    expect(readWardrobe(['glassesAviator', 'glassesAviator', 'hatNone', 'nope', 3])).toEqual(['glassesAviator']);
  });
});

/** Le coffre le plus proche du départ, d'après la seed. */
function nearestChest(world: World): Chest {
  const cx = Math.floor(world.player.x / CHUNK_SIZE);
  const cy = Math.floor(world.player.y / CHUNK_SIZE);
  let best: Chest | null = null;
  let bestDistance = Infinity;

  for (let dy = -3; dy <= 3; dy += 1) {
    for (let dx = -3; dx <= 3; dx += 1) {
      const chest = world.chestOfChunk(cx + dx, cy + dy);

      if (!chest) continue;

      const distance = (chest.tx * TILE_SIZE - world.player.x) ** 2 + (chest.ty * TILE_SIZE - world.player.y) ** 2;

      if (distance < bestDistance) {
        best = chest;
        bestDistance = distance;
      }
    }
  }
  if (!best) throw new Error('aucun coffre autour du départ');
  return best;
}

/** Pose Adam sur le coffre le plus proche du départ et laisse passer un tick : il l'ouvre. */
function openNearestChest(world: World): Chest {
  const chest = nearestChest(world);

  world.player.x = world.player.prevX = (chest.tx + 0.5) * TILE_SIZE;
  world.player.y = world.player.prevY = (chest.ty + 0.5) * TILE_SIZE;
  world.tick();
  return chest;
}

describe('coffres de la carte', () => {
  it('la seed les pose sur une case nue, hors de la clairière, toujours aux mêmes endroits', () => {
    for (const seed of [1, 7, 42, 100, 2024]) {
      let count = 0;

      for (let cy = -3; cy <= 3; cy += 1) {
        for (let cx = -3; cx <= 3; cx += 1) {
          const chest = chestOfChunk(seed, cx, cy);

          expect(chestOfChunk(seed, cx, cy)).toEqual(chest);
          if (!chest) continue;
          count += 1;
          expect(['grass', 'sand']).toContain(terrainAt(seed, chest.tx, chest.ty));
          expect(resourceAt(seed, chest.tx, chest.ty)).toBeNull();
          expect(oreAt(seed, chest.tx, chest.ty)).toBeNull();

          const [sx, sy] = findSpawn(seed);

          expect((chest.tx - sx) ** 2 + (chest.ty - sy) ** 2).toBeGreaterThanOrEqual(CHESTS.minSpawnTiles ** 2);
        }
      }
      // 49 chunks : une bonne vingtaine de coffres.
      expect(count, `seed ${seed}`).toBeGreaterThan(10);
    }
  });

  it('Adam ouvre un coffre en s’en approchant : une pièce, marquée « Nouveau », et le coffre reste ouvert', () => {
    const world = new World(7);
    const opened: number[] = [];
    const found: { piece: PieceId; source: string }[] = [];

    world.events.on('chestOpened', ({ id }) => opened.push(id));
    world.events.on('pieceFound', (event) => found.push(event));

    const chest = nearestChest(world);

    expect(world.chestAt(chest.tx, chest.ty)).toEqual(chest);
    openNearestChest(world);

    expect(opened).toEqual([chest.id]);
    expect(found).toHaveLength(1);
    expect(found[0]!.source).toBe('chest');
    expect(world.player.wardrobe).toEqual([found[0]!.piece]);
    expect(world.player.unseenPieces).toEqual([found[0]!.piece]);
    expect(world.isChestOpen(chest.id)).toBe(true);
    expect(world.chestAt(chest.tx, chest.ty)).toBeNull();

    // Repasser dessus ne rouvre rien.
    for (let i = 0; i < 5; i += 1) world.tick();
    expect(opened).toHaveLength(1);

    // Une pièce gagnée se porte tout de suite.
    world.push({ type: 'dressAdam', look: { ...DEFAULT_LOOK, pieces: { ...DEFAULT_LOOK.pieces, [PIECES[found[0]!.piece].slot]: found[0]!.piece } } });
    world.tick();
    expect(world.player.look.pieces[PIECES[found[0]!.piece].slot]).toBe(found[0]!.piece);
  });

  it('l’éditeur qui montre une pièce lui ôte son « Nouveau »', () => {
    const world = new World(7);

    openNearestChest(world);

    const [piece] = world.player.unseenPieces;

    world.push({ type: 'seePieces', pieces: [piece!] });
    world.tick();
    expect(world.player.unseenPieces).toEqual([]);
    expect(world.player.wardrobe).toEqual([piece]);
  });

  it('on ne bâtit pas sur un coffre fermé', () => {
    const world = new World(7);
    const chest = nearestChest(world);

    world.player.x = (chest.tx + 0.5) * TILE_SIZE + 3 * TILE_SIZE;
    world.player.y = (chest.ty + 0.5) * TILE_SIZE;
    world.fog.reveal(chest.tx, chest.ty, 6);
    expect(world.placementBlock('home', chest.tx, chest.ty)?.reason).toBe('occupied');
  });

  it('coffres ouverts et pièces pas encore vues survivent à un rechargement ; une sauvegarde d’avant les coffres n’en a ouvert aucun', () => {
    const world = new World(7);
    const chest = openNearestChest(world);
    const loaded = decodeSave(encodeSave(world, 0));

    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.world.isChestOpen(chest.id)).toBe(true);
    expect(loaded.world.player.unseenPieces).toEqual(world.player.unseenPieces);
    expect(loaded.world.player.wardrobe).toEqual(world.player.wardrobe);

    const file = JSON.parse(encodeSave(world, 0)) as { state: Record<string, unknown> & { player: Record<string, unknown> } };

    delete file.state['chests'];
    delete file.state.player['unseenPieces'];

    const old = decodeSave(JSON.stringify(file));

    if (!old.ok) throw new Error(old.reason);
    expect(old.world.isChestOpen(chest.id)).toBe(false);
    expect(old.world.player.unseenPieces).toEqual([]);
  });
});
