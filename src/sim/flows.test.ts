import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import { RECIPES } from '../data/recipes.ts';
import { FLOW_SAMPLE_TICKS, FLOW_SAMPLES, MAX_ALERTS, TownFlows, TREND_KEEP, TREND_RISE } from './flows.ts';
import { Store } from './store.ts';
import { decodeSave, encodeSave, type SavedEntity } from './save.ts';
import { isWalkable, terrainAt } from './terrain.ts';
import type { EntityId } from './types.ts';
import { TICKS_PER_SECOND, World } from './world.ts';
import { SLOW } from './sweep.ts';

type Stock = Partial<Record<ItemId, number>>;

const MINUTE = 60 * TICKS_PER_SECOND;

/** Ce qu'une foreuse sort par minute : la cadence de sa recette (15 depuis l'équilibrage #65). */
const DRILL_PER_MINUTE = (MINUTE / RECIPES.mineOre.duration) * RECIPES.mineOre.outputs.ironOre;

interface Layout {
  hall: Stock;
  houses?: number;
  drills?: number;
  forges?: Stock[];
}

/** Une seed dont la mairie a une plaine sans eau au sud : les porteurs y vont en ligne droite. */
function landSeed(): { world: World; hx: number; hy: number } {
  for (let seed = 1; seed < 400; seed += 1) {
    const world = new World(seed);
    const hall = world.entities.get(world.townHallId)!;
    let dry = true;

    for (let ty = hall.ty - 1; ty < hall.ty + 12 && dry; ty += 1) {
      for (let tx = hall.tx - 8; tx < hall.tx + 8 && dry; tx += 1) {
        if (!isWalkable(terrainAt(world.seed, tx, ty))) dry = false;
      }
    }
    if (dry) return { world, hx: hall.tx, hy: hall.ty };
  }
  throw new Error('aucune seed testable — la génération de terrain a changé');
}

/** Une colonie posée d'un coup, en retouchant la sauvegarde d'un monde neuf : les maisons se peuplent au chargement. */
function colony(layout: Layout): World {
  const { world, hx, hy } = landSeed();
  const state = world.snapshot();
  const slots: [number, number][] = [
    [-6, 5],
    [-3, 5],
    [0, 5],
    [3, 5],
    [-6, 8],
    [-3, 8],
  ];
  const entities: SavedEntity[] = [
    { kind: 'townHall', id: world.townHallId, proto: 'townHall', tx: hx, ty: hy, width: 3, height: 3, store: layout.hall, hp: BUILDINGS.townHall.hp, level: 1, paused: false, staff: BUILDINGS.townHall.workers },
  ];
  let nextId = state.nextId;

  const place = (proto: BuildingId): { id: EntityId; proto: BuildingId; tx: number; ty: number; width: number; height: number } => {
    const [dx, dy] = slots.shift()!;
    const { width, height } = BUILDINGS[proto];

    return { id: nextId++, proto, tx: hx + dx, ty: hy + dy, width, height };
  };

  for (const store of layout.forges ?? []) {
    entities.push({ ...place('forge'), kind: 'forge', store, hp: BUILDINGS.forge.hp, level: 1, paused: false, staff: BUILDINGS.forge.workers, blocked: true });
  }
  for (let i = 0; i < (layout.houses ?? 0); i += 1) {
    entities.push({ ...place('builderHouse'), kind: 'house', store: {}, hp: BUILDINGS.builderHouse.hp, level: 1, paused: false, staff: BUILDINGS.builderHouse.workers });
  }
  // Une foreuse bloquée, coffre plein : le premier porteur qui la vide la relance.
  for (let i = 0; i < (layout.drills ?? 0); i += 1) {
    entities.push({ ...place('drill'), kind: 'drill', store: { ironOre: 5 }, hp: BUILDINGS.drill.hp, level: 1, paused: false, staff: BUILDINGS.drill.workers, output: 'ironOre', blocked: true });
  }

  // Adam à l'écart, immobile : il ne dépose rien en ville.
  state.player = { ...state.player, x: (hx - 20) * TILE_SIZE, y: (hy - 20) * TILE_SIZE };
  state.entities = entities;
  state.nextId = nextId;
  state.mobiles = [];
  return World.restore(state);
}

function run(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) world.tick();
}

function idOf(world: World, kind: string): EntityId {
  return [...world.entities.values()].find((entity) => entity.kind === kind)!.id;
}

