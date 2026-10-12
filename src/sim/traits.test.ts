import { describe, expect, it } from 'vitest';
import { TILE_SIZE } from '../core/grid.ts';
import { HAPPINESS } from '../data/housing.ts';
import { BIO_COUNT, REACTIONS, TRAITS, TRAIT_IDS, TRAIT_INHERIT } from '../data/traits.ts';
import { NAME_MAX, bioRank, bornTrait, cleanName, nameOf, traitOf } from './inhabitants.ts';
import { moodCauses, moodPace, nightlyMood, traitPace } from './housing.ts';
import { drainNeeds, freshNeeds } from './needs.ts';
import { decodeSave, encodeSave } from './save.ts';
import type { Worker } from './types.ts';
import { World } from './world.ts';

function workers(world: World): Worker[] {
  return [...world.mobiles.values()].filter((mobile): mobile is Worker => mobile.kind === 'worker');
}

describe('traits des habitants', () => {
  it('le trait se tire de la seed et de l’id : le même à chaque fois, et tous les traits sortent', () => {
    const seen = new Set<string>();

    for (let id = 1; id <= 200; id += 1) {
      expect(traitOf(42, id)).toBe(traitOf(42, id));
      seen.add(traitOf(42, id));
    }
    expect([...seen].sort()).toEqual([...TRAIT_IDS].sort());
  });

  it('les dix ouvriers du départ ont un trait de la seed', () => {
    const world = new World(7);
    const crew = workers(world);

    expect(crew.length).toBeGreaterThan(0);
    for (const worker of crew) expect(worker.trait).toBe(traitOf(world.seed, worker.id));
  });

  it('un enfant hérite parfois d’un trait d’adulte, jamais d’un autre que le sien ou celui d’un parent', () => {
    const parents = ['dreamer'] as const;
    let inherited = 0;
    const draws = 2000;

    for (let id = 1; id <= draws; id += 1) {
      const trait = bornTrait(9, id, parents);

      if (trait === 'dreamer' && traitOf(9, id) !== 'dreamer') inherited += 1;
      else expect(trait).toBe(traitOf(9, id));
    }
    // Environ TRAIT_INHERIT des tirages, moins ceux dont le trait propre est déjà celui du parent.
    expect(inherited).toBeGreaterThan(draws * TRAIT_INHERIT * 0.5);
    expect(inherited).toBeLessThan(draws * TRAIT_INHERIT);
    expect(bornTrait(9, 5, [])).toBe(traitOf(9, 5));
  });

  it('chaque trait a un effet de jeu léger', () => {
    expect(traitPace('hardworking')).toBeGreaterThan(1);
    expect(traitPace('dreamer')).toBeLessThan(1);
    expect(traitPace(undefined)).toBe(1);
    for (const id of TRAIT_IDS) expect(Math.abs(TRAITS[id].pace - 1)).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('le gourmand a faim plus vite, le costaud moins', () => {
    const base = freshNeeds().needs;
    const glutton = freshNeeds().needs;
    const sturdy = freshNeeds().needs;

    drainNeeds(base, true);
    drainNeeds(glutton, true, 'glutton');
    drainNeeds(sturdy, true, 'sturdy');
    expect(glutton.hunger).toBeLessThan(base.hunger);
    expect(sturdy.hunger).toBeGreaterThan(base.hunger);
    expect(glutton.thirst).toBe(base.thirst);
  });

  it('la bonne humeur accélère un peu, la mauvaise ralentit', () => {
    expect(moodPace(HAPPINESS.contentFrom)).toBe(HAPPINESS.contentPace);
    expect(moodPace(HAPPINESS.start)).toBe(1);
    expect(moodPace(0)).toBe(HAPPINESS.unhappyPace);
  });

  it('le moral de l’aube suit la faim, la soif, le lit et la peur', () => {
    const fed = freshNeeds();
    const starved = { ...fed, needs: { hunger: 0, thirst: 1 } };

    expect(moodCauses({ bed: 3, ...fed })).toEqual(['bed']);
    expect(moodCauses({ bed: 3, ...starved })).toEqual(['bed', 'hungry']);
    expect(moodCauses({ bed: null, ...fed }, true)).toEqual(['outside', 'scared']);
    // Un peureux a deux fois plus peur qu’un autre.
    const calm = nightlyMood(50, ['scared']);
    const fearful = nightlyMood(50, ['scared'], 'fearful');

    expect(50 - fearful).toBeCloseTo((50 - calm) * TRAITS.fearful.fear);
    // Un costaud a moins peur, et une nuit sans danger ne change rien au trait.
    expect(50 - nightlyMood(50, ['scared'], 'sturdy')).toBeCloseTo((50 - calm) * TRAITS.sturdy.fear);
    expect(nightlyMood(50, ['bed'], 'dreamer')).toBe(nightlyMood(50, ['bed']));
  });

  it('une biographie existe pour chaque rang tiré', () => {
    for (let id = 1; id <= 100; id += 1) expect(bioRank(3, id)).toBeLessThan(BIO_COUNT);
  });
});

describe('noms', () => {
  it('un nom donné est nettoyé et coupé', () => {
    expect(cleanName('  Pierre   Paul  ')).toBe('Pierre Paul');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(40))).toHaveLength(NAME_MAX);
  });

  it('renommer un ouvrier change son nom, le nom vide rend le prénom d’origine', () => {
    const world = new World(11);
    const worker = workers(world)[0]!;
    const original = nameOf(world.seed, worker.id, worker.sex);

    expect(world.nameFor(worker)).toBe(original);
    world.push({ type: 'renameInhabitant', id: worker.id, name: ' Bob ' });
    world.tick();
    expect(world.nameFor(worker)).toBe('Bob');
    world.push({ type: 'renameInhabitant', id: worker.id, name: '' });
    world.tick();
    expect(world.nameFor(worker)).toBe(original);
  });

  it('personne d’autre qu’un habitant ne se renomme', () => {
    const world = new World(11);

    world.push({ type: 'renameInhabitant', id: 99999, name: 'Rien' });
    expect(() => world.tick()).not.toThrow();
  });

  it('le nom et le trait survivent à la sauvegarde', () => {
    const world = new World(11);
    const worker = workers(world)[0]!;

    world.push({ type: 'renameInhabitant', id: worker.id, name: 'Bob' });
    world.tick();

    const loaded = decodeSave(encodeSave(world, 1));

    if (!loaded.ok) throw new Error(`sauvegarde refusée : ${loaded.reason}`);

    const again = loaded.world.mobiles.get(worker.id) as Worker;

    expect(again.alias).toBe('Bob');
    expect(again.trait).toBe(worker.trait);
  });

  it('une ancienne sauvegarde sans trait donne à chacun celui de la seed, et son prénom', () => {
    const world = new World(11);
    const file = JSON.parse(encodeSave(world, 1)) as { state: { mobiles: Record<string, unknown>[] } };

    for (const mobile of file.state.mobiles) {
      delete mobile['trait'];
      delete mobile['alias'];
    }

    const loaded = decodeSave(JSON.stringify(file));

    if (!loaded.ok) throw new Error(`sauvegarde refusée : ${loaded.reason}`);

    const crew = workers(loaded.world);

    expect(crew.length).toBeGreaterThan(0);
    for (const worker of crew) {
      expect(worker.trait).toBe(traitOf(loaded.world.seed, worker.id));
      expect(worker.alias).toBeUndefined();
      expect(loaded.world.nameFor(worker)).toBe(nameOf(loaded.world.seed, worker.id, worker.sex));
    }
  });
});

