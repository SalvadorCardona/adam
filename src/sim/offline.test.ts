import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import { NEEDS } from '../data/needs.ts';
import { OFFLINE } from '../data/offline.ts';
import { RECIPES } from '../data/recipes.ts';
import { RESEARCH } from '../data/research.ts';
import { TEST_SCENARIOS } from '../data/testScenario.ts';
import { awayMs, countedMs, feedNeed } from './offline.ts';
import type { OfflineReport } from './offline.ts';
import { decodeSave, encodeSave } from './save.ts';
import { stageScenario } from './testScenario.ts';
import type { Lab, Nursery } from './types.ts';
import { STEP_MS, World } from './world.ts';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Pousse `catchUp` et rend le récap, ou `null` si rien n'a été rattrapé. */
function catchUp(world: World, away: number): OfflineReport | null {
  let report: OfflineReport | null = null;
  const off = world.events.on('offlineCaughtUp', (event) => (report = event));

  world.push({ type: 'catchUp', awayMs: away });
  world.tick();
  off();
  return report;
}

function stock(world: World): Partial<Record<ItemId, number>> {
  return { ...world.townStock()!.toJSON() };
}

function fill(world: World, amounts: Partial<Record<ItemId, number>>): void {
  for (const [item, amount] of Object.entries(amounts) as [ItemId, number][]) world.player.inventory.add(item, amount);
}

function build(world: World, building: BuildingId): number {
  const px = Math.floor(world.player.x / TILE_SIZE);
  const py = Math.floor(world.player.y / TILE_SIZE);

  for (let r = 2; r <= 8; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (world.canPlace(building, px + dx, py + dy) !== null) continue;

        let id = -1;
        const off = world.events.on('buildingPlaced', (event) => (id = event.id));

        world.push({ type: 'placeBuilding', building, tx: px + dx, ty: py + dy });
        world.tick();
        off();
        fill(world, BUILDINGS[building].cost);
        world.push({ type: 'transferToSite', id });
        world.tick();
        return id;
      }
    }
  }
  throw new Error(`aucune place pour ${building}`);
}

/** Une colonie neuve, sa mairie bâtie. */
function colony(): World {
  const world = new World(7);

  fill(world, BUILDINGS.townHall.cost);
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();
  return world;
}

describe('hors ligne — l’absence mesurée', () => {
  it('une horloge reculée, une date illisible ou absente ne rapportent rien', () => {
    expect(awayMs(10_000, 5_000)).toBe(0);
    expect(awayMs(Number.NaN, 5_000)).toBe(0);
    expect(awayMs(0, 5_000)).toBe(0);
    expect(awayMs(1_000, Number.POSITIVE_INFINITY)).toBe(0);
    expect(awayMs(1_000, 1_000 + HOUR)).toBe(HOUR);
  });

  it('rien sous le seuil, jamais plus que le plafond', () => {
    expect(countedMs(OFFLINE.minMs - 1, OFFLINE.maxMs)).toBe(0);
    expect(countedMs(HOUR, OFFLINE.maxMs)).toBe(HOUR);
    expect(countedMs(30 * 24 * HOUR, OFFLINE.maxMs)).toBe(OFFLINE.maxMs);
    expect(countedMs(Number.NaN, OFFLINE.maxMs)).toBe(0);
  });

  it('une jauge mange à son seuil, et s’arrête affamée sans rien à manger', () => {
    const { seekBelow, workTicks } = NEEDS.hunger;
    let food = 3;
    const fed = feedNeed('hunger', 1, workTicks * 2, true, () => food-- > 0);

    expect(fed.meals).toBe(3);
    expect(fed.starved).toBe(false);
    expect(fed.level).toBeCloseTo(1 - 2 + 3 * (1 - seekBelow));

    const starved = feedNeed('hunger', 1, workTicks * 2, true, () => false);

    expect(starved).toEqual({ level: OFFLINE.starvedGauge, meals: 0, starved: true });
  });
});

