import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { BUILDINGS, MENU_BUILDING_IDS, START_BUILDINGS, type BuildingId } from '../data/buildings.ts';
import { ENEMIES, WILDLIFE } from '../data/enemies.ts';
import { ERAS } from '../data/eras.ts';
import type { ItemId } from '../data/items.ts';
import { COLONY } from '../data/inhabitants.ts';
import { PRODUCTION } from '../data/production.ts';
import { RESEARCH, RESEARCH_IDS, RESEARCH_THEMES, type ResearchId, type ResearchTheme } from '../data/research.ts';
import { validatePrototypes } from '../data/validate.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { ResearchRejection } from './commands.ts';
import { INVENTORY_CAPACITY } from './player.ts';
import { fullNeeds, drainNeeds } from './needs.ts';
import { STAT_BASE, researchBonus, researchCost, researchStatus, unlockingResearch } from './research.ts';
import { SAVE_VERSION, decodeSave, encodeSave, type SavedEntity } from './save.ts';
import { isWalkable, terrainAt } from './terrain.ts';
import type { Arrow, Lab, Mutant } from './types.ts';
import { World } from './world.ts';

/** Les objets que seuls les ennemis lâchent. */
const LOOT_ONLY: readonly ItemId[] = ['mutantGoo', 'wolfFang', 'crabClaw'];

function fill(world: World, amounts: Partial<Record<ItemId, number>>): void {
  for (const [item, amount] of Object.entries(amounts) as [ItemId, number][]) world.player.inventory.add(item, amount);
}

/** Une case où poser `building` d'ici, ou une erreur. */
function spot(world: World, building: BuildingId): { tx: number; ty: number } {
  const px = Math.floor(world.player.x / TILE_SIZE);
  const py = Math.floor(world.player.y / TILE_SIZE);

  for (let r = 2; r <= 6; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (world.canPlace(building, px + dx, py + dy) === null) return { tx: px + dx, ty: py + dy };
      }
    }
  }
  throw new Error(`aucune place pour ${building}`);
}

/** Pose un bâtiment et le livre d'un coup depuis le sac. */
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
  return id;
}

/** Une seed dont la clairière est toute sèche autour de la mairie : les porteurs y passent en ligne droite. */
function drySeed(): number {
  for (let seed = 1; seed < 400; seed += 1) {
    const world = new World(seed);
    const hall = world.entities.get(world.townHallId)!;
    let dry = true;

    for (let ty = hall.ty - 8; ty < hall.ty + 12 && dry; ty += 1) {
      for (let tx = hall.tx - 10; tx < hall.tx + 12 && dry; tx += 1) {
        if (!isWalkable(terrainAt(world.seed, tx, ty))) dry = false;
      }
    }
    if (dry) return seed;
  }
  throw new Error('aucune seed sèche');
}

/** Un monde dont la mairie est bâtie, et un labo fini à côté d'Adam. */
function withLab(seed = drySeed(), colony = (at: number) => new World(at)): { world: World; lab: Lab } {
  const world = colony(seed);

  fill(world, BUILDINGS.townHall.cost);
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();

  const id = build(world, 'lab');
  const lab = world.entities.get(id);

  if (lab?.kind !== 'lab') throw new Error('le labo ne s’est pas achevé');
  return { world, lab };
}

/** Pose Adam contre le labo et renvoie l'axe qui le pousse dedans. */
function touch(world: World, lab: Lab): { x: number; y: number } {
  for (let x = lab.tx; x < lab.tx + lab.width; x += 1) {
    if (world.isSolid(x, lab.ty + lab.height)) continue;
    world.player.x = (x + 0.5) * TILE_SIZE;
    world.player.y = (lab.ty + lab.height + 0.5) * TILE_SIZE;
    return { x: 0, y: -1 };
  }
  throw new Error('labo inaccessible');
}

function labOf(world: World): Lab {
  const lab = world.lab();

  if (!lab) throw new Error('pas de labo');
  return lab;
}

function rejections(world: World): ResearchRejection[] {
  const found: ResearchRejection[] = [];

  world.events.on('researchRejected', ({ reason }) => found.push(reason));
  return found;
}

/** Lance une recherche et paie tout son coût depuis le sac. */
function pay(world: World, research: ResearchId): void {
  const lab = labOf(world);

  world.push({ type: 'startResearch', lab: lab.id, research });
  fill(world, RESEARCH[research].cost);
  world.push({ type: 'transferToLab', id: lab.id });
  world.tick();
}

function finish(world: World, research: ResearchId): void {
  pay(world, research);
  for (let i = 0; i < RESEARCH[research].duration + 1; i += 1) world.tick();
  if (!world.researchDone.includes(research)) throw new Error(`${research} ne s’est pas terminée`);
}

