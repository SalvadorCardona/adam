/**
 * Les ères de la colonie — contenu pur.
 *
 * Quatre paliers, dans l'ordre de la liste : le **Campement** du départ, le
 * **Bourg**, la **Ville**, la **Cité industrielle**. Une sauvegarde d'avant
 * les ères démarre au Campement (`World.era`, 0).
 *
 * On passe à l'ère suivante depuis la fenêtre de la mairie (« Ères », panneau
 * `ui/eraPanel.ts`, commande `advanceEra`) quand tout ce que `requires`
 * demande tient en même temps :
 * - `chapters` : chapitres d'objectifs finis (`data/objectives.ts`) —
 *   l'histoire ouvre la porte, l'ère la franchit ;
 * - `population` : habitants (`World.population()`, Adam et Ève compris) ;
 * - `buildings` : bâtiments finis et debout, par type ;
 * - `research` : recherches clés finies au labo ;
 * - `invest` : ce qu'il faut **investir** au passage, payé d'un coup — le sac
 *   d'abord, puis le stock de la ville.
 *
 * Chaque ère apporte, une fois atteinte :
 * - `opens` : des bâtiments qui existaient déjà et entrent au menu
 *   (`World.openBuildings`) — aucun pour l'instant : les bâtiments de base,
 *   le labo les ouvre dès le Campement (`opens` de `data/research.ts`) ;
 * - les **régions** de son anneau (`REGION_RINGS[].era`, `data/regions.ts`) :
 *   leurs gardiens se montrent, on peut les conquérir — le Campement tient
 *   le premier anneau, le Bourg ouvre le deuxième, la Ville le troisième ;
 * - son **onglet de recherches** au labo : les recherches dont `era` vaut son
 *   index (`data/research.ts`), dont celle qui débloque son nouveau bâtiment
 *   et sa nouvelle chaîne (`resource`) ;
 * - `threat` : des ennemis de plus, chaque nuit, en tête de la vague — ils
 *   sortent de la base la plus proche de la mairie, avec les chefs de la nuit ;
 * - un nouveau visage pour la mairie (morceaux `era1`… du sprite `townHall`).
 *
 * Ajouter une ère = ajouter une entrée ici, ses recherches à `era` sur son
 * index, et le morceau de mairie qui va avec. `validatePrototypes()` vérifie
 * les ids, l'ordre et les déblocages.
 */

import type { BuildingId } from './buildings.ts';
import type { WaveSpec } from './enemies.ts';
import type { ItemId } from './items.ts';
import type { ResearchId } from './research.ts';

export interface EraRequirement {
  /** Chapitres d'objectifs finis (`World.chapter`), au moins. */
  chapters: number;
  /** Habitants de la colonie, au moins. */
  population: number;
  /** Bâtiments finis et debout, par type. */
  buildings: Partial<Record<BuildingId, number>>;
  /** Recherches finies. */
  research: readonly ResearchId[];
  /** Investi au passage : le sac d'abord, puis la ville. */
  invest: Partial<Record<ItemId, number>>;
}

export interface EraProto {
  /** Le nom de l'ère : « Bourg ». */
  label: string;
  /** Une ligne dans le ton du jeu, sous le nom. */
  motto: string;
  /** Ce qu'il faut pour l'atteindre ; `null` pour la première, celle du départ. */
  requires: EraRequirement | null;
  /** Bâtiments existants qui entrent au menu une fois l'ère atteinte. */
  opens: readonly BuildingId[];
  /** La ressource que l'ère fait naître (son bâtiment vient de son onglet de recherches), ou `null`. */
  resource: ItemId | null;
  /** Ennemis ajoutés à chaque nuit, en tête de la vague. */
  threat: WaveSpec;
  /** Une ligne pour le panneau et l'écran de passage : la menace de l'ère. */
  threatLine: string;
}

export const ERAS = [
  {
    label: 'Campement',
    motto: 'Des bâches, un feu, dix paires de bras. On s’accroche.',
    requires: null,
    opens: [],
    resource: null,
    threat: {},
    threatLine: 'Seules les bases mutantes du coin rôdent la nuit.',
  },
  {
    label: 'Bourg',
    motto: 'Des rues, des fours, des voisins : ça sent le pain et la brique chaude.',
    requires: {
      chapters: 3,
      population: 13,
      buildings: { home: 2, nursery: 1 },
      research: [],
      invest: { wood: 40, stone: 30 },
    },
    opens: [],
    resource: 'brick',
    threat: { mutant: 2 },
    threatLine: 'Les mutants flairent le bourg : deux de plus chaque nuit.',
  },
  {
    label: 'Ville',
    motto: 'Des ateliers, des outils, des enfants qui courent : la ville bourdonne.',
    requires: {
      chapters: 6,
      population: 16,
      buildings: { well: 1, lab: 1, brickworks: 1, watchtower: 2 },
      research: ['brickmaking', 'metalworking'],
      invest: { brick: 30, ironPlate: 6, food: 20 },
    },
    opens: [],
    resource: 'tools',
    threat: { brute: 1 },
    threatLine: 'Un gros mutant mène chaque vague.',
  },
  {
    label: 'Cité industrielle',
    motto: 'Cheminées, rails, sirènes : la cité gronde, et tout le désert l’entend.',
    requires: {
      chapters: 8,
      population: 20,
      buildings: { workshop: 1, forge: 1, charcoalKiln: 1, home: 4, constructionPost: 1 },
      research: ['toolmaking'],
      invest: { brick: 60, tools: 20, ironPlate: 20 },
    },
    opens: [],
    resource: 'steel',
    threat: { brute: 2, mutant: 4 },
    threatLine: 'Deux gros mutants et une meute de plus, chaque nuit.',
  },
] as const satisfies readonly EraProto[];

/** L'index de la dernière ère. */
export const LAST_ERA = ERAS.length - 1;

/** L'ère numéro `era`, bornée à la liste. */
export function eraProto(era: number): EraProto {
  return ERAS[Math.max(0, Math.min(LAST_ERA, era))]!;
}
