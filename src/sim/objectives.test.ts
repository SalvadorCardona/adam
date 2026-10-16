import { describe, expect, it } from 'vitest';
import { TILE_SIZE, worldToTile } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import type { ItemId } from '../data/items.ts';
import { CHAPTERS, LEGACY_OBJECTIVES, OBJECTIVES, OBJECTIVE_IDS, objectiveBagBonus, type Goal } from '../data/objectives.ts';
import { chapterReach, goalOutOfReach } from '../data/reach.ts';
import { RECIPES } from '../data/recipes.ts';
import type { ResearchId } from '../data/research.ts';
import { validatePrototypes } from '../data/validate.ts';
import { BUILD_REACH_TILES, INVENTORY_CAPACITY } from './player.ts';
import { SAVE_VERSION, decodeSave, encodeSave, serialize } from './save.ts';
import { chapterObjectives, currentChapter, goalProgress, labSpot, lockedObjectiveBuildings, objectiveLock, objectiveWait, openObjectives } from './objectives.ts';
import { CYCLE_TICKS } from './dayNight.ts';
import { Store } from './store.ts';
import type { Entity, EntityId } from './types.ts';
import { World } from './world.ts';

/** Place Adam sur une tuile libre collée à l'emprise, et renvoie l'axe qui pousse vers elle. */
function standNextTo(world: World, tx: number, ty: number, width: number, height: number): { x: number; y: number } {
  const candidates: [number, number, number, number][] = [];

  for (let x = tx; x < tx + width; x += 1) {
    candidates.push([x, ty + height, 0, -1], [x, ty - 1, 0, 1]);
  }
  for (let y = ty; y < ty + height; y += 1) {
    candidates.push([tx + width, y, -1, 0], [tx - 1, y, 1, 0]);
  }

  for (const [x, y, axisX, axisY] of candidates) {
    if (world.isSolid(x, y)) continue;

    world.player.x = (x + 0.5) * TILE_SIZE;
    world.player.y = (y + 0.5) * TILE_SIZE;
    return { x: axisX, y: axisY };
  }
  throw new Error('emprise cernée');
}

/** Remplit le sac avec le coût et pousse contre le chantier : le dernier objet livré l'achève. */
function completeSite(world: World, id: EntityId): Entity {
  const site = world.entities.get(id);

  if (site?.kind !== 'site') throw new Error(`#${id} n'est pas un chantier`);

  for (const [item, amount] of Object.entries(BUILDINGS[site.proto].cost) as [ItemId, number][]) {
    world.player.inventory.add(item, amount);
  }

  world.push({ type: 'setMoveAxis', ...standNextTo(world, site.tx, site.ty, site.width, site.height) });

  for (let i = 0; i < 400; i += 1) {
    world.tick();

    const current = world.entities.get(id);

    if (current?.kind !== 'site') break;
  }
  world.push({ type: 'setMoveAxis', x: 0, y: 0 });
  world.tick();

  const built = world.entities.get(id);

  if (!built || built.kind === 'site') throw new Error('le chantier ne s’est pas achevé');
  return built;
}

/** Pose un chantier en (tx, ty) et l'achève. */
function buildAt(world: World, building: BuildingId, tx: number, ty: number): Entity {
  const before = new Set(world.entities.keys());

  world.push({ type: 'placeBuilding', building, tx, ty });
  world.tick();

  const id = [...world.entities.keys()].find((key) => !before.has(key));

  if (id === undefined) throw new Error(`${building} n’a pas été posé`);
  return completeSite(world, id);
}

/** Une case gardée pour plus tard : aucun autre bâtiment 2 × 2 ne doit la chevaucher. */
type Reserved = { tx: number; ty: number } | null;

function overlaps(tx: number, ty: number, reserved: Reserved): boolean {
  return reserved !== null && Math.abs(tx - reserved.tx) < 2 && Math.abs(ty - reserved.ty) < 2;
}

/**
 * La première case posable autour d'Adam, éventuellement une foreuse au bord
 * d'un filon de fer : deux cases de fer, deux d'herbe — Adam y a cassé les
 * rochers du filon.
 */