describe('recherches — données', () => {
  it('passe la validation, au moins quatre recherches par onglet (et les spécialités des régions), douze au plus par onglet d’ère', () => {
    expect(validatePrototypes()).toEqual([]);
    for (const theme of Object.keys(RESEARCH_THEMES) as ResearchTheme[]) {
      expect(RESEARCH_IDS.filter((id) => RESEARCH[id].theme === theme).length).toBeGreaterThanOrEqual(4);
    }
    for (let era = 1; era < ERAS.length; era += 1) {
      expect(RESEARCH_IDS.filter((id) => RESEARCH[id].era === era).length).toBeLessThanOrEqual(12);
    }
  });

  it('mêle objets communs et butin : le combat nourrit la recherche, la récolte aussi', () => {
    const lootCosts = RESEARCH_IDS.filter((id) => researchCost(id).some(([item]) => LOOT_ONLY.includes(item)));
    const commonOnly = RESEARCH_IDS.filter((id) => researchCost(id).every(([item]) => !LOOT_ONLY.includes(item)));

    expect(lootCosts.length).toBeGreaterThanOrEqual(3);
    expect(commonOnly.length).toBeGreaterThanOrEqual(3);
  });

  it('chaque trophée tombe d’un ennemi : mutant, crabe et loup ont le leur', () => {
    expect(ENEMIES.mutant.loot.map((entry) => entry.item)).toContain('mutantGoo');
    expect(WILDLIFE.crab.loot.map((entry) => entry.item)).toContain('crabClaw');
    expect(WILDLIFE.wolf.loot.map((entry) => entry.item)).toContain('wolfFang');
  });

  it('les modificateurs s’additionnent à la base des données, sans les toucher', () => {
    expect(researchBonus([], 'bowDamage')).toBe(0);
    expect(researchBonus(['sharpArrows'], 'bowDamage')).toBe(0.5);
    expect(STAT_BASE.bowDamage).toBe(WEAPONS.bow.damage);
    expect(WEAPONS.bow.damage).toBe(1);
  });
});

