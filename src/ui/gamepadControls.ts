/**
 * La manette, branchée au jeu : lue à chaque frame dans la boucle de rendu
 * (`update`), elle produit l'axe de marche d'Adam et pousse des actions —
 * jamais l'état du monde, que seuls `main.ts` et ses commandes touchent.
 *
 * Les contrôles (le mapping standard, `input/gamepad.ts`) :
 *
 * - stick gauche : marcher, analogique ;
 * - stick droit : le curseur virtuel ; ✕ / A : le clic, tenu compris ;
 * - croix : d'un bouton à l'autre (menus, fenêtres, HUD) ;
 * - ○ / B : retour — ferme la fenêtre, annule un placement (Échap) ;
 * - △ / Y : le sac ; □ / X : « Bâtir » ;
 * - L1 / R1 : un cran de zoom ; L2 / R2 : zoom continu ; R3 : revenir sur Adam ;
 * - L3 (clic du stick gauche) : couper ou rouvrir le micro du vocal ;
 * - Options / Menu : pause ; Share / View : la carte du monde.
 *
 * La bascule de mode : la manette sert, le curseur paraît (et le joystick
 * tactile s'efface, `data-input="pad"` sur la racine) ; une vraie souris bouge
 * ou un doigt se pose, il disparaît. Le clavier n'y change rien.
 */

import { GamepadDevice, type PadInfo } from '../input/gamepadDevice.ts';
import {
  GAMEPAD,
  InputMode,
  PAD_DIRECTIONS,
  PadReader,
  cursorVelocity,
  deadZone,
  type Axis2,
  type InputModeName,
  type PadKind,
} from '../input/gamepad.ts';
import { DEFAULT_GAMEPAD_PREFS, type GamepadPrefs } from '../storage/localGamepad.ts';
import { PadCursor } from './padCursor.ts';

export interface GamepadActions {
  /** Le canvas du jeu, et si la carte a quelque chose à taper sous un point (pixels CSS du canvas). */
  canvas: HTMLCanvasElement;
  canvasHand(x: number, y: number): boolean;
  /** Retour : ○ / B. */
  back(): void;
  pause(): void;
  inventory(): void;
  build(): void;
  map(): void;
  zoomStep(direction: 1 | -1): void;
  /** Le zoom continu des gâchettes ; `factor` > 1 avance. */
  zoomBy(factor: number): void;
  recenter(): void;
  /** Le vocal : couper ou rouvrir le micro (L3). */
  mic(): void;
  connected(pad: PadInfo): void;
  disconnected(pad: PadInfo): void;
  /** Le mode a basculé : les étiquettes de boutons, le joystick tactile suivent. */
  modeChanged(mode: InputModeName, kind: PadKind): void;
}

/** Une vibration, par moment clé : durée en ms, force de 0 à 1. */
export const RUMBLES = {
  done: { durationMs: 120, strength: 0.4 },
  hurt: { durationMs: 160, strength: 0.6 },
  alarm: { durationMs: 260, strength: 0.8 },
} as const;

export type RumbleName = keyof typeof RUMBLES;

export class GamepadControls {
  public readonly cursor: PadCursor;

  private readonly actions: GamepadActions;
  private readonly reader = new PadReader();
  private readonly mode = new InputMode();
  private readonly device: GamepadDevice | null;
  private prefs: GamepadPrefs = { ...DEFAULT_GAMEPAD_PREFS };
  private move: Axis2 = { x: 0, y: 0 };
  private kindName: PadKind = 'xbox';
  private readonly rumbledAt = new Map<RumbleName, number>();

  public constructor(actions: GamepadActions) {
    this.actions = actions;
    this.cursor = new PadCursor(actions.canvas, (x, y) => actions.canvasHand(x, y));
    this.device = GamepadDevice.supported
      ? new GamepadDevice({
          connected: (pad) => {
            this.kindName = pad.kind;
            actions.connected(pad);
            actions.modeChanged(this.mode.mode, this.kindName);
          },
          disconnected: (pad) => {
            if (!this.device?.pad) this.usePointer();
            actions.disconnected(pad);
          },
        })
      : null;

    // Une vraie souris qui bouge, un doigt qui se pose : le curseur virtuel s'efface. Ses propres événements sont synthétiques.
    const pointer = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      if (event.type === 'pointermove' && event.pointerType === 'mouse' && event.movementX === 0 && event.movementY === 0) return;
      this.usePointer();
    };

