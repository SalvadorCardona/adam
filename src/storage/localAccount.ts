/**
 * La session du compte, sur l'appareil : le jeton que le serveur a donné et
 * l'identité qu'il y a jointe (pour afficher le pseudo sans réseau). Ni
 * sauvegarde ni journal de commandes, et « Recommencer » la garde. Chaque
 * accès au stockage peut lever, et aucun ne doit empêcher de jouer.
 */

import { isAccountUser, type AccountUser } from '../../shared/api.ts';
import type { SaveStorage } from './localSave.ts';

/** La clé du compte — distincte de celles de la sauvegarde, du jardin, du record et des préférences. */
export const ACCOUNT_KEY = 'adam:account';

export interface StoredSession {
  readonly token: string;
  readonly user: AccountUser;
}

export class LocalAccount {
  private readonly storage: SaveStorage | null;

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /** Le `localStorage` du navigateur, s'il est joignable. */
  public static browser(): LocalAccount {
    try {
      return new LocalAccount(globalThis.localStorage ?? null);
    } catch {
      return new LocalAccount(null);
    }
  }

  /** La session gardée, ou `null` (jamais connecté, ou illisible). */
  public load(): StoredSession | null {
    try {
      const raw = this.storage?.getItem(ACCOUNT_KEY);

      if (!raw) return null;

      const value = JSON.parse(raw) as Record<string, unknown>;

      return typeof value['token'] === 'string' && isAccountUser(value['user'])
        ? { token: value['token'], user: value['user'] }
        : null;
    } catch {
      return null;
    }
  }

  public save(session: StoredSession): void {
    try {
      this.storage?.setItem(ACCOUNT_KEY, JSON.stringify(session));
    } catch {
      // Mode privé ou stockage plein : la session ne survit pas au rechargement, tant pis.
    }
  }

  public clear(): void {
    try {
      this.storage?.removeItem(ACCOUNT_KEY);
    } catch {
      // Rien à faire de plus.
    }
  }
}
