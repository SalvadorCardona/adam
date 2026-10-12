/** Section `wardrobe` du dictionnaire anglais. */

import type { Messages } from '../messages.ts';

export const wardrobe: Messages['wardrobe'] = {
  title: 'Adam’s wardrobe',
  slots: {
    hair: 'Hair',
    eyes: 'Eyes',
    beard: 'Beard',
    top: 'Top',
    pants: 'Trousers',
    shoes: 'Shoes',
    glasses: 'Glasses',
    hat: 'Hat',
  },
  colorOf: {
    eyes: 'Eye colour',
    hair: 'Hair and beard colour',
    top: 'Top colour',
  },
  tones: {
    ink: 'Indigo',
    violet: 'Violet',
    yellow: 'Yellow',
    coral: 'Coral',
    orange: 'Orange',
    mint: 'Mint',
    cyan: 'Cyan',
    toxic: 'Neon green',
    skin: 'Peach',
    paper: 'White',
  },
  rarities: {
    common: 'Common',
    rare: 'Rare',
    epic: 'Epic',
  },
  sources: {
    objective: 'Objective reward',
    enemyBase: 'Loot from a mutant base',
    chief: 'Loot from a base chief',
    queen: 'Loot from the Puddle Queen',
    beast: 'Found on a beast',
    chest: 'Found in a chest',
  },
  locked: 'To be found',
  lockedHint: 'Found while playing: chests on the map, objectives, mutant bases and their chiefs, the Queen, sometimes a beast.',
  new: 'New',
  owned: (owned, total) => `${owned}/${total} pieces`,
  turn: 'Turn',
  validate: 'Confirm',
  cancel: 'Cancel',
  found: (piece) => `New item: ${piece}`,
  tryOn: 'Try it on',
  rejected: 'Adam can’t wear this outfit.',
  spare: (prestige) => `Wardrobe complete: +${prestige} Prestige instead`,
  chestOpened: 'Chest opened!',
};
