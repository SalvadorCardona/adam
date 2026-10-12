import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { nightBosses } from '../data/enemies.ts';
import { ERAS, LAST_ERA, type EraProto } from '../data/eras.ts';
import type { ItemId } from '../data/items.ts';
import { RECIPES, recipeOf } from '../data/recipes.ts';
import { RESEARCH } from '../data/research.ts';
import { REGION_RINGS } from '../data/regions.ts';
import { SPRITES } from '../data/sprites.ts';
import { validatePrototypes } from '../data/validate.ts';
import { checkMet, eraChecks, eraNewBuildings, eraReady, eraResearch, withEraThreat } from './eras.ts';
import { decodeSave, encodeSave, serialize, deserialize } from './save.ts';
import { World } from './world.ts';

function fill(world: World, amounts: Partial<Record<ItemId, number>>): void {
  for (const [item, amount] of Object.entries(amounts) as [ItemId, number][]) world.player.inventory.add(item, amount);
}

function spot(world: World, building: BuildingId): { tx: number; ty: number } {
  const px = Math.floor(world.player.x / TILE_SIZE);
  const py = Math.floor(world.player.y / TILE_SIZE);

  for (let r = 2; r <= 8; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (world.canPlace(building, px + dx, py + dy) === null) return { tx: px + dx, ty: py + dy };
      }
    }
  }
  throw new Error(`aucune place pour ${building}`);
}

/** Pose un chantier près d'Adam et le livre d'un « Transférer » : le dernier objet l'achève. */
function build(world: World, building: BuildingId): number {
  const { tx, ty } = spot(world, building);
  let id = -1;
  const off = world.events.on('buildingPlaced', (event) => (id = event.id));

  world.push({ type: 'placeBuilding', building, tx, ty });
  world.tick();
  off();
  fill(world, BUILDINGS[building].cost);
  world.push({ type: 'transferToSite', id });
  world.tick();
  expect(world.entities.get(id)?.kind).not.toBe('site');
  return id;
}

/** Une colonie neuve, mairie debout. */
function colony(): World {
  const world = World.newColony(7);

  fill(world, BUILDINGS.townHall.cost);
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();
  return world;
}

/** Tout ce que demande le Bourg : objectifs, habitants, bâtiments, et de quoi investir dans le sac. */
function readyForBorough(world: World): void {
  const requires = ERAS[1].requires;

  world.objective = requires.objectives;
  for (const [building, count] of Object.entries(requires.buildings) as [BuildingId, number][]) {
    for (let i = 0; i < count; i += 1) build(world, building);
  }

  const { adults, children, workers } = world.population();

  world.colonists += Math.max(0, requires.population - (adults + children + workers));
  // Le sac ne tient pas tout l'investissement : le reste attend en ville.
  for (const [item, amount] of Object.entries(requires.invest) as [ItemId, number][]) {
    const bag = Math.min(amount, 20);

    world.player.inventory.add(item, bag);
    world.townStock()!.add(item, amount - bag);
  }
}

describe('ères — données', () => {
  it('quatre paliers, validés, du Campement à la Cité industrielle', () => {
    expect(validatePrototypes()).toEqual([]);
    expect(ERAS).toHaveLength(4);
    expect(ERAS[0].requires).toBeNull();
    expect(ERAS.map((era) => era.label)).toEqual(['Campement', 'Bourg', 'Ville', 'Cité industrielle']);
  });

  it('chaque ère après la première apporte une ressource, une chaîne, un bâtiment, un onglet, une menace et un visage de mairie', () => {
    for (let era = 1; era <= LAST_ERA; era += 1) {
      const proto: EraProto = ERAS[era]!;
      const buildings = eraNewBuildings(era);

      expect(proto.resource, `ère ${era}`).not.toBeNull();
      expect(eraResearch(era).length, `ère ${era}`).toBeGreaterThanOrEqual(2);
      expect(buildings.length, `ère ${era}`).toBeGreaterThanOrEqual(1);
      // Sa ressource sort de la recette d'un de ses nouveaux bâtiments.
      expect(buildings.some((id) => recipeOf(id)?.outputs[proto.resource!] !== undefined), `ère ${era}`).toBe(true);
      expect(Object.keys(proto.threat).length, `ère ${era}`).toBeGreaterThan(0);
      expect(`era${era}` in SPRITES.townHall.parts, `ère ${era}`).toBe(true);
    }
  });

  it('la menace d’une ère s’ajoute aux chefs de la nuit', () => {
    expect(withEraThreat(nightBosses(1), 0)).toEqual(nightBosses(1));
    expect(withEraThreat({ brute: 1 }, 3)).toEqual({ brute: 3, mutant: 4 });
  });

  it('les durées vont croissant : chaque ère attend plus d’objectifs et d’habitants que la précédente', () => {
    for (let era = 2; era <= LAST_ERA; era += 1) {
      expect(ERAS[era]!.requires!.objectives).toBeGreaterThan(ERAS[era - 1]!.requires!.objectives);
      expect(ERAS[era]!.requires!.population).toBeGreaterThan(ERAS[era - 1]!.requires!.population);
    }
  });
});