describe('labo de recherche', () => {
  it('plusieurs labos par colonie : le menu ne limite pas leur nombre', () => {
    const { world } = withLab();

    expect(world.atLimit('lab')).toBe(false);
    expect(world.labs()).toHaveLength(1);
    build(world, 'lab');
    expect(world.labs()).toHaveLength(2);
  });

  it('refuse une recherche dont un prérequis manque', () => {
    const { world, lab } = withLab();
    const refused = rejections(world);

    expect(researchStatus('quickDraw', world.researchDone, lab)).toBe('locked');
    world.push({ type: 'startResearch', lab: lab.id, research: 'quickDraw' });
    world.tick();

    expect(refused).toEqual(['locked']);
    expect(lab.research).toBeNull();
  });

  it('attend tout son coût — objets communs et butin — avant que le compte à rebours ne parte', () => {
    const { world, lab } = withLab();

    world.push({ type: 'startResearch', lab: lab.id, research: 'sharpArrows' });
    fill(world, { wood: 8, wolfFang: 1 });
    world.push({ type: 'transferToLab', id: lab.id });
    world.tick();

    // Le bois est posé, il manque deux crocs : ça attend.
    expect(lab.research).toBe('sharpArrows');
    expect(lab.endTick).toBe(0);
    expect(lab.store.count('wood')).toBe(8);
    expect(world.player.inventory.count('wood')).toBe(0);

    fill(world, { wolfFang: 2 });
    world.push({ type: 'transferToLab', id: lab.id });
    world.tick();

    // Tout est là : le coût est consommé, le compte à rebours tourne.
    expect(lab.endTick).toBe(world.tickCount + RESEARCH.sharpArrows.duration);
    expect(lab.store.total()).toBe(0);
    expect(world.player.inventory.count('wolfFang')).toBe(0);
    expect(researchStatus('sharpArrows', world.researchDone, lab)).toBe('running');
  });

  it('prend aussi dans le stock de la ville, si le labo est dans son rayon', () => {
    const { world, lab } = withLab();

    expect(world.labInTownRange(lab)).toBe(true);
    world.townStock()!.add('stone', 6);
    world.townStock()!.add('food', 6);
    world.push({ type: 'startResearch', lab: lab.id, research: 'walkingBoots' });
    world.push({ type: 'transferToLab', id: lab.id });
    world.tick();

    expect(lab.endTick).toBeGreaterThan(0);
    expect(world.townStock()!.count('stone')).toBe(0);
  });

  it('une seule recherche à la fois par labo : la suivante se met en file', () => {
    const { world, lab } = withLab();
    const refused = rejections(world);

    pay(world, 'walkingBoots');
    expect(lab.endTick).toBeGreaterThan(0);

    world.push({ type: 'startResearch', lab: lab.id, research: 'sharpAxes' });
    world.tick();

    expect(refused).toEqual([]);
    expect(lab.research).toBe('walkingBoots');
    expect(lab.queue).toEqual(['sharpAxes']);
    expect(world.productionTimer(lab)).not.toBeNull();
  });

  it('une recherche qui attend son coût n’est pas remplacée : la suivante se met en file', () => {
    const { world, lab } = withLab();

    world.push({ type: 'startResearch', lab: lab.id, research: 'walkingBoots' });
    world.push({ type: 'startResearch', lab: lab.id, research: 'sharpAxes' });
    world.tick();

    expect(lab.endTick).toBe(0);
    expect(lab.research).toBe('walkingBoots');
    expect(lab.queue).toEqual(['sharpAxes']);
  });

  it('la file est bornée, sans doublon', () => {
    const { world, lab } = withLab();
    const refused = rejections(world);
    const free = RESEARCH_IDS.filter((id) => missingFree(id));

    function missingFree(id: ResearchId): boolean {
      return RESEARCH[id].requires.length === 0;
    }
    pay(world, free[0]!);
    for (const id of free.slice(1, 1 + PRODUCTION.queueSize + 1)) world.push({ type: 'startResearch', lab: lab.id, research: id });
    world.push({ type: 'startResearch', lab: lab.id, research: free[1]! });
    world.tick();

    expect(lab.queue).toHaveLength(PRODUCTION.queueSize);
    expect(refused).toEqual(['busy']);
  });

  it('la file part toute seule à la fin de la recherche, coût payé à son tour', () => {
    const { world, lab } = withLab();

    pay(world, 'walkingBoots');
    world.push({ type: 'startResearch', lab: lab.id, research: 'sharpAxes' });
    for (let i = 0; i < RESEARCH.walkingBoots.duration + 1; i += 1) world.tick();

    expect(world.researchDone).toEqual(['walkingBoots']);
    expect(lab.research).toBe('sharpAxes');
    expect(lab.queue).toEqual([]);
    // Son coût n'était pas payé : le labo l'attend.
    expect(lab.endTick).toBe(0);

    fill(world, RESEARCH.sharpAxes.cost);
    world.push({ type: 'transferToLab', id: lab.id });
    world.tick();
    expect(lab.endTick).toBeGreaterThan(0);
  });

  it('retirer une recherche de la file', () => {
    const { world, lab } = withLab();

    pay(world, 'walkingBoots');
    world.push({ type: 'startResearch', lab: lab.id, research: 'sharpAxes' });
    world.push({ type: 'dequeueResearch', lab: lab.id, research: 'sharpAxes' });
    world.tick();
    expect(lab.queue).toEqual([]);
  });

  it('abandonner une recherche qui tourne rend son coût au coffre, et la file avance', () => {
    const { world, lab } = withLab();

    pay(world, 'walkingBoots');
    expect(lab.store.total()).toBe(0);
    world.push({ type: 'startResearch', lab: lab.id, research: 'sharpAxes' });
    world.push({ type: 'cancelResearch', lab: lab.id });
    world.tick();

    for (const [item, amount] of researchCost('walkingBoots')) expect(lab.store.count(item)).toBeGreaterThanOrEqual(amount);
    expect(lab.research).toBe('sharpAxes');
    expect(world.researchDone).toEqual([]);
  });

  it('deux labos mènent deux recherches en parallèle, mais jamais la même', () => {
    const { world, lab } = withLab();
    const second = world.entities.get(build(world, 'lab')) as Lab;
    const refused = rejections(world);

    pay(world, 'walkingBoots');
    world.push({ type: 'startResearch', lab: second.id, research: 'walkingBoots' });
    world.tick();
    expect(refused).toEqual(['taken']);
    expect(second.research).toBeNull();
    expect(researchStatus('walkingBoots', world.researchDone, second, world.labs())).toBe('taken');

    fill(world, RESEARCH.sharpAxes.cost);
    world.push({ type: 'startResearch', lab: second.id, research: 'sharpAxes' });
    world.push({ type: 'transferToLab', id: second.id });
    world.tick();

    expect(lab.endTick).toBeGreaterThan(0);
    expect(second.endTick).toBeGreaterThan(0);
    // Pas non plus en file dans le premier.
    world.push({ type: 'startResearch', lab: lab.id, research: 'sharpAxes' });
    world.tick();
    expect(refused).toEqual(['taken', 'taken']);

    for (let i = 0; i < Math.max(RESEARCH.walkingBoots.duration, RESEARCH.sharpAxes.duration) + 1; i += 1) world.tick();
    expect(world.researchDone).toEqual(expect.arrayContaining(['walkingBoots', 'sharpAxes']));
  });

  it('abandonner une recherche qui attend : rien de déposé n’est perdu', () => {
    const { world, lab } = withLab();

    world.push({ type: 'startResearch', lab: lab.id, research: 'sharpArrows' });
    fill(world, { wood: 5 });
    world.push({ type: 'transferToLab', id: lab.id });
    world.tick();
    world.push({ type: 'cancelResearch', lab: lab.id });
    world.tick();

    expect(lab.research).toBeNull();
    expect(world.takeable(lab)).toEqual([['wood', 5]]);

    world.push({ type: 'takeFromBuilding', id: lab.id });
    world.tick();

    expect(world.player.inventory.count('wood')).toBe(5);
    expect(lab.store.total()).toBe(0);
  });

  it('change d’avis en cours de collecte : ce qui est déposé sert à la suivante', () => {
    const { world, lab } = withLab();

    world.push({ type: 'startResearch', lab: lab.id, research: 'sharpArrows' });
    fill(world, { wood: 8 });
    world.push({ type: 'transferToLab', id: lab.id });
    world.tick();
    world.push({ type: 'cancelResearch', lab: lab.id });
    world.push({ type: 'startResearch', lab: lab.id, research: 'bigBag' });
    fill(world, { crabClaw: 4 });
    world.push({ type: 'transferToLab', id: lab.id });
    world.tick();

    // Le bois de l'une a payé l'autre.
    expect(lab.research).toBe('bigBag');
    expect(lab.endTick).toBeGreaterThan(0);
  });

  it('à la fin, l’effet s’applique : les flèches d’Adam font plus mal', () => {
    const { world } = withLab();
    const done: ResearchId[] = [];

    world.events.on('researchCompleted', ({ research }) => done.push(research));
    finish(world, 'sharpArrows');

    expect(done).toEqual(['sharpArrows']);
    expect(world.bonus('bowDamage')).toBe(0.5);
    expect(labOf(world).research).toBeNull();

    // Un mutant à deux cases : la prochaine flèche porte les dégâts améliorés.
    const mutant: Mutant = {
      kind: 'mutant',
      id: 9000,
      proto: 'mutant',
      x: world.player.x + 2 * TILE_SIZE,
      y: world.player.y,
      prevX: world.player.x + 2 * TILE_SIZE,
      prevY: world.player.y,
      facing: 'down',
      moving: false,
      hp: ENEMIES.mutant.hp,
      age: 30,
      attackCooldown: 0,
      emerge: 0,
    };

    world.mobiles.set(mutant.id, mutant);
    world.player.bowCooldown = 0;
    world.tick();

    const arrows = [...world.mobiles.values()].filter((mobile): mobile is Arrow => mobile.kind === 'arrow');

    expect(arrows.length).toBeGreaterThan(0);
    expect(arrows[0]!.damage).toBe(WEAPONS.bow.damage + 0.5);
  });

  it('tir rapide : le délai de l’arc raccourcit', () => {
    const { world } = withLab();

    finish(world, 'sharpArrows');
    finish(world, 'quickDraw');
    expect(world.bonus('bowCooldown')).toBe(-4);
  });

  it('grand sac : le sac grandit sur-le-champ, sans rien perdre', () => {
    const { world } = withLab();

    world.player.inventory.add('stone', 3);
    finish(world, 'bigBag');

    expect(world.player.inventory.capacity).toBe(INVENTORY_CAPACITY + 15);
    expect(world.player.inventory.count('stone')).toBe(3);
  });

  it('bottes de marche : Adam va plus loin en un tick', () => {
    // Le plus long pas d'un tick, dans les quatre directions : l'une d'elles au moins est dégagée.
    const stride = (world: World): number => {
      let best = 0;

      for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const from = { x: world.player.x, y: world.player.y };

        world.push({ type: 'setMoveAxis', x, y });
        world.tick();
        best = Math.max(best, Math.hypot(world.player.x - from.x, world.player.y - from.y));
        world.push({ type: 'setMoveAxis', x: 0, y: 0 });
        world.tick();
      }
      return best;
    };
    const { world } = withLab();
    const before = stride(world);

    finish(world, 'walkingBoots');
    expect(stride(world)).toBeGreaterThan(before);
  });

  it('les porteurs livrent le labo depuis la mairie', () => {
    const built = withLab().world;
    // Une maison des constructeurs posée d'un coup (il faudrait son plan) : ses porteurs s'y installent au chargement.
    const state = built.snapshot();
    const { tx, ty } = spot(built, 'nursery');

    state.entities.push({ kind: 'house', id: state.nextId, proto: 'builderHouse', tx, ty, width: 2, height: 2, store: {}, hp: BUILDINGS.builderHouse.hp, level: 1, paused: false, staff: BUILDINGS.builderHouse.workers });
    state.nextId += 1;

    const world = World.restore(state);
    const lab = labOf(world);

    world.townStock()!.add('stone', 20);
    world.townStock()!.add('food', 20);
    // Adam s'éloigne : ce sont les porteurs qu'on regarde.
    world.player.x -= 12 * TILE_SIZE;
    world.push({ type: 'startResearch', lab: lab.id, research: 'walkingBoots' });

    for (let i = 0; i < 20 * 90 && lab.endTick === 0; i += 1) world.tick();

    expect(lab.endTick).toBeGreaterThan(0);
    expect(world.townStock()!.count('stone')).toBe(14);
    // Les 6 de la recherche, pris aux 20 posés et aux nourritures de départ de la mairie.
    expect(world.townStock()!.count('food')).toBe(20 + COLONY.startingStock.food - 6);
  });
});

