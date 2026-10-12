/**
 * Les régions de la carte — contenu pur.
 *
 * La carte se découpe en **régions** autour de la mairie : la **prairie de
 * départ**, un disque de `HOME_REGION.radius` tuiles, puis des anneaux
 * (`REGION_RINGS`) partagés en secteurs, aux bords ondulés par un bruit de la
 * seed. Rien n'est stocké : la seed redonne les mêmes régions
 * (`sim/regions.ts`).
 *
 * Chaque région prend le **biome** qui la marque le plus, lu dans ce que la
 * génération y pose déjà : la forêt (le cœur des massifs), la côte (sable et
 * eau), la montagne (roche et filons), les terres polluées. Le score d'un
 * biome est sa part de la région, rapportée à sa part moyenne dans toutes
 * les régions : un biome rare l'emporte là où il est dense.
 *
 * Une région non conquise est voilée et inconstructible (ni bâtiment ni
 * route). Pour la conquérir, il faut vaincre son **gardien** — le mini-boss
 * de son biome (`BIOMES[].guardian`), qui veille sur son repaire —, et pour
 * qu'il se montre, que la colonie ait atteint l'**ère** de son anneau
 * (`ERAS`, `REGION_RINGS[].era`). Plus l'anneau est loin, plus le gardien
 * est coriace (`REGION_RINGS[].hpScale`, `damageScale`).
 *
 * Conquise, la région rapporte sa **spécialité** : un objet qu'on ne trouve
 * nulle part ailleurs (`BIOMES[].specialty`), que le gardien lâche en tombant
 * et qu'Adam déniche en récoltant dans les régions conquises de ce biome
 * (`findChance`). Le labo en fait des recherches (`data/research.ts`).
 */

import type { WildlifeId } from './enemies.ts';
import type { ItemId } from './items.ts';

/** Les biomes d'une région à conquérir ; la prairie (`meadow`) n'est que celle du départ. */
export type BiomeId = 'meadow' | 'forest' | 'coast' | 'mountain' | 'wasteland';

export interface BiomeProto {
  label: string;
  /** Le gardien de ses régions : une espèce de `WILDLIFE` à l'habitat `region`. */
  guardian: WildlifeId | null;
  /** Ce que ses régions conquises rapportent, et que le gardien lâche. */
  specialty: ItemId | null;
  /** Chance, par unité récoltée par Adam dans une région conquise de ce biome, d'y dénicher sa spécialité. */
  findChance: number;
}

export const BIOMES = {
  meadow: { label: 'Prairie', guardian: null, specialty: null, findChance: 0 },
  forest: { label: 'Forêt', guardian: 'greatWolf', specialty: 'amber', findChance: 0.08 },
  coast: { label: 'Côte', guardian: 'giantCrab', specialty: 'pearl', findChance: 0.08 },
  mountain: { label: 'Montagne', guardian: 'colossus', specialty: 'quartz', findChance: 0.08 },
  wasteland: { label: 'Terres polluées', guardian: 'sludgeKing', specialty: 'spore', findChance: 0.08 },
} as const satisfies Record<BiomeId, BiomeProto>;

/** Les biomes qu'une région à conquérir peut prendre, dans l'ordre où l'égalité se départage. */
export const CONQUEST_BIOMES = ['forest', 'coast', 'mountain', 'wasteland'] as const satisfies readonly BiomeId[];

/**
 * Les ères de la colonie, lues dans la chaîne d'objectifs : une ère est
 * atteinte dès que `objective` objectifs sont réussis. Elles ne sont pas de
 * l'état — `World.objective` suffit.
 */
export interface EraProto {
  label: string;
  /** Objectifs réussis qu'il faut pour l'atteindre (`data/objectives.ts`). */
  objective: number;
}