describe('bulles de réaction', () => {
  it('la peur : un mutant à portée fait peur aux ouvriers dehors, puis ça passe', () => {
    const world = new World(5);
    const crew = workers(world);
    const afraid = (): number => crew.filter((worker) => world.reaction(worker) === 'scared').length;
    const near = crew[0]!;

    expect(afraid()).toBe(0);
    world.mobiles.set(9000, {
      kind: 'mutant',
      id: 9000,
      proto: 'mutant',
      hp: 5,
      age: 1,
      attackCooldown: 0,
      emerge: 0,
      x: near.x + TILE_SIZE,
      y: near.y,
      prevX: near.x + TILE_SIZE,
      prevY: near.y,
      facing: 'down',
      moving: false,
    });
    for (let i = 0; i < 25; i += 1) world.tick();
    expect(afraid()).toBeGreaterThan(0);
    // Le mutant parti, la bulle s'éteint d'elle-même.
    world.mobiles.delete(9000);
    for (let i = 0; i < REACTIONS.fearTicks + 25; i += 1) world.tick();
    expect(afraid()).toBe(0);
  });

  it('la joie : une naissance fait sourire un ouvrier sur trois environ, un instant', () => {
    const world = new World(5);
    const crew = workers(world);

    (world as unknown as { joy: { tick: number; kidId: number } }).joy = { tick: world.tickCount, kidId: 12345 };

    const joyful = crew.filter((worker) => world.reaction(worker) === 'joyful');

    expect(joyful.length).toBeLessThan(crew.length);
    for (let i = 0; i < REACTIONS.joyTicks + 1; i += 1) world.tick();
    for (const worker of crew) expect(world.reaction(worker)).not.toBe('joyful');
  });
});