describe('recherche — ouvriers et Adam', () => {
  it('gilet rembourré : Adam gagne des PV max, et ceux-là arrivent pleins', () => {
    const { world, lab } = withLab();
    const before = world.maxHp();
    const gain = RESEARCH.paddedVest.effect.amount;

    pay(world, 'paddedVest');
    while (world.tickCount < lab.endTick - 1) world.tick();
    world.player.hp = 2;
    world.tick();
    expect(world.researchDone).toContain('paddedVest');
    expect(world.maxHp()).toBe(before + gain);
    expect(world.player.hp).toBeGreaterThanOrEqual(2 + gain);
  });

  it('sandales tressées : les habitants vont plus loin en un tick', () => {
    // Le plus grand pas d'un ouvrier libre qui flâne devant la mairie, sur quelques secondes.
    const stride = (sandals: boolean): number => {
      const { world } = withLab();

      if (sandals) world.researchDone.push('sandals');

      const workers = [...world.mobiles.values()].filter((mobile) => mobile.kind === 'worker');
      let best = 0;

      expect(workers.length).toBeGreaterThan(0);
      for (let i = 0; i < 20 * 20; i += 1) {
        world.tick();
        for (const worker of workers) best = Math.max(best, Math.hypot(worker.x - worker.prevX, worker.y - worker.prevY));
      }
      return best;
    };

    expect(stride(true)).toBeCloseTo(stride(false) * (1 + RESEARCH.sandals.effect.amount), 5);
  });

  it('rations et gourdes : la faim et la soif baissent d’un quart moins vite', () => {
    const plain = fullNeeds();
    const spared = fullNeeds();

    for (let i = 0; i < 20 * 60; i += 1) {
      drainNeeds(plain, true);
      drainNeeds(spared, true, undefined, { hunger: RESEARCH.rations.effect.amount, thirst: RESEARCH.canteens.effect.amount });
    }
    expect(1 - spared.hunger).toBeCloseTo((1 - plain.hunger) * 0.75, 6);
    expect(1 - spared.thirst).toBeCloseTo((1 - plain.thirst) * 0.75, 6);
  });

  it('la ville lit la recherche finie : faim et soif ralenties pour ses habitants', () => {
    const { world } = withLab();
    const worker = [...world.mobiles.values()].find((mobile) => mobile.kind === 'worker')!;

    world.researchDone.push('rations', 'canteens');
    worker.needs = fullNeeds();
    for (let i = 0; i < 20 * 10; i += 1) world.tick();

    const { thirst } = worker.needs;
    const plain = fullNeeds();

    // Au repos ou au travail, jamais plus vite que le repos sans gourde : la recherche compte.
    for (let i = 0; i < 20 * 10; i += 1) drainNeeds(plain, false);
    expect(1 - thirst).toBeLessThan(1 - plain.thirst);
  });
});

