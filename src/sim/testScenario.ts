/**
 * Les parties de test, bâties comme un joueur les bâtirait.
 *
 * Le scénario (`data/testScenario.ts`) dit quoi poser et où ; ce module le
 * rejoue sur un monde neuf avec les commandes du jeu : Adam se tient à côté
 * de l'emprise, pousse `placeBuilding`, remplit son sac de ce que le chantier
 * attend et pousse `transferToSite`, un tick à chaque fois. Le chantier
 * s'achève, ses ouvriers s'installent, le jour se lève à la mairie — par les
 * mêmes chemins qu'en jeu. Rien n'est écrit à la main dans l'état, sauf la
 * position d'Adam, son sac et le coffre de la ville, les abords explorés de la
 * mairie — et l'horloge, avancée au crépuscule pour un scénario du soir.
 *
 * Un scénario qui ne se pose plus (règle de placement, coût, terrain) lève
 * une erreur qui dit lequel et pourquoi : `testScenario.test.ts` la verrait
 * avant le joueur.
 */

import { CHUNK_TILES, TILE_SIZE, floorDiv } from '../core/grid.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import type { ItemId } from '../data/items.ts';
import { SCENARIO_REVEAL, type TestScenarioProto } from '../data/testScenario.ts';
import { copyLook } from '../data/wardrobe.ts';
import type { Chest } from './chests.ts';
import { baseCenter } from './enemyBases.ts';
import { isWalkable, resourceAt, terrainAt } from './terrain.ts';
import type { Store } from './store.ts';
import type { EntityId } from './types.ts';
import { HOME_REGION_ID } from './regions.ts';
import { World, siteMissing } from './world.ts';

type Amounts = Partial<Record<ItemId, number>>;

/** Le monde du scénario, au matin du premier jour : chaque appel rend le même. */
export function stageScenario(scenario: TestScenarioProto): World {
  const world = new World(scenario.seed);
  const hall = world.entities.get(world.townHallId);

  if (!hall) throw new Error('scénario de test : pas de mairie sur la carte');

  const { tx: hx, ty: hy } = hall;

  // La base et ses abords sont connus : le brouillard de guerre commence au-delà.
  world.revealAround(hx + 1, hy + 1, scenario.reveal ?? SCENARIO_REVEAL);
  deliver(world, world.townHallId, BUILDINGS.townHall.cost);
  for (const research of scenario.research ?? []) world.researchDone.push(research);

  for (const { building, dx, dy, delivered } of scenario.buildings) {
    const tx = hx + dx;
    const ty = hy + dy;
    const { width, height, cost } = BUILDINGS[building];

    standBeside(world, tx, ty, width, height);

    const rejection = world.canPlace(building, tx, ty);

    if (rejection) throw new Error(`scénario de test : ${building} refusé en (${dx}, ${dy}) — ${rejection}`);

    world.push({ type: 'placeBuilding', building, tx, ty });
    world.tick();

    const id = entityAt(world, tx, ty);

    if (id === null) throw new Error(`scénario de test : ${building} pas posé en (${dx}, ${dy})`);
    deliver(world, id, delivered ?? cost);
  }

  const town = world.townStock();

  if (!town) throw new Error('scénario de test : la mairie n’est pas bâtie');
  fill(town, scenario.town);
  fill(world.player.inventory, scenario.bag);
  teleport(world, (hx + scenario.adam.dx + 0.5) * TILE_SIZE, (hy + scenario.adam.dy + 0.5) * TILE_SIZE);
  if (scenario.gear !== undefined) world.player.gear = scenario.gear;
  if (scenario.nearBase !== undefined) besideBase(world, scenario.nearBase);
  if (scenario.nearChest !== undefined) besideChest(world, scenario.nearChest);
  if (scenario.nearLair !== undefined) besideLair(world, scenario.nearLair);
  if (scenario.wardrobe) {
    world.player.wardrobe = [...scenario.wardrobe.found];
    if (scenario.wardrobe.look) world.player.look = copyLook(scenario.wardrobe.look);
  }

  // Le soir tombe : l'horloge avance jusqu'au crépuscule, sans rien sauter d'autre — ni nuit, ni aube.
  if (scenario.dusk) {
    const clock = world.clock();

    if (clock) world.cycleStartTick -= DAY_CYCLE.day - clock.offset;
  }

  return world;
}

/**
 * Livre `amounts` au chantier `id` par « Transférer », depuis le sac
 * d'Adam seulement : la ville est vidée d'abord, pour qu'elle n'y ajoute
 * rien. Vérifie qu'il a reçu ce qu'on voulait.
 */