    window.addEventListener('pointerdown', pointer, { capture: true });
    window.addEventListener('pointermove', pointer, { capture: true, passive: true });
  }

  /** La famille de la dernière manette vue : ses étiquettes. */
  public get kind(): PadKind {
    return this.kindName;
  }

  /** La manette tient l'interface. */
  public get padMode(): boolean {
    return this.mode.mode === 'pad';
  }

  /** L'axe de marche du stick gauche, après la zone morte — (0, 0) sans manette. */
  public get axis(): Axis2 {
    return this.move;
  }

  public setPrefs(prefs: GamepadPrefs): void {
    this.prefs = prefs;
  }

  /** Une vibration de la manette, si elle sert et que le réglage le permet. */
  public rumble(name: RumbleName): void {
    if (!this.prefs.rumble || !this.padMode) return;

    const { durationMs, strength } = RUMBLES[name];
    const now = performance.now();

    // Une vibration ne se relance pas avant d'être finie : une pluie de coups reste un seul frisson.
    if (now - (this.rumbledAt.get(name) ?? -Infinity) < durationMs * 2) return;
    this.rumbledAt.set(name, now);

    this.device?.rumble(durationMs, strength);
  }

  /**
   * Une frame : lire la manette, en tirer la marche, le curseur et les
   * appuis. `canMove` : Adam peut marcher (partie lancée, rien par-dessus).
   */
  public update(deltaMs: number, now: number, canMove: boolean): void {
    const snapshot = this.device?.poll() ?? null;
    const reader = this.reader;
    const zone = this.prefs.deadZone;

    reader.update(snapshot, now);
    if (!snapshot) {
      this.move = { x: 0, y: 0 };
      return;
    }
    if (reader.active(zone) && this.mode.usePad()) this.changed();
    if (!this.padMode) {
      this.move = { x: 0, y: 0 };
      return;
    }

    const left = reader.stick('left');

    this.move = canMove ? deadZone(left.x, left.y, zone) : { x: 0, y: 0 };

    const right = reader.stick('right');
    const speed = cursorVelocity(right.x, right.y, window.innerHeight, zone);
    const seconds = Math.min(deltaMs, 100) / 1000;

    this.cursor.moveBy(speed.x * seconds, speed.y * seconds);
    for (const direction of PAD_DIRECTIONS) if (reader.repeated(direction)) this.cursor.navigate(direction);

    if (reader.pressed('south')) this.cursor.press();
    if (reader.released('south')) this.cursor.release();
    if (reader.pressed('east')) this.actions.back();
    if (reader.pressed('north')) this.actions.inventory();
    if (reader.pressed('west')) this.actions.build();
    if (reader.pressed('start')) this.actions.pause();
    if (reader.pressed('select')) this.actions.map();
    if (reader.pressed('l1')) this.actions.zoomStep(-1);
    if (reader.pressed('r1')) this.actions.zoomStep(1);
    if (reader.pressed('r3')) this.actions.recenter();
    if (reader.pressed('l3')) this.actions.mic();

    // Les gâchettes zooment en continu, d'autant plus vite qu'on les enfonce ; les deux ensemble s'annulent.
    const pull = trigger(reader.value('r2')) - trigger(reader.value('l2'));

    if (pull !== 0) this.actions.zoomBy(Math.pow(GAMEPAD.zoomPerSecond, pull * seconds));

    this.cursor.refresh();
  }

  private usePointer(): void {
    if (this.mode.usePointer()) this.changed();
  }

  private changed(): void {
    this.cursor.setVisible(this.padMode);
    this.actions.modeChanged(this.mode.mode, this.kindName);
  }
}

/** La course d'une gâchette au-delà du seuil, remise à l'échelle de 0 à 1. */
function trigger(value: number): number {
  const { triggerThreshold } = GAMEPAD;

  return value <= triggerThreshold ? 0 : (value - triggerThreshold) / (1 - triggerThreshold);
}