function spot(world: World, building: BuildingId, iron = false, reserved: Reserved = null): { tx: number; ty: number } | null {
  const origin = worldToTile(world.player.x, world.player.y);

  for (let dy = -BUILD_REACH_TILES; dy <= BUILD_REACH_TILES; dy += 1) {
    for (let dx = -BUILD_REACH_TILES; dx <= BUILD_REACH_TILES; dx += 1) {
      const tx = origin.tx + dx;
      const ty = origin.ty + dy;

      if (overlaps(tx, ty, reserved)) continue;
      if (iron) {
        const footing = world.footing(building, tx, ty);

        if (!footing?.valid || footing.ore !== 'ironOre') continue;
        for (const tile of footing.tiles) if (tile.state === 'ore') world.resources.clear(tile.tx, tile.ty);
      }
      if (world.canPlace(building, tx, ty) === null) return { tx, ty };
    }
  }
  return null;
}

/** Adam revient au pied de la mairie, où son arc la défend. */
function guardTownHall(world: World): void {
  const hall = world.entities.get(world.townHallId)!;

  standNextTo(world, hall.tx, hall.ty, hall.width, hall.height);
}

/**
 * L'antenne, à 8 ou 9 cases de la mairie — dans son rayon : la ville la
 * livre —, ses trois étages déposés en ville puis transférés, ou portés par
 * les porteurs qui les ont vus arriver.
 */
function raiseAntenna(world: World): void {
  const hall = world.entities.get(world.townHallId)!;
  const town = world.townStock()!;
  const at = antennaSpot(world);
  const before = new Set(world.entities.keys());

  world.push({ type: 'placeBuilding', building: 'antenna', tx: at.tx, ty: at.ty });
  world.tick();

  const id = [...world.entities.keys()].find((key) => !before.has(key));

  if (id === undefined) throw new Error('l’antenne n’a pas été posée');
  for (const [item, amount] of Object.entries(BUILDINGS.antenna.cost) as [ItemId, number][]) town.add(item, amount);
  world.push({ type: 'transferToSite', id });
  world.tick();

  for (const floor of BUILDINGS.antenna.upgrades) {
    for (const [item, amount] of Object.entries(floor.cost) as [ItemId, number][]) town.add(item, amount);
    world.push({ type: 'supplyBuilding', id });
    world.tick();
  }

  // Ce que les porteurs avaient déjà en route arrive à pied.
  runUntil(world, () => world.victory, 20 * 60);

  const antenna = world.entities.get(id);

  if (antenna?.kind !== 'antenna' || antenna.level !== 3) throw new Error('l’antenne n’a pas ses trois étages');
  guardTownHall(world);
  expect(hall.kind).toBe('townHall');
}

/** Une case où poser l'antenne, à 8 ou 9 cases de la mairie ; Adam se poste au pied. */
function antennaSpot(world: World): { tx: number; ty: number } {
  const hall = world.entities.get(world.townHallId)!;
  const cx = hall.tx + hall.width / 2;
  const cy = hall.ty + hall.height / 2;

  for (let dy = -10; dy <= 10; dy += 1) {
    for (let dx = -10; dx <= 10; dx += 1) {
      const distance = Math.hypot(dx, dy);

      if (distance < 8 || distance > 9) continue;

      const tx = Math.round(cx + dx - 1.5);
      const ty = Math.round(cy + dy - 1.5);

      world.player.x = (tx + 1.5) * TILE_SIZE;
      world.player.y = (ty + 4.5) * TILE_SIZE;
      if (world.canPlace('antenna', tx, ty) === null) return { tx, ty };
    }
  }
  throw new Error('aucune case pour l’antenne');
}

/** Avance jusqu'à ce que `done` soit vrai, en `limit` ticks au plus. */
function runUntil(world: World, done: () => boolean, limit: number, what = ''): void {
  for (let i = 0; i < limit && !done(); i += 1) world.tick();
  if (!done()) throw new Error(`${what} rien au bout de ${limit} ticks (chapitre ${world.chapter}, mairie tombée : ${world.defeated})`);
}

/** Une seed qui offre, à portée du point d'apparition, un filon de fer où poser une foreuse. */
function seedWithIron(): number {
  for (let seed = 1; seed < 800; seed += 1) {
    if (spot(new World(seed), 'drill', true)) return seed;
  }
  throw new Error('aucune seed testable — la génération de filons a changé');
}


/** Ajoute aux objectifs réussis tous ceux du chapitre en cours, sans rien bâtir : le chapitre se ferme au tick suivant. */
function passChapter(world: World): void {
  for (const { id } of chapterObjectives(world)) world.objectivesDone.add(id);
  world.tick();
}

