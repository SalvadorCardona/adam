/** Section `menu` du dictionnaire anglais. */

import type { Messages } from '../messages.ts';

/** "1 stone", "3 stones". */
const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "iron, coal or stone". */
const or = (words: readonly string[]): string =>
  words.length > 1 ? `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}` : (words[0] ?? '');

export const menu: Messages['menu'] = {
  build: 'Build',
  keys: {
    space: 'Space',
    inventory: 'I',
    arrows: 'Arrows',
    enter: 'Enter',
    escape: 'Esc',
  },
  drawerTitle: 'Buildings',
  searchPlaceholder: 'Search for a building…',
  searchClear: 'Clear search',
  searchEmpty: 'No building matches',
  allCategories: 'All',
  categoryCount: (category, n) => `${category}, ${count(n, 'building')}`,
  resultsElsewhere: (n, category) => `${count(n, 'result')} in ${category}`,
  effectPrompt: 'Long-press a card: what is it for?',
  cardEffect: (name, effect) => `${name}: ${effect}`,
  free: 'free',
  employs: (n) => `Employs ${n} worker${n === 1 ? '' : 's'}`,
  footing: (ore, veins, grass) => `Sits on ${ore} tiles of an ore vein (${or(veins)}) and ${grass} grass tiles`,
  newBadge: 'New',
  place: 'Place',
  placeAgain: 'Place again',
  placing: (name) => `Place: ${name}`,
  tapToPlace: (name) => `Tap the map to place: ${name}`,
};