describe('ères — menace', () => {
  it('chaque ère grossit la vague de la nuit de sa menace, sortie de la base la plus proche', () => {
    const world = colony();

    expect(world.leadBase()).not.toBeNull();

    const before = world.raidSize(1).count;

    world.era = 2;
    expect(world.raidSize(1).count).toBe(before + ERAS[2].threat.brute);
    world.era = 3;
    expect(world.raidSize(1).count).toBe(before + ERAS[3].threat.brute + ERAS[3].threat.mutant);
  });
});

describe('ères — passage', () => {
  it('une colonie neuve est au Campement : le Bourg et son onglet restent fermés', () => {
    const world = colony();

    expect(world.era).toBe(0);
    expect(world.inMenu('watchtower')).toBe(false);
    expect(world.researchOpen('brickmaking')).toBe(false);
    expect(eraReady(world)).toBe(false);
  });

  it('refuse le passage tant qu’une condition manque, sans rien prendre', () => {
    const world = colony();
    const reasons: string[] = [];

    world.events.on('eraRejected', ({ reason }) => reasons.push(reason));
    fill(world, ERAS[1].requires.invest);
    world.push({ type: 'advanceEra' });
    world.tick();

    expect(reasons).toEqual(['notReady']);
    expect(world.era).toBe(0);
    expect(world.player.inventory.count('wood')).toBe(ERAS[1].requires.invest.wood);
  });

  it('toutes les conditions réunies : le Bourg ouvre ses bâtiments et son onglet, l’investissement est payé', () => {
    const world = colony();
    const reached: { era: number; opened: BuildingId[] }[] = [];

    world.events.on('eraReached', ({ era, opened }) => reached.push({ era, opened }));
    readyForBorough(world);
    expect(eraChecks(world, 1).every(checkMet)).toBe(true);
    expect(eraReady(world)).toBe(true);

    const town = world.townStock()!;
    const wood = town.count('wood');

    world.push({ type: 'advanceEra' });
    world.tick();

    expect(world.era).toBe(1);
    expect(reached).toEqual([{ era: 1, opened: [...ERAS[1].opens] }]);
    for (const id of ERAS[1].opens) expect(world.inMenu(id), id).toBe(true);
    expect(world.researchOpen('brickmaking')).toBe(true);
    // Le sac a investi d'abord, la ville le reste.
    expect(world.player.inventory.count('wood')).toBe(0);
    expect(world.player.inventory.count('stone')).toBe(0);
    expect(town.count('wood')).toBe(wood - (ERAS[1].requires.invest.wood - 20));
    // La briqueterie attend sa recherche, la Cuisson des briques, à l'onglet du Bourg.
    expect(world.inMenu('brickworks')).toBe(false);
    world.researchDone.push('brickmaking');
    expect(world.inMenu('brickworks')).toBe(true);
  });

  it('une ère au-delà de la sienne n’ouvre pas les recherches de l’onglet suivant', () => {
    const world = colony();
    const reasons: string[] = [];

    world.openBuildings.add('lab');
    build(world, 'lab');
    world.events.on('researchRejected', ({ reason }) => reasons.push(reason));
    const lab = [...world.entities.values()].find((entity) => entity.kind === 'lab')!;

    world.push({ type: 'startResearch', lab: lab.id, research: 'toolmaking' });
    world.tick();
    expect(reasons).toEqual(['locked']);
    expect(RESEARCH.toolmaking.era).toBe(2);
  });

  it('la nouvelle chaîne du Bourg tourne : la briqueterie cuit pierre et bois en briques', () => {
    const recipe = RECIPES.fireBrick;

    expect(recipe.building).toBe('brickworks');
    expect(recipe.outputs).toEqual({ brick: 1 });
    expect(BUILDINGS.brickworks.kind).toBe('forge');
  });
});

