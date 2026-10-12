/** Section `collection` du dictionnaire anglais. */

import type { Messages } from '../messages.ts';

export const collection: Messages['collection'] = {
  title: 'Collection',
  button: (done: number, total: number): string => `Collection · ${done}/${total}`,
  buttonLabel: 'Open the collection',
  back: 'Back',
  close: 'Close',
  summary: (done: number, total: number): string => `${done} of ${total} achievements`,
  tabs: {
    achievements: 'Achievements',
    skins: 'Skins',
    rares: 'Rare buildings',
  },
  tiers: {
    first: 'First steps',
    progress: 'Progress',
    challenge: 'Challenges',
    secret: 'Secrets',
  },
  hiddenLabel: 'Secret achievement',
  hiddenHint: 'Find it out yourself.',
  progress: (done: number, goal: number): string => `${done}/${goal}`,
  reward: {
    skin: (name: string): string => `Skin: ${name}`,
    trophy: (name: string): string => `Trophy: ${name}`,
  },
  skinsIntro: 'Pieces of Adam’s outfit earned through achievements: they wait in the wardrobe of every colony.',
  trophyKinds: {
    decoration: 'Decoration',
    variant: 'Building variant',
  },
  trophiesTitle: 'Trophies',
  raresIntro: 'Build each of these buildings once, in any colony, to find it.',
  found: 'Found',
  notFound: 'Not found yet',
  empty: 'Nothing yet.',
  unlocked: 'Achievement unlocked!',
};
