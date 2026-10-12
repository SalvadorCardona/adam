/**
 * La manette branchée, côté navigateur : `navigator.getGamepads()`, lu une
 * fois par frame (`poll`), et les événements de branchement à chaud.
 *
 * Plusieurs manettes peuvent être branchées (un Steam Deck en a une à lui,
 * plus celle qu'on y connecte) : on suit **la dernière qui a servi**. Chrome
 * ne montre une manette qu'après un premier appui ; Firefox, parfois dès le
 * branchement — dans les deux cas, `gamepadconnected` arrive.
 *
 * Les instantanés sont copiés : un `Gamepad` de Chrome est figé à sa lecture,
 * celui de Firefox bouge sous nos pieds ; `PadReader` compare deux frames,
 * il lui faut des valeurs qui ne changent pas entre-temps.
 */

import { padKindOf, type PadKind, type PadSnapshot } from './gamepad.ts';

export interface PadInfo {
  index: number;
  id: string;
  kind: PadKind;
  /** Le mapping standard : les indices de `PAD_BUTTONS` sont fiables. */
  standard: boolean;
}

export interface PadEvents {
  connected(pad: PadInfo): void;
  disconnected(pad: PadInfo): void;
}

export class GamepadDevice {
  private active: number | null = null;
  private readonly known = new Map<number, PadInfo>();
  private readonly detach: () => void;

  public constructor(events: PadEvents) {
    const connected = (event: GamepadEvent) => {
      const pad = info(event.gamepad);

      this.known.set(pad.index, pad);
      this.active ??= pad.index;
      events.connected(pad);
    };
    const disconnected = (event: GamepadEvent) => {
      const pad = this.known.get(event.gamepad.index) ?? info(event.gamepad);

      this.known.delete(pad.index);
      if (this.active === pad.index) this.active = this.known.keys().next().value ?? null;
      events.disconnected(pad);
    };

    window.addEventListener('gamepadconnected', connected);
    window.addEventListener('gamepaddisconnected', disconnected);
    this.detach = () => {
      window.removeEventListener('gamepadconnected', connected);
      window.removeEventListener('gamepaddisconnected', disconnected);
    };
  }

  /** L'API existe-t-elle ? */
  public static get supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
  }

  /** La manette suivie, s'il y en a une. */
  public get pad(): PadInfo | null {
    return this.active === null ? null : (this.known.get(this.active) ?? null);
  }

  /** L'instantané de la manette suivie, `null` sans manette. Une autre qui sert prend la main. */
  public poll(): PadSnapshot | null {
    const pads = readPads();

    for (const pad of pads) {
      if (!pad?.connected) continue;
      if (!this.known.has(pad.index)) this.known.set(pad.index, info(pad));
      if (pad.index !== this.active && pad.buttons.some((button) => button.pressed)) this.active = pad.index;
    }

    const pad = this.active === null ? null : pads[this.active];

    if (!pad?.connected) return null;
    return {
      axes: [...pad.axes],
      buttons: pad.buttons.map((button) => ({ pressed: button.pressed, value: button.value })),
    };
  }

  /** Une petite vibration de la manette suivie, si elle en a une. `strength` de 0 à 1. */
  public rumble(durationMs: number, strength: number): void {
    const pad = this.active === null ? null : readPads()[this.active];
    const actuator = (pad as (Gamepad & { vibrationActuator?: GamepadHapticActuator | null }) | null)?.vibrationActuator;

    if (!actuator || typeof actuator.playEffect !== 'function') return;
    actuator
      .playEffect('dual-rumble', { duration: durationMs, strongMagnitude: strength, weakMagnitude: Math.min(1, strength * 1.5) })
      .catch(() => {
        // Effet refusé (manette sans moteur, onglet sans focus) : rien à faire.
      });
  }

  public destroy(): void {
    this.detach();
  }
}

function readPads(): readonly (Gamepad | null)[] {
  try {
    return GamepadDevice.supported ? navigator.getGamepads() : [];
  } catch {
    // Firefox lève quand une politique de permissions interdit les manettes.
    return [];
  }
}

function info(pad: Gamepad): PadInfo {
  return { index: pad.index, id: pad.id, kind: padKindOf(pad.id), standard: pad.mapping === 'standard' };
}
