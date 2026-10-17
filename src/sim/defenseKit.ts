import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { ENEMIES, QUEEN } from '../data/enemies.ts';
import type { ItemId } from '../data/items.ts';
import { CYCLE_TICKS } from './dayNight.ts';
import type { Building, EntityId, Mutant, Tower } from './types.ts';
import { World } from './world.ts';

/** Les outils des tests de défense : chantiers achevés, tours, usine, Reine posée à la main. */

/**
 * Un chantier achevé d'office : son coût dans le sac, Adam à portée le temps
 * de « Transférer », puis il revient où il était. Ces tests portent sur la
 * défense, pas sur la récolte.
 */
export function finish(world: World, id: EntityId): Building {
  const site = world.entities.get(id);

  if (site?.kind !== 'site') throw new Error(`#${id} n'est pas un chantier`);
  for (const [item, amount] of Object.entries(BUILDINGS[site.proto].cost) as [ItemId, number][]) {
    world.player.inventory.add(item, amount - (site.delivered[item] ?? 0));
  }

  const { x, y } = world.player;

  world.player.x = (site.tx + site.width / 2) * TILE_SIZE;
  world.player.y = (site.ty + site.height + 0.5) * TILE_SIZE;
  world.push({ type: 'transferToSite', id });
  world.tick();
  world.player.x = world.player.prevX = x;
  world.player.y = world.player.prevY = y;

  const built = world.entities.get(id);

  if (!built || built.kind === 'site') throw new Error('le chantier ne s’est pas achevé');
  return built;
}

export function hallOf(world: World): Building {
  const hall = world.entities.get(world.townHallId);

  if (!hall || hall.kind === 'site') throw new Error('pas de mairie debout');
  return hall;
}

/** La mairie debout, Adam juste en dessous, qui pousse contre elle s'il marche vers le haut. */
export function worldWithTownHall(seed: number): World {
  const world = new World(seed);
  const hall = finish(world, world.townHallId);

  world.player.x = world.player.prevX = (hall.tx + hall.width / 2) * TILE_SIZE;
  world.player.y = world.player.prevY = (hall.ty + hall.height + 0.5) * TILE_SIZE;
  return world;
}

/** Pose et achève `building` en (tx, ty), Adam à portée le temps de poser ; `null` si la case est refusée. */
export function placeAt(world: World, building: BuildingId, tx: number, ty: number): Building | null {
  const { x, y } = world.player;

  // À portée le temps de poser.
  world.player.x = (tx + 0.5) * TILE_SIZE;
  world.player.y = (ty + 3.5) * TILE_SIZE;
  if (world.canPlace(building, tx, ty) !== null) {
    world.player.x = x;
    world.player.y = y;
    return null;
  }

  const before = new Set(world.entities.keys());

  world.push({ type: 'placeBuilding', building, tx, ty });
  world.tick();
  world.player.x = world.player.prevX = x;
  world.player.y = world.player.prevY = y;

  const id = [...world.entities.keys()].find((key) => !before.has(key));

  if (id === undefined) throw new Error('le chantier n’a pas été ouvert');
  return finish(world, id);
}

/**
 * Pose `count` tours de guet au plus près de la mairie, en laissant libre
 * l'anneau autour d'elle où se tient Adam.
 */
export function addTowers(world: World, count: number): void {
  const hall = hallOf(world);
  const cx = hall.tx + hall.width / 2;
  const cy = hall.ty + hall.height / 2;
  const spots: [number, number][] = [];

  for (let dy = -6; dy <= 6; dy += 1) {
    for (let dx = -6; dx <= 6; dx += 1) spots.push([hall.tx + dx, hall.ty + dy]);
  }
  spots.sort(([ax, ay], [bx, by]) => Math.hypot(ax + 1 - cx, ay + 1 - cy) - Math.hypot(bx + 1 - cx, by + 1 - cy));

  let placed = 0;

  for (const [tx, ty] of spots) {
    if (placed === count) return;
    if (tx >= hall.tx - 2 && tx <= hall.tx + hall.width && ty >= hall.ty - 2 && ty <= hall.ty + hall.height + 1) continue;
    if (placeAt(world, 'watchtower', tx, ty)) placed += 1;
  }
  if (placed < count) throw new Error('pas assez de place pour les tours');
}

/**
 * L'usine isolée du playtest : une ferme et une carrière posées à l'écart
 * de la mairie, de part et d'autre, là où rien ne les défend.
 */
export function addFactory(world: World): Building[] {
  const hall = hallOf(world);
  const factory: Building[] = [];

  for (const [building, side] of [['farm', 1], ['quarry', -1]] as const) {
    let built: Building | null = null;

    for (let distance = 9; distance <= 14 && !built; distance += 1) {
      for (let dy = -4; dy <= 4 && !built; dy += 1) built = placeAt(world, building, hall.tx + side * distance, hall.ty + dy);
    }
    if (!built) throw new Error(`pas de place pour : ${building}`);
    factory.push(built);
  }
  return factory;
}

/** Une tour de guet collée à ce bâtiment : sous la mairie, ou à côté sinon. */
export function guard(world: World, building: Building, count: number): void {
  let placed = 0;

  for (const [dx, dy] of [[0, 2], [0, -2], [2, 0], [-2, 0], [2, 2], [-2, 2], [2, -2], [-2, -2]] as const) {
    if (placed < count && placeAt(world, 'watchtower', building.tx + dx, building.ty + dy)) placed += 1;
  }
  if (placed < count) throw new Error(`pas de place pour garder #${building.id}`);
}

/** Joue jusqu'à l'aube de la nuit `night`, ou jusqu'à la défaite. */
export function playThroughNight(world: World, night: number, between: () => void = () => {}): void {
  for (let i = 0; i < 20 * 60 * 5 * (night + 1) && !world.defeated; i += 1) {
    world.tick();
    between();
    if (world.night === night && world.clock()?.phase === 'dawn') return;
  }
}


export function towersOf(world: World): Tower[] {
  return [...world.entities.values()].filter((entity): entity is Tower => entity.kind === 'tower');
}

export function queenOf(world: World): Mutant | undefined {
  return [...world.mobiles.values()].find((mobile): mobile is Mutant => mobile.kind === 'mutant' && mobile.proto === 'queen');
}

export function centerOf(entity: { tx: number; ty: number; width: number; height: number }): { x: number; y: number } {
  return { x: (entity.tx + entity.width / 2) * TILE_SIZE, y: (entity.ty + entity.height / 2) * TILE_SIZE };
}

/** Une Reine posée à la main, sortie de terre, à (x, y), avec `hp` points de vie. */
export function placeQueen(world: World, x: number, y: number, hp: number = ENEMIES.queen.hp, id = 90_000): Mutant {
  const queen: Mutant = {
    kind: 'mutant',
    id,
    proto: 'queen',
    x,
    y,
    prevX: x,
    prevY: y,
    facing: 'down',
    moving: false,
    hp,
    age: 100,
    attackCooldown: 0,
    emerge: 0,
    queen: { phase: 1, layTicks: QUEEN.layTicks, prey: null },
  };

  world.mobiles.set(id, queen);
  return queen;
}

/** Avance l'horloge : le prochain tick est `before` ticks avant la tombée de la nuit `night`. */
export function jumpToNight(world: World, night: number, before: number): void {
  world.cycleStartTick = world.tickCount + 1 - ((night - 1) * CYCLE_TICKS + DAY_CYCLE.day + DAY_CYCLE.dusk - before);
  world.night = night - 1;
}
