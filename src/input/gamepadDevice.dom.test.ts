// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamepadDevice, type PadInfo } from './gamepadDevice.ts';

/** Un `Gamepad` de Chromium au mapping standard, tel que le relève `?pad=debug`. */
function gamepad(index: number, id: string, pressed: readonly number[] = []): Gamepad {
  return {
    index,
    id,
    mapping: 'standard',
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, button) => ({ pressed: pressed.includes(button), touched: false, value: pressed.includes(button) ? 1 : 0 })),
    timestamp: 0,
  } as unknown as Gamepad;
}

function fire(type: 'gamepadconnected' | 'gamepaddisconnected', pad: Gamepad): void {
  window.dispatchEvent(Object.assign(new Event(type), { gamepad: pad }));
}

describe('GamepadDevice', () => {
  let device: GamepadDevice | null = null;

  afterEach(() => {
    device?.destroy();
    device = null;
    vi.unstubAllGlobals();
  });

  /*
   * Relevé sur une console SteamOS (ROG Ally X, AppImage lancée par Steam) :
   * Chromium annonce trois manettes — le périphérique brut et les deux pads
   * virtuels de Steam Input —, puis Steam en masque deux. Il reste « pad 0 »,
   * à l'index 2, et `getGamepads()` vaut `[null, null, pad]`.
   */
  it('ne crie pas « débranchée » quand Steam masque des manettes et qu’il en reste une', () => {
    const raw = gamepad(0, 'Microsoft X-Box 360 pad (STANDARD GAMEPAD Vendor: 045e Product: 028e)');
    const second = gamepad(1, 'Microsoft X-Box 360 pad 1 (STANDARD GAMEPAD Vendor: 28de Product: 11ff)');
    const steam = gamepad(2, 'Microsoft X-Box 360 pad 0 (STANDARD GAMEPAD Vendor: 28de Product: 11ff)');
    let pads: (Gamepad | null)[] = [raw, second, steam];
    const connected: PadInfo[] = [];
    const disconnected: PadInfo[] = [];

    vi.stubGlobal('navigator', { getGamepads: () => pads });
    device = new GamepadDevice({ connected: (pad) => connected.push(pad), disconnected: (pad) => disconnected.push(pad) });

    fire('gamepadconnected', raw);
    fire('gamepadconnected', second);
    fire('gamepadconnected', steam);
    pads = [null, null, steam];
    fire('gamepaddisconnected', raw);
    fire('gamepaddisconnected', second);

    expect(disconnected).toEqual([]);
    expect(connected).toHaveLength(1);
    expect(device.pad?.index).toBe(2);

    // A, sur la manette qui reste : le jeu le lit.
    pads = [null, null, gamepad(2, steam.id, [0])];
    expect(device.poll()?.buttons[0]?.pressed).toBe(true);
  });

  it('prévient quand la dernière manette part', () => {
    const only = gamepad(0, 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)');
    const disconnected: PadInfo[] = [];

    vi.stubGlobal('navigator', { getGamepads: () => [only] });
    device = new GamepadDevice({ connected: () => undefined, disconnected: (pad) => disconnected.push(pad) });

    fire('gamepadconnected', only);
    vi.stubGlobal('navigator', { getGamepads: () => [null] });
    fire('gamepaddisconnected', only);

    expect(disconnected.map((pad) => pad.index)).toEqual([0]);
    expect(device.pad).toBeNull();
    expect(device.poll()).toBeNull();
  });
});
