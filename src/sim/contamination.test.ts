import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../data/buildings.ts';
import { CONTAMINATION, CONTAMINATION_KINDS, PURIFIER } from '../data/contamination.ts';
import { RESEARCH } from '../data/research.ts';
import { TILE_SIZE } from '../core/grid.ts';
import { Land, contaminationAt } from './contamination.ts';
import { decodeSave, encodeSave } from './save.ts';
import { findSpawn } from './terrain.ts';
import { World } from './world.ts';

const SEED = 100;

/** Les tuiles de la carte (hors clairière) qui portent ce sol. */
function tilesOf(seed: number, kind: 'polluted' | 'radioactive', limit = 4000): { tx: number; ty: number }[] {
  const found: { tx: number; ty: number }[] = [];

  for (let ty = -120; ty < 120 && found.length < limit; ty += 1) {
    for (let tx = -120; tx < 120 && found.length < limit; tx += 1) {
      if (contaminationAt(seed, tx, ty) === kind) found.push({ tx, ty });
    }
  }
  return found;
}

/** Une emprise 2 × 2 de terre saine, libre, dont le bord touche une case polluée, Adam à côté et la carte vue. */
function siteBesidePollution(world: World): { tx: number; ty: number } {
  for (const { tx, ty } of tilesOf(world.seed, 'polluted')) {
    for (const [dx, dy] of [[-2, 0], [1, 0], [0, -2], [0, 1]] as const) {
      const at = { tx: tx + dx, ty: ty + dy };

      world.revealAround(at.tx, at.ty, 8);
      world.player.x = (at.tx + 1) * TILE_SIZE;
      world.player.y = (at.ty + 3) * TILE_SIZE;
      if (world.placementBlock('purifier', at.tx, at.ty) === null) return at;
    }
  }
  throw new Error('aucune case saine au bord de la pollution');
}

describe('terres polluées et radioactives', () => {
  it('apparaissent sur la carte, de façon déterministe', () => {
    expect(tilesOf(SEED, 'polluted').length).toBeGreaterThan(100);
    expect(tilesOf(SEED, 'radioactive').length).toBeGreaterThan(30);
    expect(contaminationAt(SEED, 60, 60)).toBe(contaminationAt(SEED, 60, 60));
  });

  it('épargnent la clairière de départ, sur cent graines', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const [hallX, hallY] = findSpawn(seed);

      for (let ty = hallY - 22; ty <= hallY + 22; ty += 4) {
        for (let tx = hallX - 22; tx <= hallX + 22; tx += 4) {
          if ((tx - hallX) ** 2 + (ty - hallY) ** 2 <= CONTAMINATION.safeRadius ** 2) expect(contaminationAt(seed, tx, ty)).toBeNull();
        }
      }
    }
  });

  it('ne se bâtissent pas, avec un motif par sol', () => {
    const world = new World(SEED);
    const polluted = tilesOf(SEED, 'polluted')[0]!;
    const radioactive = tilesOf(SEED, 'radioactive')[0]!;

    expect(CONTAMINATION.safeRadius).toBeGreaterThan(0);
    expect(CONTAMINATION_KINDS.polluted.buildable).toBe(false);
    expect(world.land.buildable(polluted.tx, polluted.ty)).toBe(false);
    expect(world.land.buildable(radioactive.tx, radioactive.ty)).toBe(false);
    expect(world.placementBlock('home', polluted.tx, polluted.ty)?.reason).not.toBe(null);
  });

  it('la terre radioactive ne se nettoie pas', () => {
    const land = new Land(SEED);
    const spot = tilesOf(SEED, 'radioactive')[0]!;

    expect(land.clean(spot.tx, spot.ty)).toBe(false);
    expect(land.at(spot.tx, spot.ty)).toBe('radioactive');
  });

  it('la terre polluée nettoyée redevient constructible, et se sauvegarde', () => {
    const land = new Land(SEED);
    const spot = tilesOf(SEED, 'polluted')[0]!;

    expect(land.clean(spot.tx, spot.ty)).toBe(true);
    expect(land.clean(spot.tx, spot.ty)).toBe(false);
    expect(land.buildable(spot.tx, spot.ty)).toBe(true);

    const restored = new Land(SEED);

    restored.restore(land.toJSON());
    expect(restored.at(spot.tx, spot.ty)).toBeNull();
  });
});

describe('station de dépollution', () => {
  it('n’est pas au menu au départ : elle se débloque au labo, recherche « Dépollution »', () => {
    const world = new World(SEED);

    expect(world.isUnlocked('purifier')).toBe(false);
    expect(RESEARCH.purification.unlocks).toContain('purifier');
    world.researchDone.push('purification');
    expect(world.isUnlocked('purifier')).toBe(true);
  });

  it('va plus vite avec « Filtres doubles »', () => {
    const world = new World(SEED);

    expect(world.bonus('purifyTicks')).toBe(0);
    world.researchDone.push('charcoalFilters');
    expect(PURIFIER.intervalTicks + world.bonus('purifyTicks')).toBe(PURIFIER.intervalTicks / 2);
  });

  it('nettoie les cases polluées voisines, une à la fois, les plus proches d’abord', () => {
    const world = new World(SEED);

    world.researchDone.push('purification');

    const site = siteBesidePollution(world);
    const before = world.land.cleanableAround(site.tx, site.ty, 2, 2, PURIFIER.radius);
    const first = before[0]!;

    world.player.inventory.add('wood', 20);
    world.push({ type: 'placeBuilding', building: 'purifier', tx: site.tx, ty: site.ty });
    world.tick();

    const placed = [...world.entities.values()].find((entity) => entity.proto === 'purifier')!;

    // Le chantier livré d'un coup, comme « Transférer » à la dernière pièce.
    (placed as { delivered: Record<string, number> }).delivered = { ...BUILDINGS.purifier.cost, ironOre: BUILDINGS.purifier.cost.ironOre - 1 };
    world.player.inventory.add('ironOre', 1);
    world.push({ type: 'transferToSite', id: placed.id });
    world.tick();
    expect(world.entities.get(placed.id)?.kind).toBe('purifier');
    for (let i = 0; i < PURIFIER.intervalTicks * 2; i += 1) world.tick();

    const after = world.land.cleanableAround(site.tx, site.ty, 2, 2, PURIFIER.radius);

    expect(world.land.at(first.tx, first.ty)).toBeNull();
    expect(after.length).toBeLessThan(before.length);
    expect(after.length).toBeGreaterThanOrEqual(before.length - 2);
  });

  it('survit à la sauvegarde, et une sauvegarde d’avant se charge sans terres nettoyées', () => {
    const world = new World(SEED);
    const spot = tilesOf(SEED, 'polluted')[0]!;

    world.land.clean(spot.tx, spot.ty);

    const decoded = decodeSave(encodeSave(world, 0));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.world.land.at(spot.tx, spot.ty)).toBeNull();

    const old = JSON.parse(encodeSave(world, 0)) as { state: Record<string, unknown> };

    delete old.state['cleaned'];

    const legacy = decodeSave(JSON.stringify(old));

    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.world.land.at(spot.tx, spot.ty)).toBe('polluted');
  });
});