describe('débit de la ville', () => {
  it('une foreuse seule, vidée par les porteurs : la ville reçoit sa cadence, à 10 % près', () => {
    const world = colony({ hall: {}, houses: 1, drills: 1 });

    // Le temps que les porteurs prennent leur rythme, puis deux minutes de mesure.
    run(world, MINUTE / 2 + 2 * MINUTE);

    const rate = world.flows.netRate('ironOre');

    expect(rate).toBeGreaterThanOrEqual(DRILL_PER_MINUTE * 0.9);
    expect(rate).toBeLessThanOrEqual(DRILL_PER_MINUTE * 1.1);
    expect(world.flows.netRate('wood')).toBe(0);
  });

  it.skipIf(!SLOW)('l’anneau ne garde que les deux dernières minutes', () => {
    const world = colony({ hall: {}, houses: 1, drills: 1 });

    run(world, 2 * MINUTE);
    // Plus de foreuse : la ville cesse de recevoir, et le débit retombe à zéro passé deux minutes.
    world.entities.delete(idOf(world, 'drill'));
    run(world, MINUTE / 2);
    expect(world.flows.netRate('ironOre')).toBeGreaterThan(0);
    run(world, FLOW_SAMPLES * FLOW_SAMPLE_TICKS);
    expect(world.flows.netRate('ironOre')).toBe(0);
  });

  it('rien sans deux échantillons ; l’anneau n’est pas sauvegardé', () => {
    const world = colony({ hall: {}, houses: 1, drills: 1 });

    run(world, MINUTE);
    expect(world.flows.netRate('ironOre')).toBeGreaterThan(0);

    const loaded = decodeSave(encodeSave(world, 1));

    if (!loaded.ok) throw new Error(`sauvegarde refusée : ${loaded.reason}`);
    expect(loaded.world.flows.netRate('ironOre')).toBe(0);
  });
});

describe('alertes de la ville', () => {
  it('une forge sans charbon, du minerai en ville : alerte charbon, vers la forge', () => {
    const world = colony({ hall: { ironOre: 40 }, forges: [{}] });

    run(world, 2);

    const alerts = world.flows.alerts(world);

    expect(alerts[0]).toEqual({
      kind: 'shortage',
      item: 'coal',
      target: idOf(world, 'forge'),
      waiting: 'forge',
      stock: 0,
    });
    // Le minerai, lui, est en ville : la forge ne l'attend pas.
    expect(alerts.some((alert) => alert.item === 'ironOre')).toBe(false);
  });

  it('du charbon en ville : plus d’alerte', () => {
    const world = colony({ hall: { ironOre: 40, coal: 10 }, forges: [{}] });

    run(world, 2);
    expect(world.flows.alerts(world)).toEqual([]);
  });

  it('une forge à l’arrêt n’utilise pas le minerai : au-delà de 100, c’est un surplus, vers la foreuse', () => {
    const world = colony({ hall: { ironOre: 311, food: 199 }, houses: 1, drills: 1, forges: [{}] });

    run(world, MINUTE);

    const alerts = world.flows.alerts(world);

    expect(alerts).toHaveLength(MAX_ALERTS);
    expect(alerts[0]!.item).toBe('coal');
    expect(alerts[1]!.kind).toBe('surplus');
    expect(alerts[1]!.item).toBe('ironOre');
    expect(alerts[1]!.target).toBe(idOf(world, 'drill'));
    expect(alerts[1]!.stock).toBeGreaterThan(300);
    expect((alerts[1] as { rate: number }).rate).toBeGreaterThan(0);
  });

  it('une forge en pause n’attend rien', () => {
    const world = colony({ hall: { ironOre: 40 }, forges: [{}] });

    world.push({ type: 'pauseBuilding', id: idOf(world, 'forge'), paused: true });
    run(world, 2);
    expect(world.flows.alerts(world)).toEqual([]);
  });
});