describe('ères — de bout en bout', () => {
  it('du Campement à la Cité industrielle : chaque ère se franchit, et chacune ouvre du nouveau', () => {
    const world = colony();

    for (let next = 1; next <= LAST_ERA; next += 1) {
      const requires = ERAS[next]!.requires!;

      world.objective = Math.max(world.objective, requires.objectives);
      // Les recherches clés, finies au labo de l'ère d'avant.
      for (const research of requires.research) if (!world.researchDone.includes(research)) world.researchDone.push(research);
      for (const [building, count] of Object.entries(requires.buildings) as [BuildingId, number][]) {
        // Un bâtiment demandé qui vient d'un labo : sa recherche est d'une ère d'avant.
        for (let era = 0; era < next; era += 1) {
          for (const research of eraResearch(era)) {
            const { unlocks, opens } = RESEARCH[research] as { unlocks: readonly BuildingId[]; opens: readonly BuildingId[] };

            if ((unlocks.includes(building) || opens.includes(building)) && !world.researchDone.includes(research)) world.researchDone.push(research);
          }
        }
        expect(world.inMenu(building), `${building}, avant l'ère ${next}`).toBe(true);

        const have = [...world.entities.values()].filter((entity) => entity.kind !== 'site' && entity.proto === building).length;

        for (let i = have; i < count; i += 1) build(world, building);
      }

      const { adults, children, workers } = world.population();

      world.colonists += Math.max(0, requires.population - (adults + children + workers));
      for (const [item, amount] of Object.entries(requires.invest) as [ItemId, number][]) world.townStock()!.add(item, amount);

      const menu = new Set(Object.keys(BUILDINGS).filter((id) => world.inMenu(id as BuildingId)));

      world.push({ type: 'advanceEra' });
      world.tick();
      expect(world.era).toBe(next);
      // Ce qu'elle ouvre d'emblée, ou ce que son onglet débloque, n'était pas au menu avant.
      for (const id of [...ERAS[next]!.opens, ...eraNewBuildings(next)]) expect(menu.has(id), id).toBe(false);
      for (const id of eraResearch(next)) expect(world.researchOpen(id), id).toBe(true);
      // Et les régions de son anneau : leurs gardiens se montrent.
      for (const region of world.regions) {
        if (REGION_RINGS[region.ring]?.era === next) expect(world.regionState(region.id), `région ${region.id}`).toBe('open');
      }
    }

    // La dernière : plus d'ère après elle.
    const reasons: string[] = [];

    world.events.on('eraRejected', ({ reason }) => reasons.push(reason));
    world.push({ type: 'advanceEra' });
    world.tick();
    expect(reasons).toEqual(['lastEra']);
  });
});

describe('ères — sauvegarde', () => {
  it('garde l’ère atteinte et les régions qu’elle a ouvertes', () => {
    const world = colony();

    readyForBorough(world);
    world.push({ type: 'advanceEra' });
    world.tick();

    const decoded = decodeSave(encodeSave(world, 0));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.world.era).toBe(1);
    expect(decoded.world.researchOpen('brickmaking')).toBe(true);

    const second = decoded.world.regions.find((region) => REGION_RINGS[region.ring]?.era === 1)!;

    expect(decoded.world.regionState(second.id)).toBe('open');
  });

  it('une sauvegarde d’avant les ères démarre au Campement', () => {
    const world = colony();
    const state = serialize(world) as unknown as Record<string, unknown>;

    delete state['era'];

    const restored = deserialize(state);

    expect(restored.era).toBe(0);
  });
});
