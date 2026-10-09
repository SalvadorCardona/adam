/** Section `eraPanel` of the English dictionary: the eras panel and the era-reached screen. */

const s = (count: number): string => (count === 1 ? '' : 's');

export const eraPanel = {
  open: (era: string): string => `Eras · ${era}`,
  title: 'The colony’s eras',
  close: 'Close',
  timeline: 'Era progress',
  current: 'Current era',
  next: (era: string): string => `Next era: ${era}`,
  last: 'The colony has reached its last era: the city rumbles, keep it standing.',
  conditions: 'To get there',
  objectives: 'Objectives completed',
  population: 'Inhabitants',
  research: (name: string): string => `Research: ${name}`,
  invest: 'To invest on the way (bag, then town)',
  brings: 'What it brings',
  resource: (item: string): string => `New resource: ${item}`,
  buildings: 'In the “Build” menu',
  regions: (count: number): string => `${count} region${s(count)} to conquer: their guardians show up`,
  researchTab: (era: string, count: number): string => `“${era}” tab at the lab: ${count} research${count === 1 ? '' : 'es'}`,
  threat: 'New threat',
  advance: (era: string): string => `Move on to: ${era}`,
  missing: (count: number): string => `${count} condition${s(count)} still to meet`,
  ready: 'Everything is in place: it’s your move!',
  rejected: 'Some conditions are still missing to change eras.',
  reached: 'A new era!',
  onward: 'Onward!',
};
