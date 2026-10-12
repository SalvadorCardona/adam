/** The `notifications` section: settings, the explanation screen and the notifications themselves. */

import type { Messages } from '../messages.ts';

export const notifications: Messages['notifications'] = {
  heading: 'Notifications',
  kinds: {
    research: 'Research done',
    child: 'Child born',
    supplies: 'Low supplies',
    attack: 'Wave announced',
  },
  perDay: (limit) => `At most ${limit} a day`,
  denied: 'Blocked by the browser: turn them back on in its settings.',
  allow: 'Allow notifications',
  prompt: {
    title: 'Want a heads-up?',
    intro: 'Eve nudges you when something happens while the game is open in a window you are not looking at:',
    points: ['a research is done', 'a child is born', 'the town is short of supplies', 'a wave is coming'],
    note: 'A few a day at most, and everything is adjustable in Settings. Your browser will ask for its consent.',
    accept: 'Turn on',
    later: 'Not now',
  },
  research: {
    title: 'Research done',
    body: (name) => `"${name}" is ready. Eve is waiting at the lab!`,
  },
  child: {
    title: 'A child is born',
    body: (name) => `${name} just arrived at the nursery. Welcome!`,
  },
  supplies: {
    foodTitle: 'The pantry is running low',
    waterTitle: 'The water is running low',
    body: (minutes) => (minutes <= 0 ? 'There is nothing left to serve everyone.' : `About ${minutes} min left.`),
  },
  attack: {
    title: 'A wave is coming',
    body: (night, count) => `Night ${night}: ${count} mutants on their way. Get inside!`,
  },
};
