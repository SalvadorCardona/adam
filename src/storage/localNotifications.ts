/**
 * Les réglages « Notifications », sur l'appareil : quels événements en
 * déclenchent une, combien par jour au plus, si l'écran d'explication a déjà
 * été montré, et le compte du jour. Une préférence, comme les vibrations — ni
 * sauvegarde ni journal de commandes, et « Recommencer » la garde. Chaque
 * accès au stockage peut lever, et aucun ne doit empêcher de jouer.
 */

import { NOTIFICATIONS, NOTIFICATION_KINDS, type NotificationKind } from '../data/notifications.ts';
import type { SaveStorage } from './localSave.ts';

/** La clé des notifications — distincte de celles de la sauvegarde, du jardin, du record, du zoom, des pancartes et des vibrations. */
export const NOTIFICATIONS_KEY = 'mobile-factory:notifications';

export interface NotificationPrefs {
  kinds: Record<NotificationKind, boolean>;
  /** Le nombre maximal de notifications par jour. */
  limit: number;
  /** L'écran d'explication a été montré : on ne le remontre pas, quelle qu'ait été la réponse. */
  explained: boolean;
  /** Le jour du dernier compte (`AAAA-MM-JJ`, heure locale) et ce qui est parti ce jour-là. */
  day: string;
  sent: number;
}

export function defaultPrefs(): NotificationPrefs {
  return { kinds: { ...NOTIFICATIONS.defaultKinds }, limit: NOTIFICATIONS.defaultLimit, explained: false, day: '', sent: 0 };
}

export class LocalNotifications {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalNotifications {
    try {
      return new LocalNotifications(globalThis.localStorage ?? null);
    } catch {
      return new LocalNotifications(null);
    }
  }

  /** Les réglages gardés, champ par champ : une valeur illisible retombe sur la valeur par défaut. */
  public load(): NotificationPrefs {
    const prefs = defaultPrefs();

    try {
      const raw = this.storage?.getItem(NOTIFICATIONS_KEY);
      const data: unknown = raw ? JSON.parse(raw) : null;

      if (typeof data !== 'object' || data === null) return prefs;

      const saved = data as Partial<Record<keyof NotificationPrefs, unknown>>;
      const kinds = typeof saved.kinds === 'object' && saved.kinds !== null ? (saved.kinds as Record<string, unknown>) : {};

      for (const kind of NOTIFICATION_KINDS) {
        if (typeof kinds[kind] === 'boolean') prefs.kinds[kind] = kinds[kind];
      }
      if (typeof saved.limit === 'number' && (NOTIFICATIONS.dailyLimits as readonly number[]).includes(saved.limit)) prefs.limit = saved.limit;
      if (typeof saved.explained === 'boolean') prefs.explained = saved.explained;
      if (typeof saved.day === 'string' && typeof saved.sent === 'number' && saved.sent >= 0) {
        prefs.day = saved.day;
        prefs.sent = Math.floor(saved.sent);
      }
    } catch {
      // Stockage illisible ou JSON cassé : les réglages par défaut.
    }
    return prefs;
  }

  public save(prefs: NotificationPrefs): void {
    try {
      this.storage?.setItem(NOTIFICATIONS_KEY, JSON.stringify(prefs));
    } catch {
      // Mode privé ou stockage plein : le réglage ne survit pas, tant pis.
    }
  }
}
