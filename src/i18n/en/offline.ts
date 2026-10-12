/** Section `offline` of the English dictionary: the "While you were away" recap. */

import type { Messages } from '../messages.ts';

/** A duration in hours and minutes: "1 h 05", "12 min". */
const duration = (minutes: number): string =>
  minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;

export const offline: Messages['offline'] = {
  title: 'While you were away',
  away: (minutes: number): string => `Away for ${duration(minutes)}`,
  capped: (minutes: number): string => `The town only caught up ${duration(minutes)}: that is the limit.`,
  gained: 'Produced',
  spent: 'Consumed',
  research: 'Research completed',
  births: (n: number): string => (n > 1 ? `${n} children were born` : 'A child was born'),
  alertsTitle: 'Keep an eye on',
  nothing: 'The town dozed: nothing moved.',
  alerts: {
    hunger: 'People are hungry: food ran out.',
    thirst: 'People are thirsty: water ran out.',
    lowFood: 'Food is low in town.',
    lowWater: 'Water is low in town.',
    nurseryHungry: 'The nursery is waiting for food.',
    storeFull: 'Some chests are full: nobody to empty them.',
  },
  collect: 'Collect',
};
