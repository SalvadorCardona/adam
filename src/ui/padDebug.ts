/**
 * Le diagnostic manette : `…/adam/?pad=debug` ouvre, à la place du jeu, un
 * tableau de ce que `navigator.getGamepads()` remonte vraiment — pour chaque
 * entrée : index, `id`, `mapping`, nombre d'axes et de boutons, et leurs
 * valeurs en direct. Chaque changement s'écrit aussi dans la console, une
 * ligne `[pad] {…}` : on la relit sans écran (Firefox avec
 * `devtools.console.stdout.content`, Electron avec `ELECTRON_ENABLE_LOGGING`).
 *
 * C'est l'outil qui a servi à relever le pad virtuel de Steam Input sur une
 * console SteamOS ; il ne touche ni à la partie ni au stockage.
 */

import { t } from '../i18n/locale.ts';

/** Ce qu'on lit d'un `Gamepad`. */
export interface PadDebugSource {
  index: number;
  id: string;
  mapping: string;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

/** Une entrée de `getGamepads()`, arrondie pour l'affichage et le journal. */
export interface PadDebugRow {
  index: number;
  id: string;
  mapping: string;
  connected: boolean;
  axes: number[];
  /** La valeur de chaque bouton, de 0 à 1. */
  buttons: number[];
  /** Les indices des boutons enfoncés (`pressed`). */
  pressed: number[];
}


const round = (value: number): number => Math.round(value * 100) / 100;

/** Les entrées non vides, arrondies au centième. */
export function padDebugRows(pads: readonly (PadDebugSource | null)[]): PadDebugRow[] {
  return pads
    .filter((pad): pad is PadDebugSource => pad !== null)
    .map((pad) => ({
      index: pad.index,
      id: pad.id,
      mapping: pad.mapping,
      connected: pad.connected,
      axes: pad.axes.map(round),
      buttons: pad.buttons.map((button) => round(button.value)),
      pressed: pad.buttons.flatMap((button, index) => (button.pressed ? [index] : [])),
    }));
}

/** La ligne de journal d'une entrée : `[pad] {"index":0,…}`. */
export function padDebugLine(row: PadDebugRow): string {
  return `[pad] ${JSON.stringify(row)}`;
}

function readPads(): readonly (Gamepad | null)[] {
  try {
    return typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  } catch {
    return [];
  }
}

/** Ouvre le diagnostic dans `root`. Il tourne jusqu'à ce qu'on quitte la page. */
export function mountPadDebug(root: HTMLElement): void {
  const page = document.createElement('main');
  const title = document.createElement('h1');
  const hint = document.createElement('p');
  const table = document.createElement('pre');

  page.className = 'pad-debug';
  title.textContent = t().gamepad.debugTitle;
  hint.textContent = t().gamepad.none;
  page.append(title, hint, table);
  root.replaceChildren(page);

  const logged = new Map<number, string>();
  const log = (message: string) => console.log(message);

  log(`[pad] ready ${navigator.userAgent} getGamepads=${typeof navigator.getGamepads} secure=${String(window.isSecureContext)}`);
  window.addEventListener('gamepadconnected', (event) => log(`[pad] connected ${event.gamepad.index} ${event.gamepad.id} mapping=${JSON.stringify(event.gamepad.mapping)}`));
  window.addEventListener('gamepaddisconnected', (event) => log(`[pad] disconnected ${event.gamepad.index} ${event.gamepad.id}`));

  const frame = () => {
    const rows = padDebugRows(readPads());

    hint.hidden = rows.length > 0;
    table.textContent = rows
      .map((row) =>
        [
          `#${row.index}  ${row.id}`,
          `mapping: ${JSON.stringify(row.mapping)}  connected: ${String(row.connected)}`,
          `axes (${row.axes.length}): ${row.axes.map((value, index) => `${index}=${value.toFixed(2)}`).join('  ')}`,
          `buttons (${row.buttons.length}): ${row.buttons.map((value, index) => `${index}=${value.toFixed(2)}`).join('  ')}`,
          `pressed: ${row.pressed.join(' ') || '-'}`,
        ].join('\n'),
      )
      .join('\n\n');
    for (const row of rows) {
      const line = padDebugLine(row);

      if (logged.get(row.index) !== line) {
        logged.set(row.index, line);
        log(line);
      }
    }
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
