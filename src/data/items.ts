/**
 * Objets du jeu — contenu pur, aucune logique.
 *
 * `as const satisfies Record<string, ItemProto>` : TypeScript vérifie la forme
 * de chaque entrée et dérive l'union des ids. Une faute de frappe dans un
 * ingrédient de recette devient une erreur de compilation.
 *
 * Chaque objet a **une** icône, déclarée dans `data/icons.ts` sous le même
 * id : `ITEM_ICONS` est un `Record<ItemId, …>`, donc oublier l'icône d'un
 * nouvel objet est une erreur de compilation, pas un carré vide à l'écran.
 */

export interface ItemProto {
  /** Libellé affiché. */
  label: string;
  /** Taille de pile — sert aux coffres et à l'affichage, pas à l'inventaire du joueur. */
  stack: number;
}

export const ITEMS = {
  wood: { label: 'Bois', stack: 100 },
  stone: { label: 'Pierre', stack: 100 },
  coal: { label: 'Charbon', stack: 100 },
  ironOre: { label: 'Minerai de fer', stack: 100 },
  food: { label: 'Nourriture', stack: 100 },
  // Le butin des bêtes sauvages : à la mairie, elle devient de la nourriture (`HUNTING`, `data/needs.ts`).
  meat: { label: 'Viande', stack: 100 },
  // Tirée au puits : on la boit, rien d'autre (`data/needs.ts`).
  water: { label: 'Eau', stack: 100 },
  ironPlate: { label: 'Plaque de fer', stack: 50 },
  // Le butin propre aux ennemis : on ne le récolte nulle part, il ne sert qu'au labo de recherche.
  mutantGoo: { label: 'Gelée de mutant', stack: 50 },
  wolfFang: { label: 'Croc de loup', stack: 50 },
  crabClaw: { label: 'Pince de crabe', stack: 50 },
  // Le cœur de la Reine des flaques : un seul par Reine abattue.
  radCore: { label: 'Cœur radioactif', stack: 10 },
  // Les spécialités des régions conquises (`data/regions.ts`) : chacune vient d'un biome, et ne sert qu'au labo.
  amber: { label: 'Ambre', stack: 50 },
  pearl: { label: 'Nacre', stack: 50 },
  quartz: { label: 'Quartz', stack: 50 },
  spore: { label: 'Spore violette', stack: 50 },
} as const satisfies Record<string, ItemProto>;

export type ItemId = keyof typeof ITEMS;

/**
 * Au-delà de ce stock en ville, Adam ne ramasse plus l'objet en passant : la
 * ville en a assez, le sac garde sa place pour ce qui manque. Il en prend
 * encore ce qu'un chantier ou une recette attend, plus sa petite réserve.
 */
export const TOWN_PLENTY = 60;

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export function isItemId(value: string): value is ItemId {
  return value in ITEMS;
}
