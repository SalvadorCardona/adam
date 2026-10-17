/**
 * Les raccourcis clavier du jeu, hors déplacement (`keyboard.ts`) et menu de
 * construction (`BuildMenu.handleKey`) :
 *
 * - P : pause ;
 * - Échap : ferme ce qui est au premier plan, sinon pause (`escape.ts`) — sauf dans
 *   les `ESCAPE_REPEAT_MS` qui suivent une fermeture (`escapeRepeats`) ;
 * - I : le sac, lu par position comme ZQSD ;
 * - M : la carte du monde, lue par caractère — c'est une initiale, et le M
 *   d'un clavier AZERTY n'est pas à la place de celui d'un QWERTY ;
 * - V : couper ou rouvrir le micro du vocal (L3 à la manette) ;
 * - ² / ` : les statistiques de debug, en dev seulement.
 *
 * Une touche tapée dans un champ (la recherche du menu, un curseur de
 * volume) n'est jamais un raccourci : le champ la garde — sauf Échap, qui
 * rend toujours la main au jeu. Une touche tenue avec Ctrl, Alt ou Cmd non
 * plus : Ctrl+P imprime, Cmd+M réduit la fenêtre — le jeu ne s'en mêle pas.
 * Une touche tenue se répète : rien ne bascule en boucle.
 *
 * Fonction pure, sans DOM : `main.ts` l'applique, les tests la lisent.
 */

export type Shortcut = 'pause' | 'escape' | 'inventory' | 'map' | 'mic' | 'debug';

/** Ce qu'il faut savoir d'une touche enfoncée : `KeyboardEvent`, et si un champ de saisie a le focus. */
export interface KeyPress {
  code: string;
  key: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  typing?: boolean;
}

export function shortcutOf(press: KeyPress): Shortcut | null {
  if (press.repeat || press.ctrlKey || press.metaKey || press.altKey) return null;
  if (press.code === 'Escape') return 'escape';
  if (press.typing) return null;
  if (press.code === 'Backquote') return 'debug';
  if (press.code === 'KeyP') return 'pause';
  if (press.code === 'KeyI') return 'inventory';
  if (press.code === 'KeyV') return 'mic';
  if (press.key.toLowerCase() === 'm') return 'map';
  return null;
}

/** Après la fermeture d'une fenêtre, un Échap de plus dans ce délai (ms) est une répétition : il n'enchaîne pas sur la pause. */
export const ESCAPE_REPEAT_MS = 300;

/** `closedAt` : l'instant (ms) où Échap a fermé quelque chose pour la dernière fois, `null` si jamais. */
export function escapeRepeats(closedAt: number | null, now: number): boolean {
  return closedAt !== null && now - closedAt >= 0 && now - closedAt < ESCAPE_REPEAT_MS;
}