/** Un sac à la mesure d'un chantier d'antenne : le test ne va pas chercher les matériaux. */
function bigBag(world: World): void {
  const { inventory } = world.player;

  world.player.inventory = Store.fromJSON(inventory.capacity + 1000, inventory.toJSON());
}

/**
 * Une case où poser `building` dans la prairie, au plus près de la mairie :
 * Adam s'y poste, le brouillard est levé. Une foreuse veut le bord d'un filon
 * de fer — Adam en casse les rochers.
 */
function siteFor(world: World, building: BuildingId): { tx: number; ty: number } {
  const hall = world.entities.get(world.townHallId)!;
  const { width, height } = BUILDINGS[building];

  for (let r = 3; r <= 28; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;

        const tx = hall.tx + dx;
        const ty = hall.ty + dy;

        world.player.x = (tx + width / 2) * TILE_SIZE;
        world.player.y = (ty + height + 1.5) * TILE_SIZE;
        if (building === 'drill') {
          const footing = world.footing(building, tx, ty);

          if (!footing?.valid) continue;
          for (const tile of footing.tiles) if (tile.state === 'ore') world.resources.clear(tile.tx, tile.ty);
        }
        if (world.canPlace(building, tx, ty) === null) return { tx, ty };
      }
    }
  }
  throw new Error(`aucune case pour ${building}`);
}

