/** Section `trade` du dictionnaire anglais. */

import type { Messages } from '../messages.ts';

/** En minuscules, au milieu d'une phrase (le test des dictionnaires y glisse des nombres). */
const lower = (text: string): string => String(text).toLowerCase();

export const trade: Messages['trade'] = {
  title: 'Barter',
  settling: 'The trader is setting up…',
  leavesIn: (seconds) => `Leaves in ${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`,
  approach: 'Get closer to the cart to trade.',
  paidBoth: 'Paid from the bag, then the town.',
  paidBag: 'Paid from the bag: the town is too far.',
  kinds: {
    surplus: 'Surplus for shortfall',
    loot: 'Loot for metal',
    wayside: 'The traveling trader’s offer',
  },
  rare: (offer) => `Rare: ${lower(offer)}`,
  wayside: 'A traveling trader: a single, rare offer.',
  waysideOnce: 'One trade, then they move on',
  exchange: 'Trade',
  done: 'Traded',
  bagSlots: (n) => `+${n} slot${n === 1 ? '' : 's'}`,
  missingItem: (amount, item) => `${amount} ${lower(item)}`,
  missing: (list) => `Missing ${list}`,
  rareLeft: (n) => `${n} more this game`,
  oncePerCaravan: 'Once per caravan',
};
