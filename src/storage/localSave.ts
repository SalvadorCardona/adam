/**
 * La sauvegarde sur l'appareil : une clé du `localStorage`, et rien d'autre.
 *
 * Le format et sa validation vivent dans `sim/save.ts`, qui ne connaît pas le
 * navigateur ; ce module ne fait que lire, écrire et effacer une chaîne. Tout
 * accès au stockage peut lever — navigation privée, quota plein, stockage
 * bloqué par le navigateur — et aucun ne doit empêcher de jouer : sans
 * stockage, le jeu tourne comme avant, sans sauvegarde.
 */

import { decodeSave, encodeSave } from '../sim/save.ts';
import type { World } from '../sim/world.ts';

/** La clé de la partie en cours. */
export const SAVE_KEY = 'adam:save';

/** La clé de la partie du jour : un emplacement à part, la partie principale n'y est jamais touchée. */
export const DAILY_SAVE_KEY = 'adam:daily-save';

/** Où part une sauvegarde illisible avant qu'une nouvelle partie n'écrase la clé principale. */
export const CORRUPT_SAVE_KEY = 'adam:save:corrupt';

/** Ce dont la sauvegarde a besoin d'un `Storage` — de quoi le remplacer en test. */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LoadResult =
  | { status: 'ok'; world: World; savedAt: number }
  /** Pas de sauvegarde, ou pas de stockage du tout. */
  | { status: 'none' }
  /** Une sauvegarde existe mais ne se relit pas : autre version, ou abîmée. */
  | { status: 'version' | 'corrupt' };

export class LocalSave {
  private readonly storage: SaveStorage | null;
  private readonly key: string;

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

  /** Garde une copie de ce qu'on ne sait pas relire : la prochaine autosave écrasera la clé principale. */
  private keepUnreadable(text: string): void {
    try {
      this.storage?.setItem(this.key === SAVE_KEY ? CORRUPT_SAVE_KEY : `${this.key}:corrupt`, text);
    } catch {
      // Quota plein : la copie est un filet, elle ne doit pas empêcher de jouer.
    }
  }

  /** Écrit la partie. Renvoie `false` si le stockage l'a refusée — le jeu continue quand même. */
  public save(world: World): boolean {
    if (!this.storage) return false;

    try {
      this.storage.setItem(this.key, encodeSave(world, Date.now()));
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