function deliver(world: World, id: EntityId, amounts: Amounts): void {
  const site = world.entities.get(id);

  if (site?.kind !== 'site') throw new Error(`scénario de test : ${id} n’est pas un chantier`);

  const want = Object.values(amounts).reduce((total, amount) => total + amount, 0);
  const missing = siteMissing(site) - want;
  const town = world.townStock();

  standBeside(world, site.tx, site.ty, site.width, site.height);
  if (town) fill(town, {});
  fill(world.player.inventory, amounts);
  world.push({ type: 'transferToSite', id });
  world.tick();

  const after = world.entities.get(id);
  const left = after?.kind === 'site' ? siteMissing(after) : 0;

  if (left !== missing) {
    throw new Error(`scénario de test : ${site.proto} attend encore ${left} objets au lieu de ${missing}`);
  }
}

/** Le bâtiment ou le chantier dont le coin haut-gauche est (tx, ty). */
function entityAt(world: World, tx: number, ty: number): EntityId | null {
  for (const entity of world.entities.values()) {
    if (entity.tx === tx && entity.ty === ty) return entity.id;
  }
  return null;
}

/** Adam se tient juste sous l'emprise, à mi-largeur : à portée, et pas dessus. */
function standBeside(world: World, tx: number, ty: number, width: number, height: number): void {
  teleport(world, (tx + width / 2) * TILE_SIZE, (ty + height + 0.5) * TILE_SIZE);
}

/** Adam à `tiles` tuiles du centre de la base debout la plus proche de la mairie, du côté de la mairie. */
function besideBase(world: World, tiles: number): void {
  const base = world.leadBase();
  const hall = world.entities.get(world.townHallId);

  if (!base || !hall) throw new Error('scénario de test : pas de base mutante près de la mairie');

  const { x, y } = baseCenter(base);
  const hx = (hall.tx + hall.width / 2) * TILE_SIZE;
  const hy = (hall.ty + hall.height / 2) * TILE_SIZE;
  const length = Math.hypot(hx - x, hy - y) || 1;

  teleport(world, x + ((hx - x) / length) * tiles * TILE_SIZE, y + ((hy - y) / length) * tiles * TILE_SIZE);
}

/** Adam à `tiles` tuiles à gauche du coffre fermé le plus proche de la mairie, ses abords explorés. */
function besideChest(world: World, tiles: number): void {
  const hall = world.entities.get(world.townHallId);

  if (!hall) throw new Error('scénario de test : pas de mairie');

  const cx = floorDiv(hall.tx, CHUNK_TILES);
  const cy = floorDiv(hall.ty, CHUNK_TILES);
  let best: Chest | null = null;

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const chest = world.chestOfChunk(cx + dx, cy + dy);

      if (!chest || world.chestAt(chest.tx, chest.ty) === null) continue;
      // Le chemin d'Adam jusqu'au coffre est libre : ni eau, ni arbre, ni rocher.
      if (!Array.from({ length: tiles }, (_, i) => chest.tx - 1 - i).every((tx) => isWalkable(terrainAt(world.seed, tx, chest.ty)) && resourceAt(world.seed, tx, chest.ty) === null)) continue;
      if (!best || (chest.tx - hall.tx) ** 2 + (chest.ty - hall.ty) ** 2 < (best.tx - hall.tx) ** 2 + (best.ty - hall.ty) ** 2) best = chest;
    }
  }
  if (!best) throw new Error('scénario de test : pas de coffre près de la mairie');
  world.revealAround(best.tx, best.ty, tiles + 6);
  teleport(world, (best.tx - tiles + 0.5) * TILE_SIZE, (best.ty + 0.5) * TILE_SIZE);
}

/** Seule la prairie de départ est conquise ; Adam à `tiles` tuiles du repaire de la première région, côté mairie. */
function besideLair(world: World, tiles: number): void {
  const lair = world.regions[1]?.lair;
  const hall = world.entities.get(world.townHallId);

  if (!lair || !hall) throw new Error('scénario de test : pas de repaire de gardien');
  world.conquered = new Set([HOME_REGION_ID]);

  const x = (lair.tx + 0.5) * TILE_SIZE;
  const y = (lair.ty + 0.5) * TILE_SIZE;
  const hx = (hall.tx + hall.width / 2) * TILE_SIZE;
  const hy = (hall.ty + hall.height / 2) * TILE_SIZE;
  const length = Math.hypot(hx - x, hy - y) || 1;

  world.revealAround(lair.tx, lair.ty, tiles + 8);
  teleport(world, x + ((hx - x) / length) * tiles * TILE_SIZE, y + ((hy - y) / length) * tiles * TILE_SIZE);
}

function teleport(world: World, x: number, y: number): void {
  Object.assign(world.player, { x, y, prevX: x, prevY: y });
}

/** Le coffre ne contient plus que `amounts`. */
function fill(store: Store, amounts: Amounts): void {
  for (const [item, count] of store.entries()) store.remove(item, count);
  for (const [item, amount] of Object.entries(amounts) as [ItemId, number][]) {
    if (store.add(item, amount) < amount) throw new Error(`scénario de test : pas la place pour ${amount} ${item}`);
  }
}
