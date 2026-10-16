import { describe, expect, it } from 'vitest';
import { BUILDINGS, REPAIR } from '../data/buildings.ts';
import { worldToTile } from '../core/grid.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { EVE, EVE_LINES } from '../data/eve.ts';
import { TOWN_PLENTY, type ItemId } from '../data/items.ts';
import { OBJECTIVES } from '../data/objectives.ts';
import { chapterObjectives, firstOpenObjective } from '../sim/objectives.ts';
import type { EntityId } from '../sim/types.ts';
import { World } from '../sim/world.ts';
import { setLocale } from '../i18n/locale.ts';
import { INVENTORY_CAPACITY } from '../sim/player.ts';
import { harvestRefusedText, tutorialAdvice, tutorialHint, uselessBagHint, type HintProgress } from './hint.ts';

const FRESH: HintProgress = { harvestedWood: false, harvestedStone: false, delivered: false, repaired: false };

/** Le conseil d'une nuit à tenir, de jour : le temps qu'il reste avant l'aube. */
const WAITING_DAWN = /^Prochaine aube dans \d+ minutes?\./;

/** Un monde dont la mairie est bâtie : le sac livré, le dernier objet l'achève. */
function hallWorld(): World {
  const world = new World(1);

  world.player.inventory.add('wood', 25);
  world.player.inventory.add('stone', 12);
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();
  return world;
}

/**
 * La mairie bâtie et les fondations cochées d'office : le chapitre « Passer
 * la nuit » est ouvert, son premier objectif une nuit à tenir. Le sac vidé
 * de la récompense du chapitre.
 */
function builtWorld(): World {
  const world = hallWorld();

  for (const { id } of chapterObjectives(world)) world.objectivesDone.add(id);
  world.tick();
  for (const [item, count] of world.player.inventory.entries()) world.player.inventory.remove(item, count);
  return world;
}

/** Le conseil de l'objectif `id`. */
const hintOf = (id: string): string => OBJECTIVES.find((objective) => objective.id === id)!.hint;

