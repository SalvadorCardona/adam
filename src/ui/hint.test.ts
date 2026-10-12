import { describe, expect, it } from 'vitest';
import { BUILDINGS, REPAIR } from '../data/buildings.ts';
import { worldToTile } from '../core/grid.ts';
import { DAY_CYCLE } from '../data/dayNight.ts';
import { EVE, EVE_LINES } from '../data/eve.ts';
import { TOWN_PLENTY, type ItemId } from '../data/items.ts';
import { OBJECTIVES } from '../data/objectives.ts';
import type { EntityId } from '../sim/types.ts';
import { World } from '../sim/world.ts';
import { setLocale } from '../i18n/locale.ts';
import { INVENTORY_CAPACITY } from '../sim/player.ts';
import { harvestRefusedText, tutorialAdvice, tutorialHint, uselessBagHint, type HintProgress } from './hint.ts';

const FRESH: HintProgress = { harvestedWood: false, harvestedStone: false, delivered: false, repaired: false };

/** Le conseil d'une nuit à tenir, de jour : le temps qu'il reste avant l'aube. */
const WAITING_DAWN = /^Prochaine aube dans \d+ minutes?\./;

/** Un monde dont la mairie est bâtie : le sac livré, le dernier objet l'achève. */
function builtWorld(): World {
  const world = new World(1);

  world.player.inventory.add('wood', 25);
  world.player.inventory.add('stone', 12);
  world.push({ type: 'transferToSite', id: world.townHallId });
  world.tick();
  return world;
}

describe('tutorialHint', () => {
  it('commence par le bois du chantier de la mairie', () => {
    expect(tutorialHint(new World(1), FRESH, false, 0)).toBe(EVE_LINES.hints.wood);
  });

  it('passe à la tour de guet une fois la mairie bâtie, sans autre action que la livraison', () => {
    const world = new World(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    expect(world.entities.get(world.townHallId)?.kind).toBe('townHall');
    expect(tutorialHint(world, FRESH, false, 0)).toBe(EVE_LINES.hints.tower);
  });

  it('dans une colonie neuve, la tour passe par le labo : le bâtir, puis y lancer le Guet', () => {
    const world = World.newColony(1);

    world.player.inventory.add('wood', 25);
    world.player.inventory.add('stone', 12);
    world.push({ type: 'transferToSite', id: world.townHallId });
    world.tick();

    const tower = BUILDINGS.watchtower.label;

    expect(tutorialHint(world, FRESH, false, 0)).toBe(EVE_LINES.hints.labOpen.replace('{building}', tower));

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
    expect(tutorialHint(world, FRESH, false, 0)).toBe(EVE_LINES.hints.labResearch.replace('{research}', 'Guet').replace('{building}', tower));
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
    expect(tutorialHint(world, FRESH, true, 0)).toBe(EVE_LINES.hints.quarry);
    // Pendant une vague, l'arc d'abord.
    expect(tutorialHint(world, FRESH, true, 1)).not.toBe(EVE_LINES.hints.quarry);

    world.townStock()!.add('stone', 1);
    expect(tutorialHint(world, FRESH, true, 0)).toMatch(WAITING_DAWN);
  });

  it('apprend à réparer la mairie abîmée entre deux vagues, tant qu’Ève n’est pas là', () => {
    const world = builtWorld();
    const hall = world.entities.get(world.townHallId);

    if (hall?.kind !== 'townHall') throw new Error('la mairie devrait être bâtie');
    world.townStock()!.add('stone', 1);
    hall.hp -= REPAIR.hp;

    // Pas de bois sous la main : Ève envoie en chercher.
    world.player.inventory.remove('wood', world.player.inventory.count('wood'));
    world.townStock()!.remove('wood', world.townStock()!.available('wood'));
    expect(tutorialAdvice(world, FRESH, true, 0)).toEqual({ text: EVE_LINES.hints.repairFetch, wants: REPAIR.item });

    world.player.inventory.add(REPAIR.item, 1);
    expect(tutorialHint(world, FRESH, true, 0)).toBe(EVE_LINES.hints.repair);
    // Pendant la vague, l'arc d'abord ; une fois qu'Adam sait réparer, elle se tait
    // et c'est l'objectif en cours qui parle.
    expect(tutorialHint(world, FRESH, true, 1)).not.toBe(EVE_LINES.hints.repair);
    expect(tutorialHint(world, { ...FRESH, repaired: true }, true, 0)).toMatch(WAITING_DAWN);
  });

  it('annonce la forge une fois débloquée, et envoie chercher du charbon', () => {
    const world = builtWorld();

    // De la pierre en ville : Ève ne parle pas de carrière, c'est l'attente de l'objectif en cours qui parle.
    world.townStock()!.add('stone', 1);
    expect(world.objective).toBe(1);
    expect(tutorialHint(world, FRESH, true, 0)).toMatch(WAITING_DAWN);

    // Tant qu'Ève annonce son arrivée par radio, c'est elle qui parle d'abord ; puis elle envoie au labo.
    world.night = EVE.arrivalNight;
    expect(tutorialHint(world, FRESH, true, 0)).toBe(EVE_LINES.hints.labForge);
    world.researchDone.push('metalworking');
    expect(tutorialAdvice(world, FRESH, true, 0)?.wants).toBe('coal');
    // Pendant une vague, l'arc d'abord.
    expect(tutorialAdvice(world, FRESH, true, 3)?.wants).not.toBe('coal');
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
    expect(world.objective).toBe(1);
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
    expect(tutorialHint(world, FRESH, true, 0)).toBe(OBJECTIVES[1].hint);
  });
});
