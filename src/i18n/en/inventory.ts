/** Section `inventory` du dictionnaire anglais. */

import type { Messages } from '../messages.ts';

export const inventory: Messages['inventory'] = {
  title: 'Bag',
  tabs: {
    inventory: 'Inventory',
    wardrobe: 'Outfit',
  },
  town: 'Town',
  capacity: (total, capacity, free) => `${total}/${capacity} — ${free} free slot${free === 1 ? '' : 's'}`,
  whereNear: 'Near the town hall: whatever you drop off joins the town stock.',
  whereFar: 'Far from the town hall: whatever you drop stays on the ground. Walk over it to pick it up.',
  whereNoTown: 'No town yet: whatever you drop stays on the ground. Walk over it to pick it up.',
  empty: 'The bag is empty.',
  pick: 'Tap a slot to pick an item.',
  slot: (item, amount) => `${item}: ${amount}`,
  townEmpty: 'Nothing in stock yet.',
  deposit: 'Drop off',
  drop: 'Drop',
  depositAll: 'Drop off in town',
  dropAll: 'Drop all',
  depositItem: (item) => `Drop off in town: ${item}`,
  dropItem: (item) => `Drop: ${item}`,
  perMinute: (rate) => `${rate}/min`,
  shortage: {
    forge: (item, stock) => `${item}: the forge is waiting (${stock} in town)`,
    nursery: (item, stock) => `${item}: the nursery is waiting (${stock} in town)`,
  },
  surplusRate: (item, rate) => `${item}: ${rate}/min, nobody uses it`,
  surplusStock: (item, stock) => `${item}: ${stock} in town, nobody uses it`,
};
