/**
 * Pourquoi « Poser » est grisé — en une ligne, sous le nom du bâtiment.
 *
 * Un bouton qui se grise sans rien dire laisse deviner : c'est l'arbre ?
 * l'eau ? la distance ? Le fantôme recouvre souvent ce qui gêne. La
 * simulation connaît le motif et les cases (`World.placementBlock`) ; ici on
 * le dit, et quand c'est un arbre ou un rocher on dit aussi le remède : Adam
 * n'a qu'à le heurter. Une foreuse hors de son assise : on dit sa règle —
 * moitié filon, moitié herbe (`footingText`) —, et le posable dit ce
 * qu'elle extraira (`placementOutput`)..
 *
 * Fonction pure, sans DOM : `buildMenu.ts` l'affiche, les tests la lisent.
 */

import { BUILDINGS, type BuildingId } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import type { ResourceId } from '../data/resources.ts';
import { t } from '../i18n/locale.ts';
import type { PlacementRejection } from '../sim/commands.ts';
import { footingHalf } from '../sim/footing.ts';
import type { PlacementBlock, World } from '../sim/world.ts';

export interface PlacementReason {
  /** Le motif : « Un arbre gêne ». */
  text: string;
  /** Le remède, s'il y en a un à portée de main : « Adam peut le couper ». */
  remedy: string | null;
}

type SimpleRejection = Exclude<PlacementRejection, 'resource' | 'footing' | 'nearHall' | 'shore' | 'enemyZone' | 'polluted' | 'radioactive'>;

/** Une entrée du dictionnaire (remède '' = aucun) en motif affichable. */
function reason(entry: { text: string; remedy: string }): PlacementReason {
  return { text: entry.text, remedy: entry.remedy === '' ? null : entry.remedy };
}

/** Un motif sans remède : l'eau, la distance, le plan… */
function simple(rejection: SimpleRejection): PlacementReason {
  return { text: t().panel.placement[rejection], remedy: null };
}

export function placementReason(block: PlacementBlock, world: World): PlacementReason {
  const placement = t().panel.placement;

  // Les filons se voient en mode construction, même sous les rochers qui les couvrent.
  if (block.reason === 'footing') return { text: footingText(block.ore ?? null), remedy: placement.footing.remedy };
  // L'antenne se dresse loin : le cercle de la mairie montre jusqu'où.
  if (block.reason === 'nearHall') return reason(placement.nearHall);
  // Le puits puise dans la rivière : il faut le coller à l'eau.
  if (block.reason === 'shore') return reason(placement.shore);
  // La terre polluée attend une station de dépollution ; la radioactive, rien pour l'instant.
  if (block.reason === 'polluted' || block.reason === 'radioactive') return reason(placement[block.reason]);
  // Une base mutante tient la zone : il faut l'abattre, avec un arc de son niveau.
  if (block.reason === 'enemyZone') return reason(placement.enemyZone);
  if (block.reason !== 'resource') return simple(block.reason);

  const found = block.tiles
    .map(({ tx, ty }) => world.resources.at(tx, ty)?.id)
    .filter((id): id is ResourceId => id !== undefined);

  return resourceReason(found);
}

/** Arbres, rochers, ou les deux ; un seul, ou plusieurs. */
function resourceReason(found: readonly ResourceId[]): PlacementReason {
  const trees = found.filter((id) => id === 'tree').length;
  const rocks = found.length - trees;
  const many = found.length > 1;
  const placement = t().panel.placement;

  if (trees > 0 && rocks > 0) return reason(placement.treesAndRocks);
  if (rocks > 0) return reason(many ? placement.rocks : placement.rock);
  return reason(many ? placement.trees : placement.tree);
}

/**
 * La règle d'assise de la foreuse, dite avec le filon qu'elle couvre :
 * « Une foreuse de fer se pose sur 2 cases de fer et 2 cases d'herbe. » Le
 * HUD la reprend quand le tick refuse la pose.
 */
export function footingText(ore: ItemId | null): string {
  const { width, height } = BUILDINGS.drill;
  const half = footingHalf(width, height);
  const veins: Partial<Record<ItemId, string>> = t().panel.placement.veins;
  const vein = ore === null ? null : (veins[ore] ?? t().items[ore].toLowerCase());

  return t().panel.placement.footing.text(vein, half, width * height - half);
}

/** Ce que produira le bâtiment posé là : « Extraira : Pierre » pour une foreuse, `null` sinon. */
export function placementOutput(building: BuildingId, tx: number, ty: number, world: World): string | null {
  if (BUILDINGS[building].kind !== 'drill') return null;

  const item = world.oreUnder(building, tx, ty);

  return item ? t().panel.placement.extracts(t().items[item]) : null;
}