describe('hors ligne — la ville rattrape', () => {
  it('une heure : les stocks bougent de façon crédible, le récap suit, l’horloge du jour ne bouge pas', () => {
    const world = stageScenario(TEST_SCENARIOS.base);

    // Des logisticiens pour la tournée des coffres, pris aux bâtisseurs.
    const yard = [...world.entities.values()].find((entity) => entity.proto === 'constructionPost')!;

    world.push({ type: 'setWorkers', id: yard.id, count: 0 });
    build(world, 'logisticsPost');
    for (let i = 0; i < 40; i += 1) world.tick();
    expect([...world.mobiles.values()].some((mobile) => mobile.kind === 'worker' && mobile.logistician)).toBe(true);

    const before = stock(world);
    const tick = world.tickCount;
    const clock = world.clock();
    const report = catchUp(world, HOUR);

    expect(report).not.toBeNull();
    expect(report!.ticks).toBe(Math.floor(HOUR / STEP_MS));
    expect(report!.capped).toBe(false);
    // Le puits, la cabane et la ferme (six cases de champ seulement) ont produit ; les habitants ont bu et mangé.
    expect(report!.gained.water ?? 0).toBeGreaterThan(100);
    expect(report!.gained.wood ?? 0).toBeGreaterThan(0);
    expect(report!.gained.food ?? 0).toBeGreaterThan(0);
    expect(report!.spent.water ?? 0).toBeGreaterThan(0);
    expect(report!.spent.food ?? 0).toBeGreaterThan(0);
    expect(report!.alerts).not.toContain('storeFull');

    const after = stock(world);

    for (const item of ['water', 'food'] as const) {
      expect(after[item] ?? 0).toBe((before[item] ?? 0) + (report!.gained[item] ?? 0) - (report!.spent[item] ?? 0));
    }
    // Un tick de jeu, pas une heure : ni nuit ni vague.
    expect(world.tickCount).toBe(tick + 1);
    expect(world.clock()?.cycle).toBe(clock?.cycle);
    expect(world.clock()?.phase).toBe(clock?.phase);
    expect([...world.mobiles.values()].some((mobile) => mobile.kind === 'mutant')).toBe(false);
  });

  it('sans porteur ni logisticien, chaque producteur remplit son coffre, et pas plus', () => {
    const world = stageScenario(TEST_SCENARIOS.base);
    const report = catchUp(world, HOUR);

    expect(report!.alerts).toContain('storeFull');
    for (const entity of world.entities.values()) {
      if (entity.kind !== 'site') expect(entity.store.total()).toBeLessThanOrEqual(entity.store.capacity);
    }
    const well = [...world.entities.values()].find((entity) => entity.proto === 'well');

    expect(well?.kind).toBe('quarry');
    if (well?.kind === 'quarry') expect(well.store.count('water')).toBe(well.store.capacity);
  });

  it('au-delà du plafond, rien n’est gagné en plus', () => {
    const atCap = stageScenario(TEST_SCENARIOS.base);
    const beyond = stageScenario(TEST_SCENARIOS.base);
    const capped = catchUp(atCap, OFFLINE.maxMs);
    const far = catchUp(beyond, 3 * OFFLINE.maxMs);

    expect(far!.capped).toBe(true);
    expect(capped!.capped).toBe(false);
    expect(far!.ticks).toBe(capped!.ticks);
    expect(far!.gained).toEqual(capped!.gained);
    expect(encodeSave(beyond, 0)).toBe(encodeSave(atCap, 0));
  });

  it('une absence négative, illisible ou trop courte ne change rien et n’ouvre pas de récap', () => {
    for (const away of [-HOUR, Number.NaN, Number.POSITIVE_INFINITY, OFFLINE.minMs - 1]) {
      const world = stageScenario(TEST_SCENARIOS.base);
      const twin = stageScenario(TEST_SCENARIOS.base);

      expect(catchUp(world, away)).toBeNull();
      twin.tick();
      expect(encodeSave(world, 0)).toBe(encodeSave(twin, 0));
    }
  });

  it('sans mairie bâtie, rien ne se rattrape', () => {
    expect(catchUp(new World(7), HOUR)).toBeNull();
  });

  it('sans vivres, personne ne meurt : les ouvriers attendent affamés, et le récap le dit', () => {
    const world = stageScenario(TEST_SCENARIOS.base);
    const town = world.townStock()!;

    // Ni nourriture ni eau en ville, et plus de producteur qui en rende.
    town.remove('food', town.count('food'));
    town.remove('water', town.count('water'));
    for (const entity of world.entities.values()) {
      if (entity.kind === 'farm' || entity.kind === 'quarry') entity.paused = true;
    }

    const colonists = world.colonists;
    const people = world.mobiles.size;
    const report = catchUp(world, 4 * HOUR);

    expect(report!.alerts).toContain('hunger');
    expect(report!.alerts).toContain('thirst');
    expect(world.colonists).toBe(colonists);
    expect(world.mobiles.size).toBe(people);
    for (const person of world.wantingInhabitants()) {
      expect(person.needs.hunger).toBeCloseTo(OFFLINE.starvedGauge, 2);
      expect(person.needs.thirst).toBeCloseTo(OFFLINE.starvedGauge, 2);
    }
    expect(world.wantingInhabitants().length).toBeGreaterThan(0);

    // La jauge reprend en jeu : rien ne meurt avant d'être retombé à zéro.
    let starved = 0;
    const off = world.events.on('workerStarved', () => (starved += 1));

    for (let i = 0; i < 20 * 30; i += 1) world.tick();
    off();
    expect(starved).toBe(0);
  });

  it('la nurserie : un enfant toutes les trois minutes, nourri par la ville, et pas un de plus au retour', () => {
    const world = colony();
    const nursery = world.entities.get(build(world, 'nursery')) as Nursery;

    build(world, 'logisticsPost');
    world.townStock()!.add('food', 200);
    world.townStock()!.add('water', 200);

    const duration = RECIPES.raiseChild.duration;
    const left = nursery.nextBirthTick - world.tickCount;
    // Deux naissances et demie de temps : deux enfants.
    const away = (left + duration * 1.5) * STEP_MS;
    const report = catchUp(world, away);

    expect(report!.births).toBe(2);
    expect(nursery.born).toBe(2);
    expect(report!.spent.food ?? 0).toBeGreaterThanOrEqual(2 * RECIPES.raiseChild.inputs.food);

    // Le compte à rebours reprend à mi-chemin : la troisième naît une demi-durée plus tard, pas avant.
    const timer = world.productionTimer(nursery)!;

    expect(Math.abs(timer.left - duration / 2)).toBeLessThan(20 * 60 + 2);
    for (let i = 0; i < timer.left - 2; i += 1) world.tick();
    expect(nursery.born).toBe(2);
    for (let i = 0; i < 4; i += 1) world.tick();
    expect(nursery.born).toBe(3);
    // L'ancien réveil, d'avant le rattrapage, ne fait pas naître un enfant de trop.
    for (let i = 0; i < duration - 40; i += 1) world.tick();
    expect(nursery.born).toBe(3);
  });

  it('le labo : la recherche finit hors ligne, la suivante de la file est payée par la ville et tourne', () => {
    const world = colony();
    const lab = world.entities.get(build(world, 'lab')) as Lab;

    build(world, 'logisticsPost');
    for (const [item, amount] of Object.entries(RESEARCH.walkingBoots.cost) as [ItemId, number][]) lab.store.add(item, amount);
    for (const [item, amount] of Object.entries(RESEARCH.bigBag.cost) as [ItemId, number][]) world.townStock()!.add(item, amount);
    world.push({ type: 'startResearch', lab: lab.id, research: 'walkingBoots' });
    world.tick();
    world.push({ type: 'startResearch', lab: lab.id, research: 'bigBag' });
    world.tick();
    expect(lab.endTick).toBeGreaterThan(0);

    const report = catchUp(world, RESEARCH.walkingBoots.duration * STEP_MS + 10 * MINUTE);

    expect(report!.research).toContain('walkingBoots');
    expect(world.researchDone).toContain('walkingBoots');
    // La suivante a reçu son coût de la ville ; elle a fini aussi, ou elle tourne.
    expect(world.researchDone.includes('bigBag') || lab.research === 'bigBag').toBe(true);
  });

  it('une sauvegarde relue rattrape son absence comme la partie d’origine', () => {
    const world = stageScenario(TEST_SCENARIOS.base);
    const decoded = decodeSave(encodeSave(world, 1_000));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const report = catchUp(decoded.world, awayMs(decoded.savedAt, 1_000 + HOUR));

    expect(report!.ticks).toBe(Math.floor(HOUR / STEP_MS));
  });
});