/** Le labo d'un monde à porteurs : une maison des constructeurs posée d'un coup, ses porteurs s'y installent au chargement. */
function withPorters(): { world: World; lab: Lab } {
  const built = withLab().world;
  const state = built.snapshot();
  const { tx, ty } = spot(built, 'nursery');

  state.entities.push({ kind: 'house', id: state.nextId, proto: 'builderHouse', tx, ty, width: 2, height: 2, store: {}, hp: BUILDINGS.builderHouse.hp, level: 1, paused: false, staff: BUILDINGS.builderHouse.workers });
  state.nextId += 1;

  const world = World.restore(state);

  // Les libres ne glanent pas : le coût du labo ne vient que des porteurs et de la ville.
  world.gleaning = false;
  // Adam s'éloigne : ce sont les porteurs qu'on regarde.
  world.player.x -= 12 * TILE_SIZE;
  return { world, lab: labOf(world) };
}

/** Toute la pierre de la colonie : en ville, au labo, sur la tête des porteurs. Rien ne se perd, rien ne se crée. */
function stoneEverywhere(world: World, lab: Lab): number {
  let carried = 0;

  for (const mobile of world.mobiles.values()) {
    if (mobile.kind === 'worker' && mobile.job?.carried && mobile.job.item === 'stone') carried += mobile.job.amount;
  }
  return world.townStock()!.count('stone') + lab.store.count('stone') + carried;
}

