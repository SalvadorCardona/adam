/**
 * Ce que la fenêtre d'un bâtiment montre quand on tape une créature : un
 * habitant (enfant, ouvrier, bûcheron, forestier) ou un ennemi (mutant, bête).
 *
 * Son nom — celui d'un habitant (`World.nameFor` : son prénom, ou celui que le joueur lui a donné), le surnom d'un ennemi
 * (`foeName`) —, son portrait (le sprite de son pantin, celui de son sexe),
 * ses points de vie s'il en a, et ce que le jeu sait de lui, en tableau —
 * un libellé, une valeur, une ligne par donnée : son sexe, son âge, son
 * métier ou son espèce, ce qu'il fait, pour qui il travaille, où il dort,
 * ce qu'il porte ; dessous, sa faim, sa soif et son bonheur en jauges.
 * Rien d'inventé : tout se lit dans le monde. Pur : testé sans DOM.
 */

import type { BuildingId } from '../data/buildings.ts';
import { ENEMIES, WILDLIFE } from '../data/enemies.ts';
import type { Sex } from '../data/inhabitants.ts';
import type { ItemId } from '../data/items.ts';
import { NEED_IDS, type NeedId } from '../data/needs.ts';
import type { SpriteId } from '../data/sprites.ts';
import { bioRank, foeName } from '../sim/inhabitants.ts';
import type { EntityId, Mobile, MobileId } from '../sim/types.ts';
import type { Inhabitant, World } from '../sim/world.ts';
import { t } from '../i18n/locale.ts';
import { occupationText } from './personText.ts';

/** Le métier d'un habitant, tel que la fenêtre le nomme. */
type Role = 'free' | 'porter' | 'logistician' | 'builder' | 'lumberjack' | 'forester' | 'farmer' | 'child' | 'exMutant' | 'survivor';

/** Ce qu'on peut ouvrir dans la fenêtre : un bâtiment (ou chantier), ou une créature. */
export type Selection = { kind: 'building'; id: EntityId } | { kind: 'creature'; id: MobileId };

/** Une créature qui a une fenêtre : un habitant ou un ennemi. */
export type Creature = Extract<Mobile, { kind: 'kid' | 'worker' | 'lumberjack' | 'forester' | 'farmer' | 'mutant' | 'beast' }>;

/**
 * Une ligne de la fiche : le libellé à gauche, la valeur à droite. Le sexe
 * a son symbole devant le mot : ♂ ou ♀, dessiné (`art/ui.ts`, pictogramme
 * `male` ou `female`) — le texte le garde pour la lecture d'écran.
 */
export interface CreatureFact {
  label: string;
  value: string;
  symbol?: Sex;
}

/** Le symbole du sexe, en texte : ♂ un homme, ♀ une femme. */
export const SEX_SYMBOLS = { male: '♂', female: '♀' } as const satisfies Record<Sex, string>;

export interface CreatureView {
  name: string;
  /** Le joueur peut-il le renommer ? Un habitant oui, un ennemi non. */
  renamable: boolean;
  /** Le sprite du portrait, celui que le rendu donne à son pantin. */
  portrait: SpriteId;
  /** Une femme ou un homme ; `null` pour un ennemi. */
  sex: Sex | null;
  age: number;
  /** Points de vie : un ennemi en a, un habitant non. */
  hp: { value: number; max: number } | null;
  /** Le tableau : son sexe, son âge, ce qu'il est, ce qu'il fait, où il loge, ce qu'il porte. */
  facts: CreatureFact[];
  /** Ce qu'il porte, s'il porte quelque chose. */
  carry: { item: ItemId; amount: number } | null;
  /** Ses jauges, une par besoin — la faim, la soif — de 0 à 1 ; aucune pour un ennemi. */
  needs: { need: NeedId; value: number }[];
  /** Son bonheur, de 0 à `HAPPINESS.max` ; `null` pour un enfant ou un ennemi. */
  happiness: number | null;
}

export function isCreature(mobile: Mobile): mobile is Creature {
  return (
    mobile.kind === 'kid' ||
    mobile.kind === 'worker' ||
    mobile.kind === 'lumberjack' ||
    mobile.kind === 'forester' ||
    mobile.kind === 'farmer' ||
    mobile.kind === 'mutant' ||
    mobile.kind === 'beast'
  );
}

/** La fiche d'une créature, dans la langue en cours. */
export function creatureView(world: World, creature: Creature): CreatureView {
  return creature.kind === 'mutant' || creature.kind === 'beast' ? foeView(world, creature) : inhabitantView(world, creature);
}

