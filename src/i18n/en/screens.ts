/** Full-screen screens, the map line, the test-game banner, the zoom buttons, the world map. */

import type { Messages } from '../messages.ts';

export const screens: Messages['screens'] = {
  title: {
    kicker: 'After the end of the world',
    play: 'Play',
    resume: 'Continue',
    newGame: 'New game',
    garden: (seeds) => `Garden · ${seeds}`,
    gardenLabel: 'Garden of memories',
    record: (nights) => `Record after the Signal: ${nights} night${nights === 1 ? '' : 's'} held`,
    controls: {
      move: 'Slide your thumb to walk (WASD / arrow keys on PC)',
      harvest: 'Walk past trees and rocks to gather them',
      deliver: 'Bump into a construction site to deliver',
    },
    oldSave: 'Old save from another version: starting a new game.',
    corruptSave: 'Unreadable save: starting a new game.',
    linkedMap: (seed) => `This link leads to map #${seed}: tap “New game” to play it.`,
  },
  daily: {
    button: 'Daily map',
    back: 'Main game',
    today: (date) => `Daily map · ${date}`,
    best: (score) => `Best score today: ${score}`,
    mods: {
      drought: { name: 'Drought', text: 'Wells give half as much water.' },
      scarceWood: { name: 'Scarce wood', text: 'Trees give half as much wood.' },
      fastMutants: { name: 'Fast mutants', text: 'Mutants walk a third faster.' },
      smallColony: { name: 'Colony of 6', text: 'Six workers to start with, not ten.' },
      slowDrills: { name: 'Slow drills', text: 'Each ore takes half as long again.' },
    },
  },
  pause: {
    title: 'Paused',
    text: 'The mutants are waiting too.',
    resume: 'Resume',
    restart: 'Start over',
  },
  confirmRestart: {
    title: 'Start over?',
    text: 'Your colony will be lost: the town hall, the bag, the kids, everything.',
    confirm: 'Start over',
  },
  garden: {
    title: 'Garden of memories',
    text: 'Every fallen colony leaves seeds behind. Planted here, they help every colony that comes after.',
    back: 'Back',
    seeds: (seeds) => `${seeds} seed${seeds === 1 ? '' : 's'}`,
    planted: 'Planted',
    plant: (perk, cost) => `Plant ${perk} for ${cost} seeds`,
    pure: 'Pure run — no perks, for the challenge',
  },
  seed: {
    map: (seed) => `Map #${seed}`,
    share: 'Share this map',
    copied: 'Link copied!',
    copyFailed: 'Couldn’t copy',
  },
  test: {
    banner: (scenario) => `Test game · ${scenario}`,
  },
  worldMap: {
    open: 'World map (M)',
    title: 'World map',
    close: 'Close the map (Esc)',
    hint: 'Drag to explore · tap to go there',
    regions: { conquered: 'Conquered', open: 'To conquer', locked: 'Locked' },
  },
  zoom: {
    zoomIn: 'Zoom in',
    recenter: 'Back to Adam',
    zoomOut: 'Zoom out',
  },
  /** The screen of a superseded tab: the game was taken over in another tab. */
  tabLock: {
    title: 'Game open elsewhere',
    body: 'This game is being played in another tab. To avoid overwriting its progress, this tab has stopped saving.',
    take: 'Take over here',
  },
};
