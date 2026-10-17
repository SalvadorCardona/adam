/**
 * Décor de surface — contenu pur.
 *
 * Le décor ne fait rien : on ne le heurte pas, on ne le récolte pas, les
 * mutants le piétinent. Il dit où l'on est — une prairie fleurie, un désert
 * d'os et de pneus, une dalle de béton jonchée de gravats — et que le monde
 * d'avant a existé.
 *
 * Comme les ressources, il n'est jamais stocké : `sim/terrain.ts` le tire
 * depuis la seed, tuile par tuile, sur les tuiles que la carte laisse nues.
 * Chaque élément est un morceau du sprite `decor` (`art/decor.ts`) ; son id
 * est le nom du morceau.
 */

import type { PartOf } from './sprites.ts';

/** Terrains où le décor peut apparaître : jamais sur l'eau. */
export type DecorTerrain = 'grass' | 'sand' | 'rock';

export interface DecorProto {
  /** Poids relatif du tirage, par terrain. Absent = jamais sur ce terrain. */
  weights: Partial<Record<DecorTerrain, number>>;
}

export const DECOR = {
  flowers: { weights: { grass: 6 } },
  tuft: { weights: { grass: 8, sand: 1 } },
  mushrooms: { weights: { grass: 2 } },
  puddle: { weights: { grass: 1, rock: 1 } },
  deadBush: { weights: { grass: 1, sand: 5 } },
  bones: { weights: { grass: 1, sand: 3, rock: 2 } },
  tire: { weights: { grass: 1, sand: 3 } },
  sign: { weights: { sand: 2, rock: 1 } },
  rubble: { weights: { grass: 1, sand: 1, rock: 6 } },
  barrel: { weights: { grass: 1, sand: 1, rock: 3 } },
  ruin: { weights: { grass: 1, rock: 2 } },
  /** Jamais tiré : le chantier de la mairie le pose (`sim/camp.ts`), la mairie bâtie l'éteint. */
  campfire: { weights: {} },
} as const satisfies Record<PartOf<'decor'>, DecorProto>;

export type DecorId = keyof typeof DECOR;

export const DECOR_IDS = Object.keys(DECOR) as DecorId[];

/** Part des tuiles nues qui portent un élément de décor. */
export const DECOR_DENSITY = 0.07;
