/**
 * Le réglage « Taille de l'interface », sur l'appareil : 100, 115 ou 130 %.
 * Une préférence d'accessibilité, comme le zoom — ni sauvegarde ni journal de
 * commandes, et « Recommencer » la garde. Chaque accès au stockage peut
 * lever, et aucun ne doit empêcher de jouer.
 */

import type { SaveStorage } from './localSave.ts';

/** La clé de la taille — distincte de celles de la sauvegarde, du jardin, du record et du zoom. */
export const UI_SCALE_KEY = 'adam:ui-scale';

/** Les tailles proposées, en pour cent ; la première est celle d'origine. */
export const UI_SCALES = [100, 115, 130] as const;

export type UiScale = (typeof UI_SCALES)[number];

/** La taille suivante, en boucle. */
export function nextUiScale(scale: UiScale): UiScale {
  return UI_SCALES[(UI_SCALES.indexOf(scale) + 1) % UI_SCALES.length]!;
}

export class LocalUiScale {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalUiScale {
    try {
      return new LocalUiScale(globalThis.localStorage ?? null);
    } catch {
      return new LocalUiScale(null);
    }
  }

  /** La taille gardée ; 100 % si rien, ou une valeur qui n'est pas l'une des trois. */
  public load(): UiScale {
    try {
      const value = Number(this.storage?.getItem(UI_SCALE_KEY));

      return UI_SCALES.find((scale) => scale === value) ?? UI_SCALES[0];
    } catch {
      return UI_SCALES[0];
    }
  }

  public save(scale: UiScale): void {
    try {
      this.storage?.setItem(UI_SCALE_KEY, String(scale));
    } catch {
      // Mode privé ou stockage plein : le réglage ne survit pas, tant pis.
    }
  }
}