describe('tutorialHint', () => {
  it('commence par le bois du chantier de la mairie', () => {
    expect(tutorialHint(new World(1), FRESH, false, 0)).toBe(EVE_LINES.hints.wood);
  });

  it('une fois la mairie bâtie, Ève suit l’objectif du chapitre, pas la tour de guet', () => {
    const world = new World(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    expect(world.entities.get(world.townHallId)?.kind).toBe('townHall');
    expect(tutorialHint(world, FRESH, false, 0)).toBe(hintOf(firstOpenObjective(world)!));
  });

  it('dans une colonie neuve, la cabane passe par le labo : le bâtir, puis y lancer le Bûcheronnage, puis l’approvisionner', () => {
    const world = World.newColony(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    const camp = BUILDINGS.lumberCamp.label;

    // Le labo est le premier objectif du chapitre ; la cabane, choisie, dit d'y passer.
    expect(tutorialHint(world, FRESH, false, 0, 'lumberCamp')).toBe(EVE_LINES.hints.labOpen.replace('{building}', camp));

    const { tx, ty } = worldToTile(world.player.x, world.player.y);
    let id: EntityId | null = null;

    world.events.on('buildingPlaced', (event) => (id = event.id));
    for (let r = 2; r < 8 && id === null; r += 1) {
      if (world.canPlace('lab', tx + r, ty) !== null) continue;
      world.push({ type: 'placeBuilding', building: 'lab', tx: tx + r, ty });
      world.tick();
    }
    world.player.inventory.add('wood', 14);
    world.player.inventory.add('stone', 10);
    world.player.inventory.add('ironOre', 4);
    world.push({ type: 'transferToSite', id: id! });
    world.tick();
    expect(world.labs()).toHaveLength(1);
    const advice = tutorialAdvice(world, FRESH, false, 0)!;

    expect(advice.text).toBe(EVE_LINES.hints.labResearch.replace('{research}', 'Bûcheronnage').replace('{building}', camp));
    expect(advice.research).toBe('woodcraft');

    // Le labo lance la recherche : Ève dit d'apporter son coût, puis d'attendre.
    const lab = world.labs()[0]!;

    world.push({ type: 'startResearch', lab: lab.id, research: 'woodcraft' });
    world.tick();
    const supply = tutorialAdvice(world, FRESH, false, 0)!;

    expect(supply.research).toBe('woodcraft');
    expect(supply.wants === null ? world.labLedger(lab).length === 0 : supply.text.includes('Bûcheronnage')).toBe(true);
  });

  it('l’objectif choisi parle seul : pas de tour de guet, avec ou sans choix du joueur', () => {
    const world = World.newColony(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    const cabin = OBJECTIVES.find((objective) => objective.goals.some((goal) => goal.type === 'build' && goal.building === 'lumberCamp'))!;
    const camp = EVE_LINES.hints.labOpen.replace('{building}', BUILDINGS.lumberCamp.label);

    expect(tutorialAdvice(world, FRESH, false, 0, cabin.id)?.text).toBe(camp);
    // Sans choix, le premier objectif du chapitre : le labo, dont le conseil est sa propre réplique.
    expect(tutorialAdvice(world, FRESH, false, 0)?.text).toBe(hintOf('lab'));
  });

  it('le labo est l’objectif : le repère montre le filon de fer tant que le fer manque, puis se tait', () => {
    const world = World.newColony(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    const lab = OBJECTIVES.find((objective) => objective.id === 'lab')!;

    expect(tutorialAdvice(world, FRESH, false, 0, lab.id)?.pointTo).toBe('ironOre');
    world.player.inventory.add('ironOre', BUILDINGS.lab.cost.ironOre);
    expect(tutorialAdvice(world, FRESH, false, 0, lab.id)?.pointTo ?? null).toBeNull();
  });

  it('dix ouvriers qui glandent, la tour posée : Ève les envoie travailler, et loger si les lits manquent', () => {
    const world = World.newColony(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    for (let i = 0; i < 400; i += 1) world.tick();

    const { idle } = world.census();

    expect(idle).toBeGreaterThanOrEqual(3);
    // Sans objectif à suivre (partie sans fin), Ève revient à ses conseils de jeu : ici, les oisifs.
    const text = tutorialAdvice(world, FRESH, true, 0, null)?.text ?? '';

    expect(text).toBe(EVE_LINES.hints.idleHousing.replace('{n}', String(idle)));
  });

  it('ne parle jamais d’un bouton « Construire »', () => {
    const world = new World(1);
    const hints: (string | null)[] = [tutorialHint(world, FRESH, false, 0)];

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    hints.push(tutorialHint(world, FRESH, false, 0));
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();
    hints.push(tutorialHint(world, FRESH, false, 0));

    for (const hint of hints) expect(hint ?? '').not.toContain('Construire');
  });

  it('envoie chercher du bois, puis de la pierre', () => {
    const world = new World(1);

    expect(tutorialAdvice(world, FRESH, false, 0)?.wants).toBe('wood');
    expect(tutorialAdvice(world, { ...FRESH, harvestedWood: true }, false, 0)?.wants).toBe('stone');
    // La mairie bâtie, le conseil ne réclame plus de matériau.
    expect(tutorialAdvice(builtWorld(), FRESH, false, 0)?.wants).toBeNull();
  });

  it('envoie poser une carrière quand la pierre manque en ville, et laisse parler l’objectif dès qu’il y en a', () => {
    const world = builtWorld();

    expect(world.townStock()!.available('stone')).toBe(0);
    expect(tutorialAdvice(world, FRESH, true, 0, null)?.text).toBe(EVE_LINES.hints.quarry);
    // L'objectif choisi passe devant : la pierre manquante n'est pas une urgence.
    expect(tutorialHint(world, FRESH, true, 0)).toMatch(WAITING_DAWN);
    // Pendant une vague, l'arc d'abord.
    expect(tutorialAdvice(world, FRESH, true, 1, null)?.text).toBe(EVE_LINES.hints.bow);

    world.townStock()!.add('stone', 1);
    expect(tutorialHint(world, FRESH, true, 0)).toMatch(WAITING_DAWN);
  });

  it('apprend à réparer la mairie abîmée entre deux vagues, tant qu’Ève n’est pas là', () => {
    const world = builtWorld();
    const hall = world.entities.get(world.townHallId);

    if (hall?.kind !== 'townHall') throw new Error('la mairie devrait être bâtie');
    world.townStock()!.add('stone', 1);
    const max = hall.hp;

    hall.hp = Math.floor(max / 2) - 1;

    // Pas de bois sous la main : Ève envoie en chercher.
    world.player.inventory.remove('wood', world.player.inventory.count('wood'));
    world.townStock()!.remove('wood', world.townStock()!.available('wood'));
    expect(tutorialAdvice(world, FRESH, true, 0)).toEqual({ text: EVE_LINES.hints.repairFetch, wants: REPAIR.item, urgent: true });

    world.player.inventory.add(REPAIR.item, 1);
    expect(tutorialAdvice(world, FRESH, true, 0)).toEqual({ text: EVE_LINES.hints.repair, wants: null, urgent: true });
    // Pendant la vague, l'arc d'abord ; la mairie à plus de la moitié, c'est l'objectif en cours qui parle.
    expect(tutorialHint(world, FRESH, true, 1)).not.toBe(EVE_LINES.hints.repair);
    hall.hp = max - REPAIR.hp;
    expect(tutorialAdvice(world, FRESH, true, 0)?.urgent).toBeUndefined();
    expect(tutorialHint(world, FRESH, true, 0)).toMatch(WAITING_DAWN);
  });

  it('annonce la forge une fois débloquée, et envoie chercher du charbon', () => {
    const world = builtWorld();

    // De la pierre en ville : Ève ne parle pas de carrière, c'est l'attente de l'objectif en cours qui parle.
    world.townStock()!.add('stone', 1);
    expect(world.chapter).toBe(2);
    expect(tutorialHint(world, FRESH, true, 0)).toMatch(WAITING_DAWN);

    // Tant qu'Ève annonce son arrivée par radio, c'est elle qui parle d'abord ; puis elle envoie au labo.
    // Sans objectif à suivre, elle revient à ses conseils de jeu.
    world.night = EVE.arrivalNight;
    expect(tutorialAdvice(world, FRESH, true, 0, null)?.text).toBe(EVE_LINES.hints.labForge);
    world.researchDone.push('metalworking');
    expect(tutorialAdvice(world, FRESH, true, 0, null)?.wants).toBe('coal');
    // Pendant une vague, l'arc d'abord.
    expect(tutorialAdvice(world, FRESH, true, 3, null)?.wants).not.toBe('coal');
  });
});

describe('conseil du sac plein', () => {
  const USELESS = /^Ton sac est plein de bois, Adam : pose un chantier qui en a besoin/;
  const DELIVER = EVE_LINES.hints.bagFull;

  /** Une partie dont la mairie a déjà reçu tout son bois. */
  function woodDelivered(): World {
    const world = new World(1);
    const hall = world.entities.get(world.townHallId);

    if (hall?.kind !== 'site') throw new Error('la partie ne commence plus sur le chantier de la mairie');
    hall.delivered = { wood: BUILDINGS.townHall.cost.wood };
    return world;
  }

  it('dit que le sac plein de bois ne sert à aucun chantier', () => {
    const world = woodDelivered();

    world.player.inventory.add('wood', INVENTORY_CAPACITY);

    expect(tutorialHint(world, FRESH, false, 0)).toMatch(USELESS);
    expect(tutorialHint(world, FRESH, false, 0)).not.toMatch(/chantier !/);
  });

  it('nomme l’objet qui prend le plus de place', () => {
    const world = woodDelivered();

    world.player.inventory.add('coal', 20);
    world.player.inventory.add('wood', INVENTORY_CAPACITY - 20);

    expect(uselessBagHint(world)).toMatch(USELESS);
  });

  it('envoie livrer quand le sac plein contient ce que le chantier attend', () => {
    const world = woodDelivered();

    world.player.inventory.add('wood', INVENTORY_CAPACITY - 1);
    world.player.inventory.add('stone', 1);

    expect(uselessBagHint(world)).toBeNull();
    expect(tutorialHint(world, FRESH, false, 0)).toBe(DELIVER);
  });

  it('se tait tant que le sac n’est pas plein', () => {
    const world = woodDelivered();

    world.player.inventory.add('wood', INVENTORY_CAPACITY - 1);

    expect(uselessBagHint(world)).toBeNull();
  });

  it('se tait une fois la mairie debout : tout se dépose en ville', () => {
    const world = builtWorld();

    world.player.inventory.add('coal', INVENTORY_CAPACITY);

    expect(uselessBagHint(world)).toBeNull();
  });

  /*
   * Le playtest du 30/09/2026 : sac à 30 bois, mairie à 0/20, et le refus de
   * récolte disait « aucun chantier n'en attend plus ».
   */
  it('refuse la récolte sans dire « aucun chantier » tant qu’un chantier attend l’objet', () => {
    const world = new World(1);

    world.player.inventory.add('wood', world.carryLimit('wood'));
    expect(world.wanted('wood')).toBeGreaterThan(0);
    expect(harvestRefusedText('wood', world.wanted('wood'))).not.toMatch(/aucun chantier/);
    expect(harvestRefusedText('wood', world.wanted('wood'))).toBe('Assez de bois dans le sac pour les chantiers — allez les livrer');
  });

  it('dit que la ville en a assez, quand c’est elle qui refuse', () => {
    expect(harvestRefusedText('wood', 0, true)).toBe('La ville a assez de bois — Adam n’en ramasse plus en passant');
  });

  it('dit « aucun chantier » quand plus personne n’attend l’objet', () => {
    const world = new World(1);

    expect(world.wanted('coal')).toBe(0);
    expect(harvestRefusedText('coal', world.wanted('coal'))).toBe('Assez de charbon : aucun chantier n’en attend plus');
  });

  it('se dit aussi en anglais', () => {
    setLocale('en');
    try {
      expect(harvestRefusedText('wood', 0, true)).toBe('The town has plenty of wood — Adam stops picking it up');
    } finally {
      setLocale('fr');
    }
  });
});

describe('producteur qui déborde', () => {
  it('une carrière pleine que personne ne vide : Ève conseille un poste de logistique', () => {
    const world = new World(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    const origin = worldToTile(world.player.x, world.player.y);
    let id: EntityId | null = null;

    world.events.on('buildingPlaced', (event) => (id = event.id));
    for (let dy = -6; dy <= 6 && id === null; dy += 1) {
      for (let dx = -6; dx <= 6 && id === null; dx += 1) {
        if (world.canPlace('quarry', origin.tx + dx, origin.ty + dy) !== null) continue;
        world.push({ type: 'placeBuilding', building: 'quarry', tx: origin.tx + dx, ty: origin.ty + dy });
        world.tick();
      }
    }
    for (const [item, amount] of Object.entries(BUILDINGS.quarry.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
    world.push({ type: 'transferToSite', id: id! });
    world.tick();

    const quarry = world.entities.get(id!)!;

    if (quarry.kind !== 'quarry') throw new Error('la carrière ne s’est pas achevée');
    quarry.store.add('stone', quarry.store.freeSpace());
    for (let i = 0; i < 20 * 120 && world.problem(quarry) !== 'storeFull'; i += 1) world.tick();

    expect(world.problem(quarry)).toBe('storeFull');
    expect(tutorialAdvice(world, FRESH, true, 0, null)?.text).toBe(EVE_LINES.hints.storeStuck.replace('{building}', 'carrière'));
  });
});

describe('la nourriture qui fond', () => {
  it('la ferme debout, sans boulangerie : Ève dit que le blé ne se mange pas cru', () => {
    const world = new World(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    const town = world.townStock()!;

    town.remove('food', town.count('food'));
    expect(tutorialAdvice(world, FRESH, true, 0, null)?.text).toBe(EVE_LINES.hints.farm);

    const origin = worldToTile(world.player.x, world.player.y);
    let id: EntityId | null = null;

    world.events.on('buildingPlaced', (event) => (id = event.id));
    for (let dy = -8; dy <= 8 && id === null; dy += 1) {
      for (let dx = -8; dx <= 8 && id === null; dx += 1) {
        if (world.canPlace('farm', origin.tx + dx, origin.ty + dy) !== null) continue;
        world.push({ type: 'placeBuilding', building: 'farm', tx: origin.tx + dx, ty: origin.ty + dy });
        world.tick();
      }
    }
    for (const [item, amount] of Object.entries(BUILDINGS.farm.cost) as [ItemId, number][]) world.player.inventory.add(item, amount);
    world.push({ type: 'transferToSite', id: id! });
    world.tick();

    expect(world.entities.get(id!)?.kind).toBe('farm');
    // La boulangerie s'ouvre au labo : Ève y envoie d'abord.
    expect(tutorialAdvice(world, FRESH, true, 0, null)?.text).toBe(EVE_LINES.hints.labOpen.replace('{building}', BUILDINGS.bakery.label));
    world.researchDone.push('baking');
    expect(tutorialAdvice(world, FRESH, true, 0, null)?.text).toBe(EVE_LINES.hints.bakery);
  });
});

describe('conseil d’attente', () => {
  /** Pose une tour de guet à portée d'Adam et l'achève, sac rempli de son coût. */
  function buildTower(world: World): EntityId {
    const origin = worldToTile(world.player.x, world.player.y);
    const before = new Set(world.entities.keys());

    for (let dy = -4; dy <= 4 && world.entities.size === before.size; dy += 1) {
      for (let dx = -4; dx <= 4 && world.entities.size === before.size; dx += 1) {
        if (world.canPlace('watchtower', origin.tx + dx, origin.ty + dy) !== null) continue;
        world.push({ type: 'placeBuilding', building: 'watchtower', tx: origin.tx + dx, ty: origin.ty + dy });
        world.tick();
      }
    }

    const id = [...world.entities.keys()].find((key) => !before.has(key));

    if (id === undefined) throw new Error('aucune case pour la tour');
    for (const [item, amount] of Object.entries(BUILDINGS.watchtower.cost) as [ItemId, number][]) {
      world.player.inventory.add(item, amount);
    }
    world.push({ type: 'transferToSite', id });
    world.tick();
    if (world.entities.get(id)?.kind !== 'tower') throw new Error('la tour ne s’est pas achevée');
    return id;
  }

  /** La mairie bâtie, une tour debout, de la pierre en ville : rien ne presse avant l'objectif. */
  function waitingWorld(): World {
    const world = builtWorld();

    world.townStock()!.add('stone', 1);
    buildTower(world);
    expect(world.chapter).toBe(2);
    expect(world.clock()?.phase).toBe('day');
    return world;
  }

  it('dit le temps qu’il reste avant l’aube, puis de quoi s’occuper', () => {
    const world = waitingWorld();
    const advice = tutorialAdvice(world, FRESH, true, 0)!;

    expect(advice.text).toMatch(/^Prochaine aube dans \d+ minutes?\. En attendant : /);
    // Une seule tour : la deuxième passe avant le reste.
    expect(advice.text).toContain(EVE_LINES.hints.meanwhileSecondTower);
  });

  it('envoie réparer une tour endommagée avant tout le reste', () => {
    const world = waitingWorld();
    const tower = [...world.entities.values()].find((entity) => entity.kind === 'tower')!;

    if (tower.kind !== 'tower') throw new Error('pas de tour');
    tower.hp -= 1;

    const advice = tutorialAdvice(world, FRESH, true, 0)!;

    expect(advice.text).toContain(
      EVE_LINES.hints.meanwhileRepair.replace('{building}', BUILDINGS.watchtower.label.toLowerCase()),
    );
  });

  it('envoie chercher l’objet le plus bas en ville, deux tours debout', () => {
    const world = waitingWorld();

    buildTower(world);

    const town = world.townStock()!;

    for (const item of ['wood', 'stone', 'coal', 'ironOre'] as const) town.add(item, TOWN_PLENTY - town.available(item));
    town.remove('coal', TOWN_PLENTY - 3);

    expect(tutorialAdvice(world, FRESH, true, 0)?.wants).toBe('coal');
  });

  it('laisse parler l’objectif le soir : une nuit se tient, elle ne s’attend pas', () => {
    const world = waitingWorld();

    world.cycleStartTick -= DAY_CYCLE.day;
    expect(world.clock()?.phase).toBe('dusk');
    expect(tutorialHint(world, FRESH, true, 0)).toBe(hintOf('nights3'));
  });

  it('donne le conseil de l’objectif choisi dans le panneau', () => {
    const world = builtWorld();

    world.townStock()!.add('stone', 1);
    world.cycleStartTick -= DAY_CYCLE.day;
    // Choisi : la palissade ; pas de labo encore, Ève y envoie d'abord.
    expect(tutorialHint(world, FRESH, true, 0, 'palisade')).toBe(EVE_LINES.hints.labOpen.replace('{building}', BUILDINGS.palisade.label));
    expect(tutorialHint(world, FRESH, true, 0, 'nights3')).toBe(hintOf('nights3'));
  });

  it('après la mairie, conseille le premier objectif des fondations', () => {
    const world = hallWorld();

    world.townStock()!.add('stone', 1);
    expect(world.chapter).toBe(1);
    // La maison est au menu de départ : sa réplique telle quelle.
    expect(tutorialHint(world, FRESH, true, 0, 'home')).toBe(hintOf('home'));
  });
});

describe('fil rouge : une seule voix', () => {
  /** La mairie bâtie dans une colonie neuve, puis `chapters` chapitres cochés d'office. */
  function colonyAt(chapters: number): World {
    const world = World.newColony(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();
    for (let i = 1; i < chapters; i += 1) {
      for (const { id } of chapterObjectives(world)) world.objectivesDone.add(id);
      world.tick();
    }
    for (const [item, count] of world.player.inventory.entries()) world.player.inventory.remove(item, count);
    return world;
  }

  /** Les bâtiments et recherches que l'objectif `id` demande, ou ouvre. */
  function topics(id: (typeof OBJECTIVES)[number]['id']): string[] {
    const objective = OBJECTIVES.find((candidate) => candidate.id === id)!;
    const out: string[] = [objective.hint];

    for (const goal of objective.goals) {
      if (goal.type !== 'build') continue;
      out.push(BUILDINGS[goal.building].label);
    }
    return out;
  }

  it.each([1, 2, 3])('chapitre %i : le conseil cite l’objectif choisi, jamais un autre bâtiment', (chapter) => {
    const world = colonyAt(chapter);

    expect(world.chapter).toBe(chapter);
    world.townStock()!.add('stone', 1);

    for (const { id } of chapterObjectives(world)) {
      const advice = tutorialAdvice(world, FRESH, false, 0, id);

      expect(advice, id).not.toBeNull();
      expect(advice!.urgent, id).toBeUndefined();
      expect(topics(id).some((topic) => advice!.text.includes(topic)) || WAITING_DAWN.test(advice!.text), id).toBe(true);
    }
  });

  it('graine neuve, mairie bâtie : Ève parle du labo ou du Bûcheronnage, pas de la tour de guet', () => {
    const world = colonyAt(1);
    const advice = tutorialAdvice(world, FRESH, false, 0)!;

    expect(advice.text).not.toContain(BUILDINGS.watchtower.label);
    expect(advice.text).toMatch(/labo|Bûcheronnage/);
  });

  it('ville à sec sans puits au menu : le chemin du labo d’abord, en alerte, jamais « pose un puits »', () => {
    const world = colonyAt(1);
    const town = world.townStock()!;

    town.remove('water', town.available('water'));
    expect(world.inMenu('well')).toBe(false);

    const advice = tutorialAdvice(world, FRESH, false, 0)!;

    expect(advice.urgent).toBe(true);
    expect(advice.text).not.toBe(EVE_LINES.hints.well);
    expect(advice.text).toContain(BUILDINGS.well.label);
    expect(advice.pointTo).toBe('water');
  });

  it('une vague sans grâce dans la minute et pas de tour : la tour passe devant, en alerte', () => {
    const world = builtWorld();
    const cycle = DAY_CYCLE.day + DAY_CYCLE.dusk + DAY_CYCLE.night + DAY_CYCLE.dawn;

    // Quatrième nuit : plus de grâce. On avance l'horloge jusqu'à la minute qui précède la vague.
    world.cycleStartTick -= 3 * cycle;
    for (let i = 0; i < cycle && !((world.waveForecast()?.ticks ?? Infinity) <= 60 * 20); i += 1) world.cycleStartTick -= 20;

    const forecast = world.waveForecast();

    expect(forecast?.night).toBeGreaterThan(3);
    expect(forecast!.ticks).toBeLessThanOrEqual(60 * 20);

    const advice = tutorialAdvice(world, FRESH, false, 0)!;

    expect(advice.urgent).toBe(true);
    expect(advice.text).toBe(EVE_LINES.hints.tower);
    // Une tour debout, l'urgence tombe : l'objectif reprend la parole.
    expect(tutorialAdvice(world, FRESH, true, 0)?.urgent).toBeUndefined();
  });

  it('jamais de « pose X » quand X n’est pas au menu', () => {
    for (const chapter of [1, 2, 3]) {
      const world = colonyAt(chapter);

      world.townStock()!.add('stone', 1);
      for (const { id } of chapterObjectives(world)) {
        const advice = tutorialAdvice(world, FRESH, false, 0, id);

        for (const [name, proto] of Object.entries(BUILDINGS)) {
          const building = name as keyof typeof BUILDINGS;

          if (world.inMenu(building) || !advice) continue;
          // Nommé seulement dans une phrase du labo, jamais dans une consigne de pose.
          if (advice.text.includes(proto.label)) {
            expect(advice.text, `${id} / ${name}`).toMatch(/labo|« /);
          }
        }
      }
    }
  });
});
