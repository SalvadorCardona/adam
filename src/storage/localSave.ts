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
export const SAVE_KEY = 'mobile-factory:save';

/** Où part une sauvegarde illisible avant qu'une nouvelle partie n'écrase la clé principale. */
export const CORRUPT_SAVE_KEY = 'mobile-factory:save:corrupt';

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

  public constructor(storage: SaveStorage | null) {
    this.storage = storage;
  }

  /**
   * Le `localStorage` du navigateur, s'il est joignable. Sa simple lecture
   * peut lever (cookies bloqués sous Safari, iframe isolée) : d'où le try.
   */
  public static browser(): LocalSave {
    try {
      return new LocalSave(globalThis.localStorage ?? null);
    } catch {
      return new LocalSave(null);
    }
  }

  public load(): LoadResult {
    let text: string | null;

    try {
      text = this.storage?.getItem(SAVE_KEY) ?? null;
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
      this.storage?.setItem(CORRUPT_SAVE_KEY, text);
    } catch {
      // Quota plein : la copie est un filet, elle ne doit pas empêcher de jouer.
    }
  }

  /** Écrit la partie. Renvoie `false` si le stockage l'a refusée — le jeu continue quand même. */
  public save(world: World): boolean {
    if (!this.storage) return false;

    try {
      this.storage.setItem(SAVE_KEY, encodeSave(world, Date.now()));
      return true;
    } catch {
      return false;
    }
  }

  /** Efface la partie : « Recommencer », ou la mairie tombée. */
  public clear(): void {
    try {
      this.storage?.removeItem(SAVE_KEY);
    } catch {
      // Rien à faire : une sauvegarde qu'on ne peut pas effacer, on ne pouvait pas la lire non plus.
    }
  }
}
