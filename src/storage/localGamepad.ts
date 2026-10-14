/**
 * Les réglages de la manette, sur l'appareil : la zone morte des sticks et
 * la vibration. Des préférences, comme le zoom — ni sauvegarde ni journal de
 * commandes, et « Recommencer » les garde. Chaque accès au stockage peut
 * lever, et aucun ne doit empêcher de jouer.
 */

import { GAMEPAD } from '../input/gamepad.ts';
import type { SaveStorage } from './localSave.ts';

/** La clé de la manette — distincte de celles de la sauvegarde, du jardin, du record, du zoom et des vibrations. */
export const GAMEPAD_KEY = 'adam:gamepad';

export interface GamepadPrefs {
  /** Zone morte des deux sticks, dans `GAMEPAD.deadZoneRange`. */
  deadZone: number;
  /** La manette vibre aux moments clés. */
  rumble: boolean;
}

export const DEFAULT_GAMEPAD_PREFS: GamepadPrefs = { deadZone: GAMEPAD.deadZone, rumble: true };

export class LocalGamepad {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalGamepad {
    try {
      return new LocalGamepad(globalThis.localStorage ?? null);
    } catch {
      return new LocalGamepad(null);
    }
  }

  /** Les réglages mémorisés ; un champ absent ou illisible reprend sa valeur par défaut. */
  public load(): GamepadPrefs {
    try {
      const raw = this.storage?.getItem(GAMEPAD_KEY) ?? null;
      const value: unknown = raw === null ? null : JSON.parse(raw);

      if (typeof value !== 'object' || value === null) return { ...DEFAULT_GAMEPAD_PREFS };

      const { deadZone, rumble } = value as Partial<Record<keyof GamepadPrefs, unknown>>;
      const { min, max } = GAMEPAD.deadZoneRange;

      return {
        deadZone: typeof deadZone === 'number' && deadZone >= min && deadZone <= max ? deadZone : DEFAULT_GAMEPAD_PREFS.deadZone,
        rumble: typeof rumble === 'boolean' ? rumble : DEFAULT_GAMEPAD_PREFS.rumble,
      };
    } catch {
      return { ...DEFAULT_GAMEPAD_PREFS };
    }
  }

  public save(prefs: GamepadPrefs): void {
    try {
      this.storage?.setItem(GAMEPAD_KEY, JSON.stringify(prefs));
    } catch {
      // Mode privé ou stockage plein : le réglage ne survit pas, tant pis.
    }
  }
}
