/** The gamepad: its Settings section, the "Controller" help screen, the plug-in toasts. */

import type { Messages } from '../messages.ts';

export const gamepad: Messages['gamepad'] = {
  heading: 'Controller',
  helpTitle: 'Controller controls',
  rumble: 'Controller vibration',
  deadZone: 'Stick dead zone',
  kinds: { playstation: 'PlayStation', xbox: 'Xbox · Steam Deck' },
  detected: (name: string): string => `Controller detected: ${name}`,
  none: 'No controller detected. Plug it in, then press a button.',
  connected: (kind: string): string => `${kind} controller connected`,
  disconnected: 'Controller unplugged. Game paused',
  actions: {
    move: 'Walk',
    cursor: 'Move the cursor',
    click: 'Click (hold to drag)',
    navigate: 'Jump from button to button',
    back: 'Back, close, cancel',
    bag: 'Bag: inventory and outfit',
    build: 'Build',
    zoomStep: 'Zoom out, in',
    zoom: 'Smooth zoom',
    recenter: 'Back to Adam',
    mic: 'Mute or unmute the microphone (voice chat)',
    pause: 'Pause',
    map: 'World map',
  },
};
