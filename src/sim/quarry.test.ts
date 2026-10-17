import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { unlockingResearch } from './research.ts';
import type { ItemId } from '../data/items.ts';
import { RECIPES } from '../data/recipes.ts';
import { decodeSave, encodeSave, type SavedEntity } from './save.ts';
import { isWalkable, terrainAt } from './terrain.ts';
import type { Entity, Quarry } from './types.ts';
import { TICKS_PER_SECOND, World } from './world.ts';
import { SLOW } from './sweep.ts';

const MINUTE = 60 * TICKS_PER_SECOND;

/** La carrière, au sud-est de la mairie, dans le rayon du poste de logistique. */
const QUARRY_SPOT = { dx: 4, dy: 6 };

/** Une seed dont la mairie a une plaine sans eau autour : tout le monde y va en ligne droite. */
function landSeed(): { world: World; hx: number; hy: number } {
  for (let seed = 1; seed < 400; seed += 1) {
    const world = new World(seed);
    const hall = world.entities.get(world.townHallId)!;
    let dry = true;

    for (let ty = hall.ty - 4; ty < hall.ty + 14 && dry; ty += 1) {
      for (let tx = hall.tx - 8; tx < hall.tx + 12 && dry; tx += 1) {
        if (!isWalkable(terrainAt(world.seed, tx, ty))) dry = false;
      }
    }
    if (dry) return { world, hx: hall.tx, hy: hall.ty };
  }
  throw new Error('aucune seed testable — la génération de terrain a changé');
}

/**
 * La colonie d'une partie lancée : la mairie debout, deux tours de guet pour
 * tenir les nuits, un poste de logistique au sud, et Adam à côté, prêt à
 * poser la carrière. Posée d'un coup en retouchant la sauvegarde d'un monde neuf.
 */
function colony(): { world: World; hx: number; hy: number } {
  const { world, hx, hy } = landSeed();
  const state = world.snapshot();
  let nextId = state.nextId;
  const built = (proto: BuildingId, dx: number, dy: number): SavedEntity => {
    const { width, height, hp, workers } = BUILDINGS[proto];
    const base = { id: nextId++, proto, tx: hx + dx, ty: hy + dy, width, height, store: {}, hp, level: 1, paused: false, staff: workers };

    return BUILDINGS[proto].kind === 'tower' ? { ...base, kind: 'tower', armed: false } : { ...base, kind: 'depot' };
  };

  state.entities = [
    // De l'eau pour vingt minutes : ce n'est pas la soif qu'on mesure ici.
    { kind: 'townHall', id: world.townHallId, proto: 'townHall', tx: hx, ty: hy, width: 3, height: 3, store: { water: 400 }, hp: BUILDINGS.townHall.hp, level: 1, paused: false, staff: 0 },
    built('watchtower', -3, 0),
    built('watchtower', 4, 0),
    built('logisticsPost', 0, 6),
  ];
  state.nextId = nextId;
  state.mobiles = [];
  // Le premier jour se lève : les nuits et leurs vagues comptent dans la partie.
  state.cycleStartTick = state.tick + 1;
  state.player = { ...state.player, x: (hx + 2) * TILE_SIZE, y: (hy + 5) * TILE_SIZE };
  return { world: World.restore(state), hx, hy };
}