export const ERAS = [
  // Dès le départ.
  { label: 'Fondation', objective: 0 },
  // Trois nuits tenues : Ève est là.
  { label: 'Colonie', objective: 2 },
  // Acte I terminé.
  { label: 'Signal', objective: 6 },
] as const satisfies readonly EraProto[];

/** La prairie de départ : un disque autour du centre de la mairie, toujours conquis. */
export const HOME_REGION = {
  /** Rayon, en tuiles : la clairière, les filons du foyer (≤ 20) et le premier pas au-delà. */
  radius: 30,
  biome: 'meadow' satisfies BiomeId,
} as const;

/** Un anneau de régions : sa bande de distance à la mairie, ses secteurs, et ce que valent ses gardiens. */
export interface RegionRing {
  /** Bord intérieur, en tuiles depuis le centre de la mairie (le bord extérieur de l'anneau précédent). */
  inner: number;
  /** Bord extérieur, en tuiles ; le dernier anneau ne s'arrête pas : c'est la borne de son échantillon de biome. */
  outer: number;
  /** Secteurs, de même angle, décalés d'un angle tiré de la seed. */
  sectors: number;
  /** Distance du repaire du gardien au centre de la mairie, en tuiles. */
  lair: number;
  /** Ère qu'il faut avoir atteinte pour que ses gardiens se montrent (indice dans `ERAS`). */
  era: number;
  /** Multiplicateurs des points de vie et des coups du gardien de son biome. */
  hpScale: number;
  damageScale: number;
  /** Prestige et XP de la conquête, en plus de ceux du gardien (`KILL_PRESTIGE`, `KILL_XP`). */
  prestige: number;
  xp: number;
  /** Exemplaires de la spécialité que le gardien lâche en tombant, bornes comprises. */
  spoils: { min: number; max: number };
}

export const REGION_RINGS = [
  { inner: HOME_REGION.radius, outer: 56, sectors: 5, lair: 44, era: 0, hpScale: 1, damageScale: 1, prestige: 15, xp: 25, spoils: { min: 3, max: 4 } },
  { inner: 56, outer: 80, sectors: 6, lair: 67, era: 1, hpScale: 1.8, damageScale: 1.5, prestige: 30, xp: 50, spoils: { min: 4, max: 6 } },
  { inner: 80, outer: 112, sectors: 8, lair: 94, era: 2, hpScale: 2.8, damageScale: 2, prestige: 60, xp: 90, spoils: { min: 6, max: 8 } },
] as const satisfies readonly RegionRing[];

/**
 * La géométrie des bords et du repaire.
 * - `warpCell`, `angleWarp`, `radiusWarp` : un bruit lent tord les bords des
 *   secteurs (en radians) et des anneaux (en tuiles) — des régions, pas des
 *   parts de tarte ;
 * - `sampleStep` : pas, en tuiles, de l'échantillon qui juge le biome ;
 * - `lairSearch` : écart maximal, en tuiles, entre la place idéale du
 *   repaire et celle où il se pose (une tuile à pied, libre, hors de toute
 *   base mutante, dans sa région).
 */
export const REGION_SHAPE = {
  warpCell: 18,
  angleWarp: 0.3,
  radiusWarp: 6,
  sampleStep: 3,
  lairSearch: 24,
} as const;

/**
 * Où le gardien se montre : quand Adam passe à `showTiles` tuiles de son
 * repaire, il en sort ; au-delà de `hideTiles`, il y rentre — avec ce qu'il
 * lui reste de vie, qu'il regagne d'un point toutes les `regenTicks` hors
 * combat. Comme le chef d'une base.
 */
export const REGION_GUARDIAN = {
  showTiles: 22,
  hideTiles: 30,
  regenTicks: 40,
} as const;

/** L'ère atteinte après `done` objectifs réussis (indice dans `ERAS`). */
export function eraOf(done: number): number {
  let era = 0;

  ERAS.forEach((proto, index) => {
    if (done >= proto.objective) era = index;
  });
  return era;
}
