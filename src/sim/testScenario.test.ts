import { describe, expect, it } from 'vitest';
import { BUILDINGS, MENU_BUILDING_IDS } from '../data/buildings.ts';
import { TEST_SCENARIOS, type TestScenarioId } from '../data/testScenario.ts';
import { validatePrototypes } from '../data/validate.ts';
import { encodeSave } from './save.ts';
import { stageScenario } from './testScenario.ts';
import { siteMissing } from './world.ts';

const IDS = Object.keys(TEST_SCENARIOS) as TestScenarioId[];

describe('parties de test', () => {
  it('passent la validation des données', () => {
    expect(validatePrototypes()).toEqual([]);
  });

  it.each(IDS)('%s se bâtit sans erreur, et chaque fois à l’identique', (id) => {
    const a = stageScenario(TEST_SCENARIOS[id]);
    const b = stageScenario(TEST_SCENARIOS[id]);

    expect(encodeSave(a, 0)).toBe(encodeSave(b, 0));

    // Et elles le restent en jouant : même seed, mêmes commandes, même partie.
    for (let i = 0; i < 400; i += 1) {
      a.tick();
      b.tick();
    }
    expect(encodeSave(a, 0)).toBe(encodeSave(b, 0));
  });

  it.each(IDS)('%s pose chaque bâtiment du scénario, au matin — ou au soir —, sans mutant', (id) => {
    const scenario = TEST_SCENARIOS[id];
    const world = stageScenario(scenario);
    const hall = world.entities.get(world.townHallId)!;

    expect(hall.kind).toBe('townHall');
    expect(world.clock()?.phase).toBe('dusk' in scenario && scenario.dusk ? 'dusk' : 'day');
    expect([...world.mobiles.values()].some((mobile) => mobile.kind === 'mutant')).toBe(false);

    for (const { building, dx, dy } of scenario.buildings) {
      const placed = [...world.entities.values()].find((entity) => entity.tx === hall.tx + dx && entity.ty === hall.ty + dy);

      expect(placed?.proto).toBe(building);
    }
    expect(Object.fromEntries(world.townStock()!.entries())).toEqual(scenario.town);
    expect(Object.fromEntries(world.player.inventory.entries())).toEqual(scenario.bag);
  });

  it.each(IDS)('%s ouvre le menu sans badge « Nouveau » : la base est le départ', (id) => {
    const world = stageScenario(TEST_SCENARIOS[id]);

    world.tick();
    expect(MENU_BUILDING_IDS.filter((building) => world.isNewInMenu(building))).toEqual([]);
  });

  it('la petite base : six bâtiments qui emploient, et un chantier à moitié livré', () => {
    const world = stageScenario(TEST_SCENARIOS.base);
    const buildings = [...world.entities.values()].filter((entity) => entity.kind !== 'site' && entity.kind !== 'townHall');
    const sites = [...world.entities.values()].filter((entity) => entity.kind === 'site');

    expect(buildings.map((entity) => entity.proto).sort()).toEqual(['constructionPost', 'farm', 'logisticsPost', 'logisticsPost', 'lumberCamp', 'well']);
    expect(world.mobiles.size).toBeGreaterThan(0);
    expect([...world.mobiles.values()].filter((mobile) => mobile.kind === 'lumberjack')).toHaveLength(1);

    expect(sites).toHaveLength(1);

    const lab = sites[0]!;

    if (lab.kind !== 'site') throw new Error('pas un chantier');
    expect(lab.proto).toBe('lab');
    expect(lab.delivered).toEqual({ wood: 14, stone: 3 });
    expect(siteMissing(lab)).toBeGreaterThan(0);
  });

  it('la petite base tourne seule dix minutes : personne ne meurt, et l’eau de la ville remonte', () => {
    const world = stageScenario(TEST_SCENARIOS.base);
    const deaths: string[] = [];

    world.events.on('workerStarved', (event) => deaths.push(String(event.id)));
    for (let i = 0; i < 12000; i += 1) world.tick();

    expect(deaths).toEqual([]);
    // Le puits est vidé dans la mairie : l'eau monte au lieu de tomber à sec.
    expect(world.townStock()?.count('water')).toBeGreaterThan(TEST_SCENARIOS.base.town.water);
    expect(world.townStock()?.count('food')).toBeGreaterThan(0);
  });

  it('le coffre à ouvrir : trois pas à droite, Adam l’ouvre et trouve une pièce', () => {
    const world = stageScenario(TEST_SCENARIOS.chest);
    const opened: number[] = [];
    const before = world.player.wardrobe.length;

    world.events.on('chestOpened', ({ id }) => opened.push(id));
    world.push({ type: 'setMoveAxis', x: 1, y: 0 });
    for (let i = 0; i < 60 && opened.length === 0; i += 1) world.tick();

    expect(opened).toHaveLength(1);
    expect(world.player.wardrobe).toHaveLength(before + 1);
    expect(world.player.unseenPieces).toContain(world.player.wardrobe.at(-1));
  });

  it('la nurserie : les logisticiens lui portent son stock visé depuis la mairie', () => {
    const world = stageScenario(TEST_SCENARIOS.nursery);
    const nursery = [...world.entities.values()].find((entity) => entity.kind === 'nursery');

    if (nursery?.kind !== 'nursery') throw new Error('pas de nurserie');
    expect(nursery.store.isEmpty()).toBe(true);
    world.tick();
    expect(world.problem(nursery)).toBeNull();
    for (let i = 0; i < 1500; i += 1) world.tick();
    expect(nursery.store.count('food')).toBe(BUILDINGS.nursery.demand.food);
    expect(world.townStock()?.count('food')).toBe((TEST_SCENARIOS.nursery.town.food ?? 0) - BUILDINGS.nursery.demand.food);
  });

  it('les tendances : le bois monte, la pierre baisse, le charbon stagne', () => {
    const world = stageScenario(TEST_SCENARIOS.trends);

    // 45 s de jeu : les logisticiens ont rentré du bois, les bâtisseurs emporté de la pierre.
    for (let i = 0; i < 45 * 20; i += 1) world.tick();
    expect(world.flows.trend('wood')).toBe('up');
    expect(world.flows.trend('stone')).toBe('down');
    expect(world.flows.trend('coal')).toBe('flat');
  });
});
