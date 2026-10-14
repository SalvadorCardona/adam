/**
 * La langue choisie, sur l'appareil : une préférence comme le zoom, pas
 * l'état d'une partie — ni sauvegarde, ni journal de commandes, et
 * « Recommencer » la garde. Chaque accès au stockage peut lever, et aucun ne
 * doit empêcher de jouer.
 */

import { isLocale, type Locale } from '../i18n/locale.ts';
import type { SaveStorage } from './localSave.ts';

/** La clé de la langue — distincte de celles de la sauvegarde, du jardin, du record et du zoom. */
export const LOCALE_KEY = 'adam:locale';

export class LocalLocale {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalLocale {
    try {
      return new LocalLocale(globalThis.localStorage ?? null);
    } catch {
      return new LocalLocale(null);
    }
  }

  /** La langue mémorisée, ou `null` au premier lancement (ou si elle ne se relit pas). */
  public load(): Locale | null {
    try {
      const raw = this.storage?.getItem(LOCALE_KEY) ?? null;

      return isLocale(raw) ? raw : null;
    } catch {
      return null;
    }
  }

  public save(locale: Locale): void {
    try {
      this.storage?.setItem(LOCALE_KEY, locale);
    } catch {
      // Mode privé ou stockage plein : la langue ne survit pas, tant pis.
    }
  }
}