describe('labo — les ingrédients apportés', () => {
  it('lancer une recherche ne prend rien à la ville : le labo affiche ce qu’il attend', () => {
    const { world, lab } = withLab();
    const town = world.townStock()!;

    town.add('stone', 20);
    const food = town.count('food');

    world.push({ type: 'startResearch', lab: lab.id, research: 'walkingBoots' });
    world.tick();

    expect(lab.research).toBe('walkingBoots');
    expect(lab.endTick).toBe(0);
    expect(town.count('stone')).toBe(20);
    expect(town.count('food')).toBe(food);
    expect(world.labLedger(lab).map(({ item, delivered, needed, missing }) => [item, delivered, needed, missing])).toEqual([
      ['stone', 0, 6, 6],
      ['food', 0, 6, 6],
    ]);
  });

  it('Adam la heurte avec les ingrédients dans le sac : le compteur monte, puis la recherche démarre', () => {
    const { world, lab } = withLab();
    const town = world.townStock()!;
    const before = town.count('stone');
    const seen: number[] = [];

    world.push({ type: 'startResearch', lab: lab.id, research: 'walkingBoots' });
    fill(world, RESEARCH.walkingBoots.cost);

    const axis = touch(world, lab);

    world.push({ type: 'setMoveAxis', ...axis });
    for (let i = 0; i < 20 * 20 && lab.endTick === 0; i += 1) {
      world.tick();

      const delivered = world.labLedger(lab).reduce((sum, line) => sum + line.delivered, 0);

      if (delivered !== seen.at(-1)) seen.push(delivered);
    }

    expect(lab.endTick).toBeGreaterThan(0);
    // Un objet par contact : le compteur monte pas à pas.
    expect(seen.length).toBeGreaterThan(2);
    expect(world.player.inventory.count('stone')).toBe(0);
    expect(world.player.inventory.count('food')).toBe(0);
    expect(town.count('stone')).toBe(before);
    // Payée : la rangée au-dessus du labo s'efface, place au compte à rebours.
    expect(world.labLedger(lab)).toEqual([]);
  });

  it('les porteurs livrent depuis la mairie, réservé à la création : jamais plus que demandé, rien de perdu', () => {
    const { world, lab } = withPorters();
    const town = world.townStock()!;

    town.add('stone', 20);
    const total = stoneEverywhere(world, lab);
    let consumed = 0;

    world.events.on('researchStarted', () => (consumed = RESEARCH.walkingBoots.cost.stone));
    world.push({ type: 'startResearch', lab: lab.id, research: 'walkingBoots' });

    for (let i = 0; i < 20 * 90 && lab.endTick === 0; i += 1) {
      world.tick();

      // Ce qui est au labo et ce qui est promis ne dépasse jamais le coût : aucune double réservation.
      if (lab.endTick === 0) expect(lab.store.count('stone') + lab.store.expected('stone')).toBeLessThanOrEqual(RESEARCH.walkingBoots.cost.stone);
      // La pierre ne se perd ni ne se duplique en route.
      expect(stoneEverywhere(world, lab) + consumed).toBe(total);
    }

    expect(lab.endTick).toBeGreaterThan(0);
    expect(town.count('stone')).toBe(total - RESEARCH.walkingBoots.cost.stone);
    expect(town.available('stone')).toBe(town.count('stone'));
  });

  it('sans stock en ville et sans Adam, la recherche attend sans bloquer les porteurs', () => {
    const { world, lab } = withPorters();

    world.push({ type: 'startResearch', lab: lab.id, research: 'walkingBoots' });
    for (let i = 0; i < 20 * 60; i += 1) world.tick();

    expect(lab.endTick).toBe(0);
    const stone = world.labLedger(lab).find((line) => line.item === 'stone')!;

    // Rien en route, rien en ville : à sec.
    expect(stone).toMatchObject({ delivered: 0, incoming: 0, inTown: 0, dry: true });
  });

  it('abandonner en cours de livraison : ce qui est livré ou en route revient à la mairie, sans perte', () => {
    const { world, lab } = withPorters();
    const town = world.townStock()!;

    town.add('stone', 20);
    const total = stoneEverywhere(world, lab);

    world.push({ type: 'startResearch', lab: lab.id, research: 'walkingBoots' });
    for (let i = 0; i < 20 * 90 && lab.store.count('stone') === 0; i += 1) world.tick();
    expect(lab.store.count('stone')).toBeGreaterThan(0);

    world.push({ type: 'cancelResearch', lab: lab.id });
    for (let i = 0; i < 20 * 120 && town.count('stone') < total; i += 1) {
      world.tick();
      expect(stoneEverywhere(world, lab)).toBe(total);
    }

    expect(lab.research).toBeNull();
    expect(town.count('stone')).toBe(total);
    expect(lab.store.total()).toBe(0);
  });
});

describe('recherche — sauvegarde', () => {
  it('une recherche en attente se recharge avec son coffre et ses porteurs en route, sans doublon', () => {
    const { world, lab } = withPorters();
    const town = world.townStock()!;

    town.add('stone', 20);
    world.push({ type: 'startResearch', lab: lab.id, research: 'walkingBoots' });

    // Une livraison posée, une autre en route.
    for (let i = 0; i < 20 * 90 && !(lab.store.count('stone') > 0 && lab.store.expected('stone') > 0); i += 1) world.tick();
    expect(lab.store.count('stone')).toBeGreaterThan(0);
    expect(lab.store.expected('stone')).toBeGreaterThan(0);

    const total = stoneEverywhere(world, lab);
    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);

    const restored = decoded.world;
    const again = labOf(restored);

    expect(again.research).toBe('walkingBoots');
    expect(again.store.count('stone')).toBe(lab.store.count('stone'));
    // Les réservations se rejouent depuis les jobs des porteurs.
    expect(again.store.expected('stone')).toBe(lab.store.expected('stone'));
    expect(stoneEverywhere(restored, again)).toBe(total);

    for (let i = 0; i < 20 * 90 && again.endTick === 0; i += 1) restored.tick();
    expect(again.endTick).toBeGreaterThan(0);
    expect(restored.townStock()!.count('stone')).toBe(total - RESEARCH.walkingBoots.cost.stone);
  });

  it('une ancienne sauvegarde dont la recherche est déjà payée continue sans redemander ses ingrédients', () => {
    const { world, lab } = withLab();
    const file = JSON.parse(encodeSave(world, 0)) as { version: number; state: Record<string, unknown> };
    const saved = (file.state['entities'] as SavedEntity[]).find((entity) => entity.id === lab.id) as SavedEntity & Record<string, unknown>;

    // Payée sous l'ancien système : le coffre est vide, le compte à rebours tourne.
    saved['research'] = 'sharpAxes';
    saved['endTick'] = world.tickCount + 100;
    saved['store'] = {};
    // Et son réveil, que le labo avait demandé au scheduler en payant.
    (file.state['scheduler'] as { near: [number, number[]][] }).near.push([world.tickCount + 100, [lab.id]]);

    const decoded = decodeSave(JSON.stringify(file));

    if (!decoded.ok) throw new Error(decoded.reason);

    const restored = decoded.world;

    expect(restored.labLedger(labOf(restored))).toEqual([]);
    for (let i = 0; i < 101; i += 1) restored.tick();
    expect(restored.researchDone).toEqual(['sharpAxes']);
  });

  it('une recherche terminée survit au rechargement, son effet aussi', () => {
    const { world } = withLab();

    finish(world, 'bigBag');

    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.world.researchDone).toEqual(['bigBag']);
    expect(decoded.world.bonus('bagCapacity')).toBe(15);
    expect(decoded.world.player.inventory.capacity).toBe(INVENTORY_CAPACITY + 15);
  });

  it('une recherche en cours reprend son compte à rebours au chargement', () => {
    const { world } = withLab();

    pay(world, 'sharpAxes');

    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);

    const restored = decoded.world;

    expect(labOf(restored).research).toBe('sharpAxes');
    for (let i = 0; i < RESEARCH.sharpAxes.duration + 1; i += 1) restored.tick();
    expect(restored.researchDone).toEqual(['sharpAxes']);
  });

  it('la file et le compte à rebours survivent au rechargement ; une sauvegarde d’avant la file se lit', () => {
    const { world, lab } = withLab();

    pay(world, 'walkingBoots');
    world.push({ type: 'startResearch', lab: lab.id, research: 'sharpAxes' });
    world.tick();

    const text = encodeSave(world, 0);
    const decoded = decodeSave(text);

    if (!decoded.ok) throw new Error(decoded.reason);
    expect(labOf(decoded.world).queue).toEqual(['sharpAxes']);
    expect(labOf(decoded.world).endTick).toBe(lab.endTick);
    for (let i = 0; i < RESEARCH.walkingBoots.duration + 1; i += 1) decoded.world.tick();
    expect(labOf(decoded.world).research).toBe('sharpAxes');

    const file = JSON.parse(text) as { state: { entities: Record<string, unknown>[] } };

    for (const entity of file.state.entities) delete entity['queue'];

    const old = decodeSave(JSON.stringify(file));

    if (!old.ok) throw new Error(old.reason);
    expect(labOf(old.world).queue).toEqual([]);
  });

  it('une sauvegarde d’avant le labo se lit : aucune recherche faite', () => {
    const { world } = withLab();
    const file = JSON.parse(encodeSave(world, 0)) as { version: number; state: Record<string, unknown> };

    delete file.state['researchDone'];
    // Et sans labo : ses entités sont celles d'avant.
    file.state['entities'] = (file.state['entities'] as SavedEntity[]).filter((entity) => entity.proto !== 'lab');

    const decoded = decodeSave(JSON.stringify(file));

    expect(file.version).toBe(SAVE_VERSION);
    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.world.researchDone).toEqual([]);
    expect(decoded.world.lab()).toBeNull();
  });
});