/** Pose `building` par la commande du joueur, lui livre son coût depuis le sac, et attend qu'il soit bâti — bâtisseurs compris. */
function raise(world: World, building: BuildingId): Entity {
  const at = building === 'antenna' ? antennaSpot(world) : siteFor(world, building);
  let id = -1;
  const off = world.events.on('buildingPlaced', (event) => (id = event.id));

  // Les bâtisseurs d'un poste de construction prendraient leur temps : le poste en pause, le chantier livré s'achève aussitôt.
  for (const entity of world.entities.values()) {
    if (entity.kind !== 'site' && entity.proto === 'constructionPost' && !('paused' in entity && entity.paused)) {
      world.push({ type: 'pauseBuilding', id: entity.id, paused: true });
    }
  }
  world.push({ type: 'placeBuilding', building, tx: at.tx, ty: at.ty });
  world.tick();
  off();
  if (id < 0) throw new Error(`${building} n’a pas été posé`);
  for (const [item, amount] of Object.entries(BUILDINGS[building].cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
  world.push({ type: 'transferToSite', id });
  world.tick();
  runUntil(world, () => world.entities.get(id)?.kind !== 'site', 20 * 120, building);
  return world.entities.get(id)!;
}

/** Remplit une condition : par la commande du joueur pour un bâtiment, par ses compteurs pour le reste. */
function satisfy(world: World, goal: Goal): void {
  switch (goal.type) {
    case 'build': {
      if (goal.building === 'antenna') {
        raiseAntenna(world);
        return;
      }
      expect(world.inMenu(goal.building), goal.building).toBe(true);

      const built = [...world.entities.values()].filter((entity) => entity.kind !== 'site' && entity.proto === goal.building).length;

      for (let i = built; i < goal.count; i += 1) raise(world, goal.building);
      return;
    }
    case 'nights':
      world.stats.nightsSurvived = world.chapterBase.nightsSurvived + goal.count;
      return;
    case 'produce':
      world.stats.produced[goal.item] = Math.max(world.stats.produced[goal.item] ?? 0, goal.count);
      return;
    case 'births':
      world.stats.births = Math.max(world.stats.births, goal.count);
      return;
    case 'quests':
      world.questsDone = goal.count;
      return;
    case 'happiness':
    case 'mood':
      for (const mobile of world.mobiles.values()) if ('happiness' in mobile) mobile.happiness = 100;
      return;
    case 'era':
      world.era = Math.max(world.era, goal.count);
      return;
  }
}

describe('objectifs en chapitres', () => {
  it('sont une donnée valide', () => {
    expect(validatePrototypes().filter((error) => error.startsWith('CHAPTERS'))).toEqual([]);
    expect(new Set(OBJECTIVE_IDS).size).toBe(OBJECTIVES.length);
  });

  it('commencent sur le chantier de la mairie, seule au premier chapitre', () => {
    const world = new World(7);

    expect(world.chapter).toBe(0);
    expect(currentChapter(world)?.title).toBe(CHAPTERS[0].title);
    expect(chapterObjectives(world).map(({ id }) => id)).toEqual(['townHall']);
    expect(goalProgress(world, OBJECTIVES[0]!.goals[0]!)).toEqual({ have: 0, need: 1 });
  });

  describe('ne demandent que ce qui est à portée', () => {
    it.each(CHAPTERS.map((chapter, index) => [index, chapter.title] as const))('chapitre %i — %s', (index) => {
      const reach = chapterReach(index);

      for (const objective of CHAPTERS[index]!.objectives) {
        for (const goal of objective.goals) expect(goalOutOfReach(goal, reach), `${objective.id} : ${goal.type}`).toBeNull();
      }
    });

    it('et l’ère suit les chapitres : le Bourg pour la brique, la Cité industrielle pour l’acier', () => {
      const chapterOf = (id: string): number => OBJECTIVES.find((objective) => objective.id === id)!.chapter;

      expect(chapterReach(0).era).toBe(0);
      expect(chapterReach(1).buildings.has('quarry')).toBe(true);
      expect(chapterReach(1).buildings.has('brickworks')).toBe(false);
      expect(chapterReach(chapterOf('brick')).era).toBeGreaterThanOrEqual(1);
      expect(chapterReach(chapterOf('steel')).era).toBe(3);
      expect(chapterReach(chapterOf('eveQuests')).eve).toBe(true);
      expect(chapterReach(chapterOf('nights3')).eve).toBe(false);
    });

    it('refusent un objectif dont le bâtiment arrive trop tard', () => {
      const brick = OBJECTIVES.find((objective) => objective.id === 'brick')!.goals[0]!;

      expect(goalOutOfReach(brick, chapterReach(1))).toMatch(/rien ne produit/);
      expect(goalOutOfReach({ type: 'build', building: 'steelworks', count: 1 }, chapterReach(1))).toMatch(/pas encore au menu/);
      expect(goalOutOfReach({ type: 'era', count: 3 }, chapterReach(4))).not.toBeNull();
    });
  });

  it('ouvrent les fondations après la mairie : cinq objectifs à la fois, dans l’ordre qu’on veut', () => {
    const world = World.newColony(7);
    const completed: { id: string; closing: boolean }[] = [];
    const chapters: number[] = [];

    world.events.on('objectiveCompleted', ({ id, closing }) => completed.push({ id, closing }));
    world.events.on('chapterCompleted', ({ index }) => chapters.push(index));
    world.revealAround(world.entities.get(world.townHallId)!.tx, world.entities.get(world.townHallId)!.ty, 40);
    bigBag(world);
    completeSite(world, world.townHallId);
    expect(chapters).toEqual([0]);
    expect(world.chapter).toBe(1);
    expect(openObjectives(world).map(({ id }) => id)).toEqual(['lab', 'lumberCamp', 'quarry', 'well', 'home', 'firstTower']);

    // Le labo mène ce qu'il faut : les recherches du chapitre, payées d'avance pour le test.
    for (const id of chapterReach(1).research) world.researchDone.push(id as ResearchId);

    // À rebours de la liste : la tour d'abord, la maison, le puits, la carrière, la cabane en dernier.
    raise(world, 'watchtower');
    raise(world, 'home');
    expect(world.chapter).toBe(1);
    raise(world, 'well');
    raise(world, 'quarry');
    raise(world, 'lab');
    expect(world.chapter).toBe(1);
    expect(openObjectives(world).map(({ id }) => id)).toEqual(['lumberCamp']);

    const wood = world.player.inventory.count('wood') + world.townStock()!.count('wood');

    raise(world, 'lumberCamp');
    expect(completed.slice(1)).toEqual([
      { id: 'firstTower', closing: false },
      { id: 'home', closing: false },
      { id: 'well', closing: false },
      { id: 'quarry', closing: false },
      { id: 'lab', closing: false },
      { id: 'lumberCamp', closing: true },
    ]);
    expect(chapters).toEqual([0, 1]);
    expect(world.chapter).toBe(2);
    // La récompense du chapitre tombe en plus de celle du dernier objectif.
    expect(world.player.inventory.count('wood') + world.townStock()!.count('wood') - wood).toBeGreaterThanOrEqual(
      (CHAPTERS[1].reward.items.wood ?? 0) - BUILDINGS.lumberCamp.cost.wood,
    );
    expect(openObjectives(world).map(({ id }) => id)).toEqual(['nights3', 'watchtowers', 'palisade']);
  }, 20_000);

  it('disent au labo ce que le menu n’a pas encore : un cadenas par objectif, une carte grisée par bâtiment demandé', () => {
    const world = World.newColony(7);

    bigBag(world);
    completeSite(world, world.townHallId);

    const lock = (id: string) => objectiveLock(world, id as never);

    // Cabane, carrière, puits : rien au menu, chacun nomme sa recherche. Le labo, lui, y est d'emblée.
    expect(lock('lab')).toBeNull();
    expect(lock('lumberCamp')).toEqual({ building: 'lumberCamp', research: 'woodcraft' });
    expect(lock('quarry')).toEqual({ building: 'quarry', research: 'mining' });
    expect(lock('well')).toEqual({ building: 'well', research: 'waterWell' });
    expect(lock('home')).toBeNull();
    expect(lockedObjectiveBuildings(world).map(({ building }) => building)).toEqual(['lumberCamp', 'quarry', 'well']);
    // Pas de labo, pas de chantier : rien à montrer du doigt ; son chantier, une fois posé, si.
    expect(labSpot(world)).toBeNull();

    const at = siteFor(world, 'lab');

    world.push({ type: 'placeBuilding', building: 'lab', tx: at.tx, ty: at.ty });
    world.tick();

    const site = [...world.entities.values()].find((entity) => entity.kind === 'site' && entity.proto === 'lab');

    expect(site).toBeDefined();
    expect(labSpot(world)?.id).toBe(site!.id);

    // La recherche finie, la cabane entre au menu : plus de cadenas.
    world.researchDone.push('woodcraft');
    expect(lock('lumberCamp')).toBeNull();
    expect(lockedObjectiveBuildings(world).map(({ building }) => building)).toEqual(['quarry', 'well']);
  });

  it('gardent un objectif réussi, même si son bâtiment tombe', () => {
    const world = World.newColony(7);

    bigBag(world);
    completeSite(world, world.townHallId);

    const home = raise(world, 'home');

    expect(world.objectivesDone.has('home')).toBe(true);
    world.entities.delete(home.id);
    world.tick();
    expect(world.objectivesDone.has('home')).toBe(true);
    expect(openObjectives(world).map(({ id }) => id)).not.toContain('home');
    expect(world.chapter).toBe(1);
  });

  it('comptent les nuits à tenir depuis l’ouverture du chapitre', () => {
    const world = new World(7);

    completeSite(world, world.townHallId);
    // Des nuits passées pendant les fondations ne comptent pas pour « Passer la nuit ».
    world.stats.nightsSurvived = 5;
    passChapter(world);
    expect(world.chapter).toBe(2);
    expect(world.chapterBase.nightsSurvived).toBe(5);

    const nights = OBJECTIVES.find((objective) => objective.id === 'nights3')!.goals[0]!;

    expect(goalProgress(world, nights)).toEqual({ have: 0, need: 3 });
    world.stats.nightsSurvived = 7;
    expect(goalProgress(world, nights)).toEqual({ have: 2, need: 3 });
    world.tick();
    expect(world.objectivesDone.has('nights3')).toBe(false);
    world.stats.nightsSurvived = 8;
    world.tick();
    expect(world.objectivesDone.has('nights3')).toBe(true);
  });

  it('comptent ce qui a été fait avant que le chapitre s’ouvre', () => {
    const world = new World(seedWithIron());
    const completed: string[] = [];

    world.events.on('objectiveCompleted', ({ id }) => completed.push(id));
    completeSite(world, world.townHallId);

    // Une foreuse bâtie et du fer extrait dès les fondations : « L’industrie » les trouvera.
    const iron = spot(world, 'drill', true);

    if (!iron) throw new Error('pas de filon de fer à portée');
    buildAt(world, 'drill', iron.tx, iron.ty);
    world.stats.produced.ironOre = 20;
    while (world.chapter < 5) passChapter(world);
    expect(world.chapter).toBe(5);
    expect(world.objectivesDone.has('ironOre')).toBe(true);
    expect(completed).toContain('ironOre');
  });

  it('dépose dans la mairie ce qui ne tient pas dans le sac', () => {
    const world = new World(seedWithIron());
    let stored: Partial<Record<ItemId, number>> = {};

    world.events.on('objectiveCompleted', (event) => {
      if (event.id === 'ironOre') stored = event.stored;
    });
    completeSite(world, world.townHallId);

    const iron = spot(world, 'drill', true);

    if (!iron) throw new Error('pas de filon de fer à portée');
    buildAt(world, 'drill', iron.tx, iron.ty);
    while (world.chapter < 5) passChapter(world);

    // Le sac est presque plein quand la foreuse remplit son objectif : rien de la récompense ne doit se perdre.
    const town = world.townStock()!;
    const before = { wood: town.count('wood'), stone: town.count('stone') };

    world.player.inventory = new Store(world.player.inventory.capacity);
    world.player.inventory.add('coal', world.player.inventory.freeSpace() - 5);
    world.stats.produced.ironOre = 20;
    world.tick();

    expect(world.objectivesDone.has('ironOre')).toBe(true);
    expect(world.player.inventory.freeSpace()).toBe(0);
    expect(world.player.inventory.count('wood')).toBe(5);
    expect(stored).toEqual({ wood: 9, stone: 6 });
    expect(town.count('wood') - before.wood).toBe(9);
    expect(town.count('stone') - before.stone).toBe(6);
  });

  it('s’arrêtent avec la défaite', () => {
    const world = new World(7);

    completeSite(world, world.townHallId);
    world.defeated = true;
    world.objectivesDone.add('home');
    world.tick();
    expect(world.chapter).toBe(1);
  });

  it('relisent le sac dans tous les objectifs réussis', () => {
    expect(objectiveBagBonus([], 0)).toBe(0);
    expect(objectiveBagBonus(['nights3'], 3)).toBe(20);
    expect(objectiveBagBonus(['nights3', 'firstChild', 'nights3'], 5)).toBe(40);
    // L'ordre ne compte pas : un objectif d'un chapitre à venir, réussi d'avance, donne ses places.
    expect(objectiveBagBonus(['firstChild'], 1)).toBe(20);
  });

  it('survivent à la sauvegarde : chapitre, objectifs, compteurs et taille du sac', () => {
    const world = new World(7);

    completeSite(world, world.townHallId);
    passChapter(world);
    world.stats.nightsSurvived = 3;
    world.tick();
    expect(world.chapter).toBe(2);
    expect(world.objectivesDone.has('nights3')).toBe(true);

    const decoded = decodeSave(encodeSave(world, 1));

    if (!decoded.ok) throw new Error(`sauvegarde refusée : ${decoded.reason}`);
    expect(decoded.world.chapter).toBe(2);
    expect([...decoded.world.objectivesDone]).toEqual([...world.objectivesDone]);
    expect(decoded.world.player.inventory.capacity).toBe(INVENTORY_CAPACITY + 20);
    expect(serialize(decoded.world)).toEqual(serialize(world));
  });

  it('reprennent une sauvegarde d’avant les objectifs au premier chapitre', () => {
    const world = new World(7);

    completeSite(world, world.townHallId);

    // Ce qu'une sauvegarde d'avant les objectifs ne connaissait pas.
    const old: Record<string, unknown> = { ...serialize(world) };

    for (const key of ['chapter', 'objectivesDone', 'victory', 'victoryTick', 'stats', 'chapterBase']) delete old[key];

    const decoded = decodeSave(JSON.stringify({ version: SAVE_VERSION, savedAt: 1, state: old }));

    if (!decoded.ok) throw new Error(`sauvegarde refusée : ${decoded.reason}`);
    expect(decoded.world.chapter).toBe(0);

    // La mairie est debout : le premier chapitre tombe au tick suivant, récompense comprise.
    decoded.world.tick();
    expect(decoded.world.chapter).toBe(1);
  });

  describe('une sauvegarde de l’ancienne chaîne (version 10)', () => {
    /** La partie telle que l'ancienne chaîne l'aurait rangée, à l'objectif `objective` de ses sept. */
    function legacySave(world: World, objective: number): string {
      const state: Record<string, unknown> = { ...serialize(world) };

      delete state['chapter'];
      delete state['objectivesDone'];
      delete state['chapterBase'];
      state['objective'] = objective;
      state['objectiveBase'] = { ...world.stats, produced: { ...world.stats.produced } };
      state['victory'] = objective === LEGACY_OBJECTIVES.length;
      return JSON.stringify({ version: 10, savedAt: 1, state });
    }

    function load(text: string): World {
      const decoded = decodeSave(text);

      if (!decoded.ok) throw new Error(`sauvegarde refusée : ${decoded.reason}`);
      return decoded.world;
    }

    const chapterOf = (id: string): number => OBJECTIVES.find((objective) => objective.id === id)!.chapter;

    it.each([
      [0, 0],
      [1, chapterOf('nights3')],
      [2, chapterOf('eveQuests')],
      // La foreuse attendait, l'enfant venait après : il est passé avant, dans « Nourrir la ville ».
      [3, chapterOf('firstChild')],
      [4, chapterOf('firstChild')],
      [5, chapterOf('nights5')],
      [6, chapterOf('antenna')],
      [7, CHAPTERS.length],
    ])('l’objectif %i reprend au chapitre %i, les anciens objectifs réussis cochés', (objective, chapter) => {
      const world = new World(7);

      completeSite(world, world.townHallId);

      const loaded = load(legacySave(world, objective));

      expect(loaded.chapter).toBe(chapter);
      for (const id of LEGACY_OBJECTIVES.slice(0, objective)) expect(loaded.objectivesDone.has(id), id).toBe(true);
      for (const id of LEGACY_OBJECTIVES.slice(objective)) expect(loaded.objectivesDone.has(id), id).toBe(false);
      // Les chapitres d'avant sont tenus pour finis.
      for (const proto of OBJECTIVES.filter((other) => other.chapter < chapter)) expect(loaded.objectivesDone.has(proto.id), proto.id).toBe(true);
      expect(loaded.victory).toBe(objective === LEGACY_OBJECTIVES.length);
    });

    it('garde le sac de l’ancienne chaîne, sans une place de plus ni de moins', () => {
      // Les places de l'ancienne chaîne : +20 après trois nuits, +20 au premier enfant.
      const legacyBag = [0, 0, 20, 20, 20, 40, 40, 40];

      for (let objective = 0; objective <= LEGACY_OBJECTIVES.length; objective += 1) {
        const world = new World(7);

        completeSite(world, world.townHallId);
        expect(load(legacySave(world, objective)).player.inventory.capacity, `objectif ${objective}`).toBe(INVENTORY_CAPACITY + legacyBag[objective]!);
      }
    });

    it('ne redonne aucune récompense déjà tombée, même d’un chapitre à venir', () => {
      const world = new World(seedWithIron());

      completeSite(world, world.townHallId);

      const iron = spot(world, 'drill', true);

      if (!iron) throw new Error('pas de filon de fer à portée');
      buildAt(world, 'drill', iron.tx, iron.ty);
      world.stats.produced.ironOre = 20;
      world.stats.nightsSurvived = 3;

      // Au premier enfant de l'ancienne chaîne : trois nuits, Ève et la foreuse déjà payées.
      const loaded = load(legacySave(world, 4));
      const completed: string[] = [];

      loaded.events.on('objectiveCompleted', ({ id }) => completed.push(id));
      expect(loaded.chapter).toBe(chapterOf('firstChild'));
      for (let i = 0; i < 3; i += 1) loaded.tick();
      while (loaded.chapter <= chapterOf('ironOre')) passChapter(loaded);
      expect(completed).not.toContain('ironOre');
      expect(completed).not.toContain('nights3');
      expect(completed).not.toContain('eveQuests');
      // Les seules places sont celles des trois nuits : `passChapter` coche sans payer.
      expect(loaded.player.inventory.capacity).toBe(INVENTORY_CAPACITY + 20);
    });

    it('reprend les nuits de l’objectif en cours dans le chapitre', () => {
      const world = new World(7);

      completeSite(world, world.townHallId);
      world.stats.nightsSurvived = 4;

      const state = (JSON.parse(legacySave(world, 1)) as { state: Record<string, unknown> }).state;

      state['objectiveBase'] = { nightsSurvived: 3, births: 0, produced: {} };

      const loaded = load(JSON.stringify({ version: 10, savedAt: 1, state }));
      const nights = OBJECTIVES.find((objective) => objective.id === 'nights3')!.goals[0]!;

      expect(loaded.chapterBase.nightsSurvived).toBe(3);
      expect(goalProgress(loaded, nights)).toEqual({ have: 1, need: 3 });
    });
  });

  describe('attentes', () => {
    /** La mairie bâtie, le chapitre du premier enfant ouvert et sa nurserie debout. */
    function nurseryWorld(): { world: World; nursery: Entity } {
      const world = new World(7);

      completeSite(world, world.townHallId);
      while (world.chapter < 4) passChapter(world);

      const nursery = buildAt(world, 'nursery', ...Object.values(spot(world, 'nursery')!) as [number, number]);

      guardTownHall(world);
      return { world, nursery };
    }

    it('donnent le temps restant d’une nurserie nourrie, à mi-recette', () => {
      const { world, nursery } = nurseryWorld();
      const { duration } = RECIPES.raiseChild;

      if (nursery.kind !== 'nursery') throw new Error('pas une nurserie');
      nursery.store.add('food', RECIPES.raiseChild.inputs.food);
      nursery.nextBirthTick = world.tickCount + duration;
      for (let i = 0; i < duration / 2; i += 1) world.tick();

      expect(objectiveWait(world, 'firstChild')).toMatchObject({ remainingTicks: duration / 2, durationTicks: duration, blockedBy: null, missing: 0 });
      // Sans objectif choisi : le premier du chapitre qui attend une horloge.
      expect(objectiveWait(world)?.goal.type).toBe('births');
    });

    it('disent ce qui manque à une nurserie sans nourriture', () => {
      const { world, nursery } = nurseryWorld();

      if (nursery.kind !== 'nursery') throw new Error('pas une nurserie');
      nursery.store.add('food', RECIPES.raiseChild.inputs.food - 2);

      expect(objectiveWait(world, 'firstChild')).toMatchObject({ blockedBy: 'food', missing: 2 });

      world.push({ type: 'pauseBuilding', id: nursery.id, paused: true });
      world.tick();
      expect(objectiveWait(world, 'firstChild')?.blockedBy).toBe('paused');
    });

    it('ne parlent pas d’attente tant qu’il reste une action : la nurserie à bâtir', () => {
      const world = new World(7);

      completeSite(world, world.townHallId);
      while (world.chapter < 4) passChapter(world);
      expect(objectiveWait(world, 'firstChild')).toBeNull();
      expect(objectiveWait(world, 'bread')).toBeNull();
    });

    it('comptent jusqu’à la prochaine aube pour les nuits à tenir', () => {
      const world = new World(7);

      completeSite(world, world.townHallId);
      passChapter(world);
      expect(world.chapter).toBe(2);

      const first = objectiveWait(world, 'nights3')!;

      expect(first.durationTicks).toBe(CYCLE_TICKS);
      expect(first.remainingTicks).toBe(DAY_CYCLE.day + DAY_CYCLE.dusk + DAY_CYCLE.night - (world.tickCount - world.cycleStartTick));
      world.tick();
      expect(objectiveWait(world, 'nights3')!.remainingTicks).toBe(first.remainingTicks - 1);
    });
  });

  /*
   * La partie entière, chapitre par chapitre, dans une colonie neuve : à
   * l'ouverture de chaque chapitre, le labo n'a fini que les recherches à
   * portée (`chapterReach`) et la colonie n'a que l'ère qu'elle peut
   * atteindre ; chaque bâtiment demandé doit être au menu, et se pose par la
   * commande du joueur. Le reste — nuits, productions, naissances, quêtes —
   * se joue ailleurs : ici, ses compteurs avancent d'un coup.
   */
  it('se jouent du premier toit à l’Antenne, chaque chapitre avec ce qu’il a débloqué', () => {
    const world = World.newColony(7);
    const chapters: number[] = [];
    let victories = 0;

    world.events.on('chapterCompleted', ({ index }) => chapters.push(index));
    world.events.on('victory', () => (victories += 1));
    bigBag(world);
    completeSite(world, world.townHallId);

    while (world.chapter < CHAPTERS.length) {
      const index = world.chapter;
      const reach = chapterReach(index);

      world.revealAround(world.entities.get(world.townHallId)!.tx, world.entities.get(world.townHallId)!.ty, 40);
      for (const id of reach.research) if (!world.researchDone.includes(id as ResearchId)) world.researchDone.push(id as ResearchId);
      world.era = Math.max(world.era, reach.era);
      world.tick();

      for (const objective of openObjectives(world)) {
        for (const goal of objective.goals) satisfy(world, goal);
        world.tick();
        expect(world.objectivesDone.has(objective.id) || world.chapter > index, objective.id).toBe(true);
      }
      guardTownHall(world);
      expect(world.chapter, CHAPTERS[index]!.title).toBeGreaterThan(index);
    }

    expect(chapters).toEqual(CHAPTERS.map((_, index) => index));
    expect(victories).toBe(1);
    expect(world.victory).toBe(true);
    expect(currentChapter(world)).toBeNull();
    expect(world.objectivesDone.size).toBe(OBJECTIVES.length);
    expect(world.defeated).toBe(false);
  }, 60_000);
});