function inhabitantView(world: World, person: Inhabitant): CreatureView {
  const text = t().panel.creature;
  const { field } = text;
  const home = world.entities.get(person.homeId);
  const occupation = occupationText(world.occupation(person));
  const carry = carryOf(person);
  const facts: CreatureFact[] = [
    { label: field.sex, value: text.sex[person.sex], symbol: person.sex },
    { label: field.age, value: text.age(person.age) },
    { label: field.role, value: (person.sex === 'female' ? text.roleFemale : text.role)[roleOf(person)] },
    { label: field.doing, value: occupation.charAt(0).toUpperCase() + occupation.slice(1) },
  ];
  const trait = world.traitFor(person);

  // Son trait et son petit effet, puis sa biographie d’une ligne : tirés de la seed et de son id.
  facts.splice(4, 0, { label: field.trait, value: `${text.trait[trait].name} — ${text.trait[trait].effect}` });

  // Un ouvrier libre ne travaille pour personne : il attend devant la mairie qu'un bâtiment le prenne.
  if (person.kind !== 'worker' || !person.free) facts.push({ label: field.employer, value: home ? t().buildings[home.proto].label : text.homeless });

  // Où il dort : son lit, ou dehors. Un enfant dort à sa nurserie, sans lit à lui.
  if (person.kind !== 'kid') {
    const bed = person.bed === null ? undefined : world.entities.get(person.bed);

    facts.push({ label: field.bed, value: bed ? t().buildings[bed.proto].label : text.outside });
  }

  facts.push({ label: field.bio, value: text.bios[trait][bioRank(world.seed, person.id)]! });
  if (carry) facts.push({ label: field.carry, value: t().panel.recipeAmount(carry.amount, t().items[carry.item]) });
  return {
    name: world.nameFor(person),
    renamable: true,
    portrait: portraitOf(person),
    sex: person.sex,
    age: person.age,
    hp: null,
    facts,
    carry,
    needs: NEED_IDS.map((need) => ({ need, value: person.needs[need] })),
    happiness: person.kind === 'kid' ? null : person.happiness,
  };
}

function foeView(world: World, foe: Extract<Creature, { kind: 'mutant' | 'beast' }>): CreatureView {
  const text = t().panel.creature;
  const { field } = text;
  const facts: CreatureFact[] = [];

  if (foe.kind === 'mutant') {
    facts.push({ label: field.species, value: t().enemies[foe.proto] }, { label: field.age, value: text.age(foe.age) });

    const goal = mutantGoal(world, foe);

    if (foe.emerge > 0) facts.push({ label: field.status, value: text.emerging });
    else if (goal) facts.push({ label: field.target, value: t().buildings[goal].label });
  } else {
    facts.push({ label: field.species, value: t().wildlife[foe.proto] }, { label: field.age, value: text.age(foe.age) });
    if (foe.proto === 'chief') facts.push({ label: field.rank, value: text.chief });
    if (foe.proto === 'spitter') facts.push({ label: field.rank, value: text.spitter });
    facts.push({ label: field.status, value: foe.slam ? text.slamming : text.beast[foe.state] });
  }

  return {
    name: foeName(world.seed, foe.id),
    renamable: false,
    portrait: portraitOf(foe),
    sex: null,
    age: foe.age,
    hp: { value: Math.max(0, Math.ceil(foe.hp)), max: foe.kind === 'mutant' ? ENEMIES[foe.proto].hp : world.beastMaxHp(foe) },
    facts,
    carry: null,
    needs: [],
    happiness: null,
  };
}

/** Le bâtiment sur lequel marche un mutant : la proie de la Reine, la cible de sa vague, sinon la mairie. */
function mutantGoal(world: World, mutant: Extract<Mobile, { kind: 'mutant' }>): BuildingId | null {
  const wanted = mutant.queen?.prey ?? mutant.target;
  const target = wanted === undefined || wanted === null ? undefined : world.entities.get(wanted);

  if (target && target.kind !== 'site') return target.proto;
  return world.entities.get(world.townHallId)?.proto ?? null;
}

function roleOf(person: Inhabitant): Role {
  if (person.kind === 'kid') return 'child';
  if (person.kind === 'lumberjack') return 'lumberjack';
  if (person.kind === 'forester') return 'forester';
  if (person.kind === 'farmer') return 'farmer';
  if (person.free) return 'free';
  if (person.logistician) return 'logistician';
  if (person.builder) return 'builder';
  if (person.exMutant) return 'exMutant';
  if (person.survivor) return 'survivor';
  return 'porter';
}

/** La charge sur la tête d'un porteur, le bois d'un bûcheron qui rentre, la récolte d'un fermier. */
function carryOf(person: Inhabitant): CreatureView['carry'] {
  if (person.kind === 'worker' && person.job?.carried) return { item: person.job.item, amount: person.job.amount };
  if (person.kind === 'lumberjack' && person.load > 0) return { item: 'wood', amount: person.load };
  if (person.kind === 'farmer' && person.state === 'toFarm' && person.load > 0) return { item: 'food', amount: person.load };
  return null;
}

/** Le sprite du pantin, comme `render/mobileLayer.ts` le choisit. */
function portraitOf(creature: Creature): SpriteId {
  switch (creature.kind) {
    case 'mutant':
      return ENEMIES[creature.proto].sprite;
    case 'beast':
      return WILDLIFE[creature.proto].sprite;
    case 'kid':
      return 'kid';
    case 'lumberjack':
      return 'lumberjack';
    case 'forester':
      return 'forester';
    case 'farmer':
      return 'farmer';
    case 'worker':
      if (creature.logistician) return 'logistician';
      if (creature.builder) return 'builder';
      return creature.exMutant ? 'exMutant' : 'worker';
  }
}
