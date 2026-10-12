import { describe, expect, it } from 'vitest';
import { ENEMIES, WILDLIFE } from '../data/enemies.ts';
import { TEST_SCENARIOS } from '../data/testScenario.ts';
import { setLocale, t } from '../i18n/locale.ts';
import { foeName, nameOf } from '../sim/inhabitants.ts';
import { stageScenario } from '../sim/testScenario.ts';
import type { Beast, Mutant } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { creatureView, isCreature, type Creature, type CreatureView } from './creatureView.ts';

/** La petite base de test, le temps que ses ouvriers sortent. */
function base(): World {
  const world = stageScenario(TEST_SCENARIOS.base);

  for (let i = 0; i < 40; i += 1) world.tick();
  return world;
}

function first<K extends Creature['kind']>(world: World, kind: K): Extract<Creature, { kind: K }> {
  const found = [...world.mobiles.values()].find((mobile) => mobile.kind === kind);

  if (!found) throw new Error(`aucun ${kind} dans la base de test`);
  return found as Extract<Creature, { kind: K }>;
}

function mutant(world: World, hp: number): Mutant {
  const hall = world.entities.get(world.townHallId)!;
  const x = hall.tx * 32 - 200;
  const y = hall.ty * 32;
  const foe: Mutant = { kind: 'mutant', id: 9_000, proto: 'mutant', x, y, prevX: x, prevY: y, facing: 'down', moving: true, hp, age: 41, attackCooldown: 0, emerge: 0 };

  world.mobiles.set(foe.id, foe);
  return foe;
}

/** Le tableau d'une fiche, en lignes « libellé : valeur ». */
function rows(view: CreatureView): string[] {
  return view.facts.map(({ label, value }) => `${label} : ${value}`);
}

describe('creatureView', () => {
  it('un habitant : un tableau — son sexe d’abord, son âge, son métier, ce qu’il fait, pour qui il travaille, où il dort — pas de points de vie', () => {
    const world = base();
    const jack = first(world, 'lumberjack');
    const view = creatureView(world, jack);
    const camp = world.entities.get(jack.homeId)!;

    expect(view.name).toBe(nameOf(world.seed, jack.id, jack.sex));
    expect(view.sex).toBe(jack.sex);
    expect(view.age).toBe(jack.age);
    expect(view.portrait).toBe('lumberjack');
    expect(view.hp).toBeNull();
    expect(camp.proto).toBe('lumberCamp');
    expect(rows(view).slice(0, 3)).toEqual([
      `Sexe : ${jack.sex === 'male' ? 'Homme' : 'Femme'}`,
      `Âge : ${jack.age} ans — un de plus à chaque aube`,
      `Métier : ${jack.sex === 'male' ? 'Bûcheron' : 'Bûcheronne'}`,
    ]);
    expect(view.facts[3]!.label).toBe('Activité');
    // Son trait, puis sa petite biographie ; le champ de nom est ouvert.
    expect(view.facts[4]!.label).toBe('Trait');
    expect(view.facts.map((fact) => fact.label)).toContain('Biographie');
    expect(view.renamable).toBe(true);
    expect(rows(view)).toContain('Travaille pour : Cabane de bûcheron');
    // La petite base n'a pas de Maison : il dort dehors, et son bonheur se lit sous ses jauges.
    expect(rows(view)).toContain('Dort à : dehors, faute de lit');
    expect(view.happiness).toBe(jack.happiness);
  });

  it('la ligne Sexe dit ♂ pour un homme, ♀ pour une femme, et le métier s’accorde', () => {
    const world = base();
    const jack = first(world, 'lumberjack');

    jack.sex = 'male';
    expect(creatureView(world, jack).facts[0]).toEqual({ label: 'Sexe', value: 'Homme', symbol: 'male' });
    expect(creatureView(world, jack).facts[2]!.value).toBe('Bûcheron');
    jack.sex = 'female';
    expect(creatureView(world, jack).facts[0]).toEqual({ label: 'Sexe', value: 'Femme', symbol: 'female' });
    expect(creatureView(world, jack).facts[2]!.value).toBe('Bûcheronne');
    expect(creatureView(world, jack).sex).toBe('female');
  });

  it('dit dans quelle maison dort un habitant qui a un lit', () => {
    const world = base();
    const jack = first(world, 'lumberjack');
    const house = [...world.entities.values()].find((entity) => entity.kind !== 'site')!;

    jack.bed = house.id;
    expect(rows(creatureView(world, jack))).toContain(`Dort à : ${t().buildings[house.proto].label}`);
  });

  it('dit ce que porte un bûcheron qui rentre', () => {
    const world = base();
    const jack = first(world, 'lumberjack');

    jack.load = 3;
    expect(creatureView(world, jack).carry).toEqual({ item: 'wood', amount: 3 });
    expect(rows(creatureView(world, jack)).at(-1)).toBe('Porte : 3 bois');
  });

  it('un mutant : son surnom, son âge, son espèce, ses points de vie et sa cible', () => {
    const world = base();
    const foe = mutant(world, 2);
    const view = creatureView(world, foe);

    expect(view.name).toBe(foeName(world.seed, foe.id));
    expect(view.age).toBe(41);
    expect(view.portrait).toBe('mutant');
    expect(view.hp).toEqual({ value: 2, max: ENEMIES.mutant.hp });
    expect(view.sex).toBeNull();
    expect(rows(view)).toEqual(['Espèce : Mutant radioactif', 'Âge : 41 ans — un de plus à chaque aube', 'Marche sur : Mairie']);
  });

  it('une bête : son espèce et son humeur', () => {
    const world = base();
    const wolf: Beast = {
      kind: 'beast', id: 9_001, proto: 'wolf', x: 0, y: 0, prevX: 0, prevY: 0, facing: 'down', moving: false,
      hp: 1, age: 4, denId: 0, homeX: 0, homeY: 0, state: 'chase', dirX: 0, dirY: 0, wanderTicks: 0, attackCooldown: 0,
    };

    const view = creatureView(world, wolf);

    expect(view).toMatchObject({ age: 4, hp: { value: 1, max: WILDLIFE.wolf.hp } });
    expect(rows(view)).toEqual(['Espèce : Loup indigo', 'Âge : 4 ans — un de plus à chaque aube', 'État : Charge Adam !']);
  });

  it('parle anglais quand la langue change', () => {
    const world = base();

    setLocale('en');
    try {
      expect(rows(creatureView(world, mutant(world, 3)))).toEqual([
        'Species : Radioactive mutant',
        'Age : 41 years old — one more at every dawn',
        'Marching on : Town hall',
      ]);
    } finally {
      setLocale('fr');
    }
  });

  it('n’ouvre que les habitants et les ennemis', () => {
    const world = base();

    expect(isCreature(first(world, 'worker'))).toBe(true);
    expect(isCreature(mutant(world, 3))).toBe(true);
    expect([...world.mobiles.values()].filter((mobile) => mobile.kind === 'eve' || mobile.kind === 'pickup').some(isCreature)).toBe(false);
  });
});
