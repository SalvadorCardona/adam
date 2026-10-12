/**
 * Le contenu du jeu en français : ses textes vivent dans `data/`, à côté
 * des chiffres qu'ils racontent, et ce module les reprend tels quels. Le
 * dictionnaire anglais (`en/content.ts`) doit en avoir chaque entrée : une
 * entrée de `data/` sans traduction ne compile pas.
 */

import { BUILDING_CATEGORIES, BUILDINGS, type BuildingId, type BuildingProto } from '../../data/buildings.ts';
import { ACHIEVEMENTS, TROPHIES } from '../../data/achievements.ts';
import { RARE_OFFERS } from '../../data/caravan.ts';
import { ENEMY_BASE } from '../../data/enemyBases.ts';
import { ENEMIES, WILDLIFE } from '../../data/enemies.ts';
import { EVE_LINES } from '../../data/eve.ts';
import { GEAR } from '../../data/gear.ts';
import { ITEMS } from '../../data/items.ts';
import { LORE } from '../../data/lore.ts';
import { OBJECTIVES, type ObjectiveProto } from '../../data/objectives.ts';
import { PERKS } from '../../data/perks.ts';
import { QUESTS, TOOLS } from '../../data/quests.ts';
import { RECIPES } from '../../data/recipes.ts';
import { COMPANION_CLASSES } from '../../data/companions.ts';
import { RESEARCH, RESEARCH_STATS, RESEARCH_THEMES } from '../../data/research.ts';
import { RESOURCES } from '../../data/resources.ts';
import { TEST_SCENARIOS } from '../../data/testScenario.ts';
import { WEAPONS } from '../../data/weapons.ts';
import { WEATHER } from '../../data/weather.ts';
import { PIECES } from '../../data/wardrobe.ts';

/** Les textes d'un niveau de bâtiment : `action` est le verbe du bouton qui y mène. */
interface LevelText {
  label: string;
  description: string;
  action: string;
}

interface BuildingText {
  label: string;
  /** Le nom court de la pancarte, sur la carte. */
  sign: string;
  siteDescription: string;
  description: string;
  effect: string;
  /** Les niveaux au-delà du premier, dans l'ordre de `BUILDINGS[id].upgrades`. */
  upgrades: readonly LevelText[];
}

/** Garde de chaque entrée d'une table ce que `pick` en tire, sous la même clé. */
function mapTable<K extends string, V, R>(table: Record<K, V>, pick: (value: V) => R): Record<K, R> {
  return Object.fromEntries(Object.entries(table).map(([key, value]) => [key, pick(value as V)])) as Record<K, R>;
}

function buildingText(proto: BuildingProto): BuildingText {
  return {
    label: proto.label,
    sign: proto.sign,
    siteDescription: proto.siteDescription,
    description: proto.description,
    effect: proto.effect,
    upgrades: proto.upgrades.map(({ label, description, action }) => ({ label, description, action })),
  };
}

interface ObjectiveText {
  title: string;
  hint: string;
  celebration: string;
  /** Vide : le bandeau dit « Objectif réussi ! ». */
  banner: string;
}

export const content = {
  lore: {
    title: LORE.title,
    pitch: LORE.pitch,
    signal: LORE.signal,
  },
  items: mapTable(ITEMS, (item): string => item.label),
  buildings: mapTable<BuildingId, BuildingProto, BuildingText>(BUILDINGS, buildingText),
  /** Les puces de filtre du menu de construction. */
  buildingCategories: mapTable(BUILDING_CATEGORIES, (label): string => label),
  resources: mapTable(RESOURCES, (resource): string => resource.verb),
  recipes: mapTable(RECIPES, (recipe): string => recipe.label),
  weapons: mapTable(WEAPONS, (weapon): string => weapon.label),
  companionClasses: mapTable(COMPANION_CLASSES, ({ label, effect }): { label: string; effect: string } => ({ label, effect })),
  enemies: mapTable(ENEMIES, (enemy): string => enemy.label),
  wildlife: mapTable(WILDLIFE, (beast): string => beast.label),
  enemyBase: { label: ENEMY_BASE.label, description: ENEMY_BASE.description },
  /** Les arcs d'Adam, du niveau 0 au dernier. */
  gear: GEAR.map(({ label }): string => label),
  /** Les pièces de la garde-robe d'Adam. */
  pieces: mapTable(PIECES, (piece): string => piece.label),
  tools: mapTable(TOOLS, (tool): string => tool.label),
  quests: mapTable(QUESTS, ({ label, give, done }): { label: string; give: string; done: string } => ({ label, give, done })),
  objectives: (OBJECTIVES as readonly ObjectiveProto[]).map(
    ({ title, hint, celebration, banner }): ObjectiveText => ({ title, hint, celebration, banner: banner ?? '' }),
  ),
  eve: EVE_LINES,
  researchStats: mapTable(RESEARCH_STATS, ({ label, unit }): { label: string; unit: string } => ({ label, unit })),
  researchThemes: mapTable(RESEARCH_THEMES, (label): string => label),
  research: mapTable(RESEARCH, ({ label, description }): { label: string; description: string } => ({ label, description })),
  achievements: mapTable(ACHIEVEMENTS, ({ label, description }): { label: string; description: string } => ({ label, description })),
  trophies: mapTable(TROPHIES, ({ label, description }): { label: string; description: string } => ({ label, description })),
  perks: mapTable(PERKS, ({ label, description }): { label: string; description: string } => ({ label, description })),
  weather: mapTable(WEATHER, ({ label, advice }): { label: string; advice: string } => ({ label, advice })),
  rareOffers: mapTable(RARE_OFFERS, (offer): string => offer.label),
  testScenarios: mapTable(TEST_SCENARIOS, (scenario): string => scenario.label),
};
