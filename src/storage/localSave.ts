/**
 * La sauvegarde sur l'appareil : une clé du `localStorage`, et rien d'autre.
 *
 * Le format et sa validation vivent dans `sim/save.ts`, qui ne connaît pas le
 * navigateur ; ce module ne fait que lire, écrire et effacer une chaîne. Tout
 * accès au stockage peut lever — navigation privée, quota plein, stockage
 * bloqué par le navigateur — et aucun ne doit empêcher de jouer : sans
 * stockage, le jeu tourne comme avant, sans sauvegarde.
 */

import { decodeSave, encodeState, peekSave, serialize, type SaveSummary } from '../sim/save.ts';
import type { World } from '../sim/world.ts';

/** La clé de la partie en cours. */
export const SAVE_KEY = 'adam:save';

/** La clé de la partie du jour : un emplacement à part, la partie principale n'y est jamais touchée. */
export const DAILY_SAVE_KEY = 'adam:daily-save';

/** Où part une sauvegarde illisible avant qu'une nouvelle partie n'écrase la clé principale. */
export const CORRUPT_SAVE_KEY = 'adam:save:corrupt';

/** Ce dont la sauvegarde a besoin d'un `Storage` — de quoi le remplacer en test. */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Ce qu'a coûté la dernière écriture, chronométrée étape par étape : le
 * panneau `?debug` l'affiche. Tout est synchrone, sur le fil principal : la
 * somme est la saccade que la sauvegarde fait sentir.
 */
export interface SaveStats {
  /** Taille du texte écrit, en caractères : c'est ainsi que le quota du `localStorage` (~5 millions) se compte. */
  bytes: number;
  /** `World.snapshot()`. */
  snapshotMs: number;
  /** `JSON.stringify` du fichier. */
  stringifyMs: number;
  /** `localStorage.setItem`. */
  writeMs: number;
  /** La plus lourde des écritures de la session, en caractères. */
  peakBytes: number;
  /** La plus longue, en ms, les trois étapes réunies. */
  peakMs: number;
  /** Écritures réussies depuis le lancement. */
  writes: number;
}

export type LoadResult =
  | { status: 'ok'; world: World; savedAt: number }
  /** Pas de sauvegarde, ou pas de stockage du tout. */
  | { status: 'none' }
  /** Une sauvegarde existe mais ne se relit pas : autre version, ou abîmée. */
  | { status: 'version' | 'corrupt' };

export class LocalSave {
  private readonly storage: SaveStorage | null;
  private readonly key: string;
  private lastStats: SaveStats | null = null;

  /** `key` : l'emplacement — la partie principale par défaut, `DAILY_SAVE_KEY` pour la carte du jour. */
  public constructor(storage: SaveStorage | null, key: string = SAVE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  /**
   * Le `localStorage` du navigateur, s'il est joignable. Sa simple lecture
   * peut lever (cookies bloqués sous Safari, iframe isolée) : d'où le try.
   */
  public static browser(key: string = SAVE_KEY): LocalSave {
    try {
      return new LocalSave(globalThis.localStorage ?? null, key);
    } catch {
      return new LocalSave(null, key);
    }
  }

  public load(): LoadResult {
    let text: string | null;

    try {
      text = this.storage?.getItem(this.key) ?? null;
    } catch {
      return { status: 'none' };
    }

    if (text === null) return { status: 'none' };

    const decoded = decodeSave(text);

    if (!decoded.ok) {
      this.keepUnreadable(text);
      return { status: decoded.reason };
    }
    return { status: 'ok', world: decoded.world, savedAt: decoded.savedAt };
  }

  /** Le résumé de la partie pour l'écran titre, sans la charger ; `null` sans sauvegarde lisible. */
  public peek(): SaveSummary | null {
    try {
      const text = this.storage?.getItem(this.key) ?? null;

      return text === null ? null : peekSave(text);
    } catch {
      return null;
    }
  }

  /** Garde une copie de ce qu'on ne sait pas relire : la prochaine autosave écrasera la clé principale. */
  private keepUnreadable(text: string): void {
    try {
      this.storage?.setItem(this.key === SAVE_KEY ? CORRUPT_SAVE_KEY : `${this.key}:corrupt`, text);
    } catch {
      // Quota plein : la copie est un filet, elle ne doit pas empêcher de jouer.
    }
  }

  /** Ce qu'a coûté la dernière écriture réussie ; `null` avant la première. */
  public get stats(): SaveStats | null {
    return this.lastStats;
  }

  /** Écrit la partie. Renvoie `false` si le stockage l'a refusée — le jeu continue quand même. */
  public save(world: World): boolean {
    if (!this.storage) return false;

    try {
      const start = performance.now();
      const state = serialize(world);
      const taken = performance.now();
      const text = encodeState(state, Date.now());
      const encoded = performance.now();

      this.storage.setItem(this.key, text);

      const written = performance.now();
      const previous = this.lastStats;

      this.lastStats = {
        bytes: text.length,
        snapshotMs: taken - start,
        stringifyMs: encoded - taken,
        writeMs: written - encoded,
        peakBytes: Math.max(previous?.peakBytes ?? 0, text.length),
        peakMs: Math.max(previous?.peakMs ?? 0, written - start),
        writes: (previous?.writes ?? 0) + 1,
      };
      return true;
    } catch {
      return false;
    }
  }

  /** Efface la partie : « Recommencer », ou la mairie tombée. */
  public clear(): void {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // Rien à faire : une sauvegarde qu'on ne peut pas effacer, on ne pouvait pas la lire non plus.
    }
  }
}