describe('recherche — bâtiments débloqués', () => {
  /** Les bâtiments que le menu propose, dans l'ordre des données. */
  function menu(world: World): BuildingId[] {
    return MENU_BUILDING_IDS.filter((id) => world.inMenu(id));
  }

  function unlocked(world: World): BuildingId[][] {
    const found: BuildingId[][] = [];

    world.events.on('buildingsUnlocked', ({ buildings }) => found.push(buildings));
    return found;
  }

  it('une nouvelle partie ne propose rien avant la mairie, puis seulement ce qui est là au départ, sans badge', () => {
    const world = new World(drySeed());
    const events = unlocked(world);

    world.tick();
    expect(menu(world)).toEqual([]);

    fill(world, BUILDINGS.townHall.cost);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    const start = menu(world);

    expect(start).toContain('lab');
    expect(start).toContain('watchtower');
    for (const id of ['forge', 'charcoalKiln', 'clinic', 'builderHouse', 'antenna'] as const) expect(start).not.toContain(id);
    expect(start.filter((id) => world.isNewInMenu(id))).toEqual([]);
    expect(events).toEqual([]);
  });

  // Non-régression : une colonie neuve (`World.newColony`, celle du jeu) ne s'ouvrait pas sur le labo.
  it('une colonie neuve ne propose que les bâtiments de départ, labo compris', () => {
    const world = World.newColony(drySeed());
    const events = unlocked(world);

    fill(world, BUILDINGS.townHall.cost);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    expect([...menu(world)].sort()).toEqual([...START_BUILDINGS].sort());
    expect(menu(world)).toContain('lab');
    expect(MENU_BUILDING_IDS.filter((id) => world.isNewInMenu(id))).toEqual([]);
    expect(events).toEqual([]);
  });

  it('dans une colonie neuve, finir la Fonderie fait entrer la forge et le four au menu, avec badge et annonce', () => {
    const { world } = withLab(drySeed(), (seed) => World.newColony(seed));
    const events = unlocked(world);

    expect(world.inMenu('forge')).toBe(false);
    expect(world.inMenu('charcoalKiln')).toBe(false);

    // La Fonderie demande l'Extraction (qui ouvre carrière et foreuse) : on la tient pour faite.
    world.researchDone.push('mining');
    finish(world, 'metalworking');

    expect(events).toEqual([
      ['quarry', 'drill'],
      ['forge', 'charcoalKiln'],
    ]);
    expect(world.isNewInMenu('forge')).toBe(true);
    expect(world.isNewInMenu('charcoalKiln')).toBe(true);
    expect(world.inMenu('clinic')).toBe(false);
  });

  it('chaque bâtiment débloqué au labo l’est par une seule recherche, qui le dit', () => {
    expect(unlockingResearch('forge')).toBe('metalworking');
    expect(unlockingResearch('charcoalKiln')).toBe('metalworking');
    expect(unlockingResearch('clinic')).toBe('fieldMedicine');
    expect(unlockingResearch('lab')).toBeNull();
  });

  it('finir la Fonderie fait entrer la forge et le four au menu, avec badge et annonce', () => {
    const { world } = withLab();
    const events = unlocked(world);

    expect(world.inMenu('forge')).toBe(false);
    expect(world.canPlace('forge', 0, 0)).toBe('locked');

    world.researchDone.push('mining');
    finish(world, 'metalworking');

    expect(events).toEqual([['forge', 'charcoalKiln']]);
    expect(world.inMenu('forge')).toBe(true);
    expect(world.isNewInMenu('forge')).toBe(true);
    expect(world.isNewInMenu('charcoalKiln')).toBe(true);

    // Choisir la carte efface son badge ; poser l'autre aussi.
    world.push({ type: 'seeBuilding', building: 'forge' });
    world.tick();
    expect(world.isNewInMenu('forge')).toBe(false);

    const { tx, ty } = spot(world, 'charcoalKiln');

    world.push({ type: 'placeBuilding', building: 'charcoalKiln', tx, ty });
    world.tick();
    expect(world.isNewInMenu('charcoalKiln')).toBe(false);
    // Une seule annonce : le tick d'après ne refête rien.
    expect(events).toHaveLength(1);
  });

  it('« vu » ne vaut que pour un bâtiment au menu : on n’efface pas d’avance le badge de la clinique', () => {
    const { world } = withLab();

    world.push({ type: 'seeBuilding', building: 'clinic' });
    world.tick();
    expect(world.seenBuildings.has('clinic')).toBe(false);
  });

  it('les badges et les déblocages survivent au rechargement, sans nouvelle annonce', () => {
    const { world } = withLab();

    world.researchDone.push('mining');
    finish(world, 'metalworking');
    world.push({ type: 'seeBuilding', building: 'forge' });
    world.tick();

    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);

    const restored = decoded.world;
    const events = unlocked(restored);

    restored.tick();
    expect(restored.inMenu('forge')).toBe(true);
    expect(restored.isNewInMenu('forge')).toBe(false);
    expect(restored.isNewInMenu('charcoalKiln')).toBe(true);
    expect(events).toEqual([]);
  });

  /** Une sauvegarde version 7 : ni `seenBuildings`, ni les recherches qui débloquent. */
  function version7(world: World, night: number): string {
    const file = JSON.parse(encodeSave(world, 0)) as { version: number; state: Record<string, unknown> };

    file.version = 7;
    file.state['night'] = night;
    delete file.state['seenBuildings'];
    return JSON.stringify(file);
  }

  it('une vieille partie qui a vu une nuit garde forge, four et clinique, et rien n’y est « Nouveau »', () => {
    const { world } = withLab();
    const decoded = decodeSave(version7(world, 2));

    if (!decoded.ok) throw new Error(decoded.reason);

    const loaded = decoded.world;
    const events = unlocked(loaded);

    loaded.tick();
    expect(loaded.researchDone.filter((id) => RESEARCH[id].opens.length === 0)).toEqual(['metalworking', 'fieldMedicine']);
    expect(menu(loaded)).toEqual(expect.arrayContaining(['forge', 'charcoalKiln', 'clinic']));
    expect(MENU_BUILDING_IDS.filter((id) => loaded.isNewInMenu(id))).toEqual([]);
    expect(events).toEqual([]);
  });

  it('une vieille partie d’avant la première nuit les trouvera au labo', () => {
    const { world } = withLab();
    const decoded = decodeSave(version7(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.world.researchDone.filter((id) => RESEARCH[id].opens.length === 0)).toEqual([]);
    expect(decoded.world.inMenu('forge')).toBe(false);
  });

  /** Une sauvegarde version 9 : le labo hors du départ, la station au cinquième objectif. */
  function version9(world: World, change: (state: Record<string, unknown>) => void): string {
    const file = JSON.parse(encodeSave(world, 0)) as { version: number; state: Record<string, unknown> };

    file.version = 9;
    change(file.state);
    return JSON.stringify(file);
  }

  it('une colonie neuve d’avant le labo de départ trouve le labo au menu, et le reste au labo', () => {
    const world = World.newColony(drySeed());
    const decoded = decodeSave(version9(world, (state) => (state['openBuildings'] = ['home', 'nursery', 'logisticsPost'])));

    if (!decoded.ok) throw new Error(decoded.reason);

    const loaded = decoded.world;

    expect(loaded.isUnlocked('lab')).toBe(true);
    expect(loaded.isUnlocked('drill')).toBe(false);
    expect(loaded.researchDone).toEqual([]);
  });

  it('une partie d’avant les bâtiments de départ garde puits, tours, foreuses… et la station passé l’objectif 5', () => {
    const { world } = withLab();
    const decoded = decodeSave(
      version9(world, (state) => {
        delete state['openBuildings'];
        state['objective'] = 5;
      }),
    );

    if (!decoded.ok) throw new Error(decoded.reason);

    const loaded = decoded.world;

    expect(loaded.researchDone).toEqual(expect.arrayContaining(['waterWell', 'woodcraft', 'lookout', 'mining', 'organizedSites', 'purification']));
    for (const id of ['well', 'drill', 'watchtower', 'constructionPost', 'purifier'] as const) expect(loaded.isUnlocked(id)).toBe(true);
  });
});