describe('tendance de la ville', () => {
  /** Fait tourner l'anneau `seconds` secondes de jeu, en appliquant `step` au stock à chaque tick. */
  function run(flows: TownFlows, town: Store, from: number, seconds: number, step: (tick: number) => void = () => {}): number {
    let tick = from;

    for (const end = from + seconds * TICKS_PER_SECOND; tick < end; tick += 1) {
      step(tick);
      flows.observe(tick, town);
    }
    return tick;
  }

  /** Un objet par seconde de jeu entre (ou sort, si `rate` est négatif). */
  function perSecond(town: Store, item: ItemId, rate: number): (tick: number) => void {
    return (tick) => {
      if (tick % TICKS_PER_SECOND !== 0) return;
      if (rate > 0) town.add(item, rate);
      else town.remove(item, -rate);
    };
  }

  it('monte, stagne, baisse : sur la dernière minute, pas d’un tick à l’autre', () => {
    const flows = new TownFlows();
    const town = new Store(Infinity);

    town.add('stone', 50);
    town.add('food', 200);
    town.add('water', 40);
    run(flows, town, 0, 60, (tick) => {
      perSecond(town, 'stone', 1)(tick);
      perSecond(town, 'food', -1)(tick);
    });

    expect(flows.trend('stone')).toBe('up');
    expect(flows.trend('food')).toBe('down');
    expect(flows.trend('water')).toBe('flat');
  });

  it('sous le seuil, il stagne : une unité par minute ne fait pas de flèche', () => {
    const flows = new TownFlows();
    const town = new Store(Infinity);

    town.add('wood', 10);
    run(flows, town, 0, 120, (tick) => {
      if (tick % MINUTE === 1) town.add('wood', TREND_KEEP);
    });

    expect(TREND_KEEP).toBeLessThan(TREND_RISE);
    expect(flows.trend('wood')).toBe('flat');
  });

  it('la flèche ne clignote pas : paru au-dessus du seuil, elle tient tant que le débit reste au-dessus de la moitié', () => {
    const flows = new TownFlows();
    const town = new Store(Infinity);
    const seen = new Set<string>();

    // Un porteur dépose 3 bois toutes les 90 s : le débit de la minute oscille entre 0 et 3, le stock monte toujours.
    let tick = run(flows, town, 0, 60, (now) => {
      if (now % (90 * TICKS_PER_SECOND) === 10) town.add('wood', 3);
    });

    expect(flows.trend('wood')).toBe('up');
    tick = run(flows, town, tick, 300, (now) => {
      if (now % (90 * TICKS_PER_SECOND) === 10) town.add('wood', 3);
      if (now % FLOW_SAMPLE_TICKS === 0) seen.add(flows.trend('wood'));
    });
    expect(seen).not.toContain('down');

    // Puis le flux s'arrête : la flèche tombe une fois la minute passée, sans repasser par « baisse ».
    run(flows, town, tick, 70);
    expect(flows.trend('wood')).toBe('flat');
  });

  it('une fenêtre glissante : ce qui est sorti il y a plus d’une minute ne fait plus baisser', () => {
    const flows = new TownFlows();
    const town = new Store(Infinity);

    town.add('food', 100);
    let tick = run(flows, town, 0, 30, perSecond(town, 'food', -1));

    expect(flows.trend('food')).toBe('down');
    tick = run(flows, town, tick, 40);
    expect(flows.trend('food')).toBe('down');
    run(flows, town, tick, 30);
    expect(flows.trend('food')).toBe('flat');
  });

  it('temps de jeu : en pause, rien ne tourne et rien ne change ; à la reprise, la fenêtre reprend où elle était', () => {
    const flows = new TownFlows();
    const town = new Store(Infinity);

    town.add('stone', 20);
    let tick = run(flows, town, 0, 60, perSecond(town, 'stone', 1));
    const before = flows.stats('stone');

    // La pause : la simulation ne tick plus, le temps réel passe sans rien compter.
    expect(flows.stats('stone')).toEqual(before);
    expect(flows.trend('stone')).toBe('up');

    // La reprise, sans plus rien gagner : la minute doit s'écouler en temps de jeu pour que la flèche tombe.
    tick = run(flows, town, tick, 30);
    expect(flows.trend('stone')).toBe('up');
    run(flows, town, tick, 35);
    expect(flows.trend('stone')).toBe('flat');
  });

  it('production, consommation et net par minute ; temps avant épuisement s’il baisse', () => {
    const flows = new TownFlows();
    const town = new Store(Infinity);

    town.add('food', 400);
    // +2 par seconde à la récolte, −3 par seconde aux repas : net −60 par minute.
    run(flows, town, 0, 125, (tick) => {
      perSecond(town, 'food', 2)(tick);
      perSecond(town, 'food', -3)(tick - TICKS_PER_SECOND / 2);
    });

    const food = flows.stats('food');

    expect(food.produced).toBeCloseTo(120, 0);
    expect(food.consumed).toBeCloseTo(180, 0);
    expect(food.net).toBeCloseTo(-60, 0);
    expect(food.net).toBeCloseTo(flows.netRate('food'), 6);
    expect(food.minutesLeft).toBeCloseTo(food.stock / 60, 6);
    expect(food.history).toHaveLength(FLOW_SAMPLES);
    expect(food.history.at(-1)).toBe(food.stock);
    expect(flows.stats('stone').minutesLeft).toBeNull();
    expect(flows.tracked()).toEqual(['food']);
  });

  it('sans ville, tout se vide', () => {
    const flows = new TownFlows();
    const town = new Store(Infinity);

    run(flows, town, 0, 60, perSecond(town, 'wood', 1));
    expect(flows.trend('wood')).toBe('up');
    flows.observe(60 * TICKS_PER_SECOND, null);
    expect(flows.trend('wood')).toBe('flat');
    expect(flows.tracked()).toEqual([]);
  });
});
