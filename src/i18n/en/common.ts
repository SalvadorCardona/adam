/** What everything uses: every window's buttons, numbers, plurals. */

import type { Messages } from '../messages.ts';

const NUMBER = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

export const common: Messages['common'] = {
  close: 'Close',
  cancel: 'Cancel',
  number: (value) => NUMBER.format(value),
  plural: (count) => (count === 1 ? '' : 's'),
  pageTitle: 'Mobile Factory — after the end of the world',
};

export const settings: Messages['settings'] = {
  title: 'Settings',
  language: 'Language',
  sound: 'Sounds',
  music: 'Music',
  signs: 'Building signs',
  haptics: 'Vibration',
  sfxVolume: 'Sound effects volume',
  musicVolume: 'Music volume',
  toggle: (name, on) => `${name}: ${on ? 'on' : 'off'}`,
  languageName: 'English',
};
