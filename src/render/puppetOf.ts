/**
 * Le pantin de chaque marcheur : quel sprite l'anime, et comment il marche.
 * Pur, sans Pixi : le calque des mobiles en tire son pantin, le cadre de
 * sélection la silhouette qu'il entoure.
 */

import { COMPANION_CLASSES } from '../data/companions.ts';
import { ENEMIES, WILDLIFE } from '../data/enemies.ts';
import type { Mobile } from '../sim/types.ts';
import type { PuppetId } from './puppet.ts';

/** Le pantin de chaque marcheur : sprite, ombre, écart des pieds, allure. */
export function puppetOf(
  mobile: Exclude<Mobile, { kind: 'arrow' | 'spit' | 'fireball' | 'pickup' | 'caravan' }>,
): { id: PuppetId; shadowWidth: number; stride: number; gait?: 'scuttle' | 'limp' | 'hop'; woman?: boolean } {
  switch (mobile.kind) {
    case 'mutant':
      return mobile.proto === 'queen'
        ? { id: 'queen', shadowWidth: 72, stride: 12 }
        : { id: ENEMIES[mobile.proto].sprite, shadowWidth: 22, stride: 4 };
    case 'patient':
      return { id: 'patient', shadowWidth: 22, stride: 4, gait: 'limp' };
    case 'companion':
      return { id: COMPANION_CLASSES[mobile.role].sprite, shadowWidth: mobile.role === 'warrior' ? 19 : 16, stride: 3 };
    case 'kid':
      return { id: 'kid', shadowWidth: 15, stride: 3, gait: 'hop', woman: mobile.sex === 'female' };
    case 'eve':
      return { id: 'eve', shadowWidth: 20, stride: 4 };
    case 'worker':
      if (mobile.logistician) return { id: 'logistician', shadowWidth: 17, stride: 3, woman: mobile.sex === 'female' };
      if (mobile.builder) return { id: 'builder', shadowWidth: 16, stride: 3, woman: mobile.sex === 'female' };
      return mobile.exMutant
        ? { id: 'exMutant', shadowWidth: 18, stride: 3.5, woman: mobile.sex === 'female' }
        : { id: 'worker', shadowWidth: 16, stride: 3, woman: mobile.sex === 'female' };
    case 'lumberjack':
      return { id: 'lumberjack', shadowWidth: 16, stride: 3, woman: mobile.sex === 'female' };
    case 'forester':
      return { id: 'forester', shadowWidth: 16, stride: 3, woman: mobile.sex === 'female' };
    case 'farmer':
      return { id: 'farmer', shadowWidth: 16, stride: 3, woman: mobile.sex === 'female' };
    case 'beast':
      if (mobile.proto === 'guardian' || mobile.proto === 'colossus') return { id: WILDLIFE.guardian.sprite, shadowWidth: 24, stride: 4 };
      if (mobile.proto === 'spitter' || mobile.proto === 'sludgeKing') return { id: WILDLIFE.spitter.sprite, shadowWidth: 18, stride: 3 };
      if (mobile.proto === 'chief') return { id: WILDLIFE.chief.sprite, shadowWidth: 38, stride: 7 };
      // Les gardiens des régions : la bête qu'ils ont été, en plus grand (`WildlifeProto.scale`).
      return mobile.proto === 'crab' || mobile.proto === 'giantCrab'
        ? { id: WILDLIFE.crab.sprite, shadowWidth: 22, stride: 8, gait: 'scuttle' }
        : { id: WILDLIFE.wolf.sprite, shadowWidth: 26, stride: 3 };
  }
}