/** Pose la carrière depuis le menu et la bâtit comme Adam : son bois, d'un « Transférer ». */
function buildQuarry(world: World, hx: number, hy: number): Quarry {
  world.push({ type: 'placeBuilding', building: 'quarry', tx: hx + QUARRY_SPOT.dx, ty: hy + QUARRY_SPOT.dy });
  world.tick();

  const site = [...world.entities.values()].find((entity) => entity.proto === 'quarry');

  if (!site) throw new Error('la carrière n’a pas été posée');
  for (const [item, amount] of Object.entries(BUILDINGS.quarry.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
  world.push({ type: 'transferToSite', id: site.id });
  world.tick();

  const quarry = world.entities.get(site.id);

  if (quarry?.kind !== 'quarry') throw new Error('la carrière ne s’est pas achevée');
  return quarry;
}

function stoneIn(entity: Entity | undefined): number {
  return entity && entity.kind !== 'site' ? entity.store.count('stone') : 0;
}

describe('carrière', () => {
  it('se bâtit en bois seul : c’est elle qui donne la pierre qui manque', () => {
    expect(Object.keys(BUILDINGS.quarry.cost)).toEqual(['wood']);
    expect(unlockingResearch('quarry')).toBeNull();
    expect(BUILDINGS.quarry.plan).toBe(false);
  });

  it('taille de la pierre dans son coffre, sans rocher, à la cadence de sa recette', () => {
    const { world, hx, hy } = colony();
    const quarry = buildQuarry(world, hx, hy);
    const { duration, outputs } = RECIPES.cutStone;

    for (let i = 0; i < duration; i += 1) world.tick();

    expect(quarry.store.count('stone') + stoneIn(world.entities.get(world.townHallId))).toBe(outputs.stone);
  });

  it('s’arrête en pause', () => {
    const { world, hx, hy } = colony();
    const quarry = buildQuarry(world, hx, hy);

    world.push({ type: 'pauseBuilding', id: quarry.id, paused: true });
    for (let i = 0; i < 3 * RECIPES.cutStone.duration; i += 1) world.tick();

    expect(world.stopped(quarry)).toBe(true);
    expect(quarry.store.count('stone') + stoneIn(world.entities.get(world.townHallId))).toBeLessThanOrEqual(RECIPES.cutStone.outputs.stone);
  });

  it('se sauvegarde et se recharge', () => {
    const { world, hx, hy } = colony();
    const quarry = buildQuarry(world, hx, hy);

    for (let i = 0; i < RECIPES.cutStone.duration / 2; i += 1) world.tick();

    const reloaded = decodeSave(encodeSave(world, 1));

    if (!reloaded.ok) throw new Error(`sauvegarde refusée : ${reloaded.reason}`);
    expect(reloaded.world.entities.get(quarry.id)?.kind).toBe('quarry');
    // Le réveil en cours est sauvegardé : la taille reprend où elle en était.
    for (let i = 0; i < RECIPES.cutStone.duration; i += 1) reloaded.world.tick();
    expect(stoneIn(reloaded.world.entities.get(quarry.id)) + stoneIn(reloaded.world.entities.get(world.townHallId))).toBeGreaterThan(0);
  });

  /*
   * Le playtest du 30/09/2026 : 285 bois en ville, et la pierre à 0 ou 3
   * pendant vingt minutes — tout le monde attendait de la pierre. Vingt
   * minutes de partie, seed fixée, nuits comprises : la ville dépense sa
   * pierre dès qu'elle en a de quoi payer une tour, et la carrière la
   * remplit — jamais plus de deux minutes d'affilée à zéro.
   */
  it.skipIf(!SLOW)('ne laisse pas la ville à court de pierre plus de deux minutes sur vingt', () => {
    const { world, hx, hy } = colony();

    buildQuarry(world, hx, hy);

    const hall = world.entities.get(world.townHallId);

    if (hall?.kind !== 'townHall') throw new Error('pas de mairie');

    let dry = 0;
    let longestDry = 0;
    let spent = 0;

    for (let i = 0; i < 20 * MINUTE; i += 1) {
      world.tick();

      const stock = hall.store.available('stone');

      // Le joueur bâtit dès qu'il peut : la pierre ne s'accumule pas.
      if (stock >= 4) spent += hall.store.remove('stone', 4);
      dry = hall.store.count('stone') === 0 ? dry + 1 : 0;
      longestDry = Math.max(longestDry, dry);
    }

    expect(world.defeated).toBe(false);
    expect(longestDry).toBeLessThanOrEqual(2 * MINUTE);
    expect(spent).toBeGreaterThanOrEqual(60);
  });
});
