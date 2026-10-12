/**
 * Section `hud` du dictionnaire anglais : la quête, le conseil, l'horloge,
 * les bulles, les bandeaux, les écrans de victoire et de défaite.
 */

import { BUILDINGS } from '../../data/buildings.ts';
import type { Messages } from '../messages.ts';

/** « s » au pluriel : en anglais, tout sauf 1. */
const s = (n: number): string => (n === 1 ? '' : 's');

/** Un nom tel qu'on le lit au milieu d'une phrase : « Wood » → « wood ». */
const lower = (name: string): string => String(name).toLowerCase();

export const hud: Messages['hud'] = {
  rejection: {
    occupied: 'Spot already taken',
    road: 'A road runs here — remove it first',
    terrain: 'Can’t build on this ground',
    polluted: 'Polluted land — a cleanup station will make it clean',
    radioactive: 'Radioactive land — nothing cleans it, not yet',
    outOfReach: 'Too far — get closer',
    resource: 'Clear the trees and rocks first',
    onPlayer: 'You’re standing on the spot',
    locked: 'Not unlocked yet — you need its blueprint, or one more night',
    unique: 'Only one per colony — you already have one',
    shore: 'The well goes on a riverbank',
    nearHall: `Too close to the town hall — the antenna stands at least ${BUILDINGS.antenna.hallDistance} tiles away`,
    enemyZone: 'A mutant base holds this zone — take it down first',
    unexplored: 'Unexplored area — go there first',
  },
  road: {
    noStone: (paved: number): string => `Out of stone: road stopped after ${paved} tile${s(paved)}`,
    noStoneAtAll: 'No stone to pave with — none in the bag, none in town nearby',
    terrain: 'No roads on water',
    occupied: 'A road can’t run under a building',
    resource: 'Skipped trees and rocks: clear them to pave',
    enemyZone: 'No roads inside a mutant base’s zone',
    unexplored: 'No roads into the unknown: explore first',
    polluted: 'No roads on polluted land — a purifier will clean it',
    radioactive: 'No roads on radioactive land',
  },
  gear: {
    outOfReach: 'Too far from the forge — get closer',
    maxLevel: 'You already have the best bow',
    missingItems: 'Not enough to forge this bow — not in the bag, not in town',
  },
  recruit: {
    outOfReach: 'Too far from the barracks — get closer',
    busy: 'The barracks is already training a recruit',
    full: 'Troop is full: five companions at most',
    missingItems: 'Not enough to equip this recruit — not in the bag, not in town',
  },
  repair: {
    outOfReach: 'Too far — get closer',
    intact: 'Nothing to repair',
    noMaterial: 'You need wood to repair — none in the bag, none in town',
  },
  from: {
    north: 'from the north',
    northEast: 'from the northeast',
    east: 'from the east',
    southEast: 'from the southeast',
    south: 'from the south',
    southWest: 'from the southwest',
    west: 'from the west',
    northWest: 'from the northwest',
  },
  toast: {
    depositFar: 'Too far from the town hall — get closer to drop off',
    depositNoTown: 'No town yet: build the town hall first',
    siteNothing: 'Nothing in the bag this site needs',
    supplyNothing: 'Nothing in the bag or in town this building needs',
    nurseryHungry: 'The nursery needs food for the next child',
    chestEmpty: 'The chest is empty',
    bagFullTake: 'Bag full — no room to take more',
    bagFullTown: 'Bag full — go drop it off in town',
    bagFullSite: 'Bag full — go deliver to the site',
    bagFullDrop: 'Bag full — tap the bag, then "Drop"',
    upgradeMissing: 'Not enough to pay — not in the bag, not in town',
    repairedFromTown: (amount: number, item: string): string => `Repaired with ${amount} ${lower(item)} from town`,
    eveRadio: (line: string): string => `Eve, on the radio: ${line}`,
    dusk: 'Night is falling — head home!',
    dawn: (night: number): string => `Dawn! Night ${night} survived`,
    destroyed: (building: string): string => `${building} destroyed`,
    siteCancelled: (building: string, toTown: boolean): string =>
      `Site cancelled: ${building} — ${toTown ? 'deliveries go back to town' : 'deliveries stay on the ground'}`,
    childBorn: (name: string): string => `${name} was born at the nursery!`,
    mutantStunned: 'A mutant knocked out! Touch it to take it to the clinic',
    patientFollowing: 'It limps along behind you — off to the clinic',
    patientAdmitted: 'Admitted to the clinic: one night of care',
    mutantHealed: 'An ex-mutant leaves the clinic: one more porter!',
    kidGrewUp: (name: string): string => `${name} is 14, one more worker`,
    starving: {
      hunger: (name: string, seconds: number): string => `${name} will starve in ${seconds} s — food!`,
      thirst: (name: string, seconds: number): string => `${name} will die of thirst in ${seconds} s — water!`,
    },
    workerStarved: {
      hunger: (name: string): string => `${name} starved to death`,
      thirst: (name: string): string => `${name} died of thirst`,
    },
    growthStunted: {
      hunger: (name: string): string => `${name} is hungry: no birthday this dawn`,
      thirst: (name: string): string => `${name} is thirsty: no birthday this dawn`,
    },
    weatherSoon: (weather: string, seconds: number, advice: string): string => `${weather} in ${seconds} s — ${advice}`,
    weatherEnded: (weather: string): string => `Over: ${lower(weather)}`,
    knockedOut: 'Adam passed out — he wakes up at the town hall',
    eveArriving: 'Someone’s coming by bike…',
    eveArrived: 'Eve has joined the colony!',
    caravanArriving: 'A trading caravan pulls up at the edge of the clearing',
    caravanLeaving: 'The caravan is leaving',
    storedItem: (amount: number, item: string): string => `${amount} ${lower(item)}`,
    storedAtHall: (list: string): string => `Bag full: ${list} waiting at the town hall`,
    tradeFar: 'Get closer to the cart',
    tradeMissing: 'Not enough to pay for this trade',
    tradeDone: 'This trade is already done',
    tradeGone: 'The caravan has left',
    planReceived: (building: string): string => `Blueprint received: ${building}`,
    toolReceived: (tool: string): string => `Tool received: ${tool}`,
    researchStarted: (research: string): string => `${research}: research begins`,
    researchCompleted: (effect: string): string => `Research complete — ${effect}`,
    buildingsUnlocked: (n, labels) => (n > 1 ? `New buildings unlocked: ${labels}` : `New building unlocked: ${labels}`),
    researchBusy: 'This lab’s queue is full',
    researchTaken: 'Another lab already has this research',
    researchLocked: 'Another research comes before this one',
    researchNothing: 'Nothing in the bag or in town this research needs',
    antennaRaised: (floor: number, night: number): string =>
      `Floor ${floor} is up! On night ${night}, every wave will march on the antenna.`,
    antennaFell: (floor: number): string => `The antenna lost a floor — back down to floor ${floor}`,
    betterGear: (gear: string, level: number): string => `You need better gear: ${gear} (level ${level}) — forge it at the forge`,
    enemyZone: (level: number): string => `Mutant base zone (level ${level}): no harvesting or building while it stands`,
    baseDestroyed: (prestige: number): string => `Mutant base destroyed! +${prestige} Prestige, its zone is free`,
    baseShielded: 'Its chief shields it: bring him down first, the shield falls with him',
    levelUp: (level: number, maxHp: number, bowDamage: number): string =>
      `Level ${level}! +${maxHp} max HP, +${Math.round(bowDamage * 100) / 100} bow damage`,
    chiefDefeated: (prestige: number): string => `Base chief defeated! +${prestige} Prestige — the base has lost its shield`,
    companionTraining: (label: string, seconds: number): string => `${label} in training — ${seconds} s`,
    companionJoined: (label: string): string => `${label} joins Adam!`,
    companionDied: (label: string): string => `${label} has fallen — recruit another at the barracks`,
    gearCrafted: (gear: string, level: number): string => `${gear} forged: you can now damage level ${level} bases`,
    survivors: (count: number): string =>
      count > 1
        ? `${count} survivors answer the antenna’s call: ${count} more porters`
        : 'A survivor answers the antenna’s call: one more porter',
  },
  float: {
    built: (building: string): string => `${building} built!`,
    upgraded: (level: string): string => `${level}!`,
    enough: 'enough',
    prestige: (amount: number): string => `+${amount} Prestige`,
    /** Experience gained from a slain enemy. */
    xp: (amount: number): string => `+${amount} XP`,
  },
  wave: {
    night: (night: number): string => `Night ${night}`,
    reinforcements: 'Reinforcements',
    queen: (from: string): string => `The Puddle Queen rises ${from}!`,
    boss: (from: string, target: string): string => `A big mutant leads the charge ${from}: it’s after the ${lower(target)}!`,
    mutants: (count: number, bases: number, from: string, target: string): string =>
      bases > 1
        ? `${count} mutants leave ${bases} bases, the closest ${from}: they’re after the ${lower(target)}!`
        : count > 1
          ? `${count} mutants coming ${from}: they’re after the ${lower(target)}!`
          : `${count} mutant coming ${from}: it’s after the ${lower(target)}!`,
    cleared: (night: number): string => `Night ${night} — wave repelled!`,
    clearedText: 'Pick up what the mutants dropped',
    queenSlain: 'The Puddle Queen has fallen!',
    queenSlainText: (night: number): string => `Night ${night} — her radioactive core is on the ground`,
    queenNight: (night: number): string => `Night ${night} — the Puddle Queen`,
    queenIn: (time: string): string => `She rises in ${time}`,
  },
  quest: {
    objective: (index: number, total: number): string => `Goal ${index}/${total}`,
    afterSignal: 'After the Signal',
    buildHall: 'Build the town hall',
    defeat: 'Defeat',
    hallFallen: 'The town hall has fallen.',
    attack: 'Attack!',
    endless: 'Hold out as long as you can',
    status: (night: number, mutants: number): string => `Night ${night} · ${mutants} mutant${s(mutants)}`,
    inhabitants: 'Inhabitants',
    kills: 'Mutants defeated',
    crew: (free: number, total: number): string => `${free} free worker${s(free)} of ${total} — see details`,
    noCrew: 'No workers yet.',
    assigned: 'Assigned',
    free: 'Free',
    emptyPosts: 'Empty posts',
    portersBusy: 'Porters busy',
    portersIdle: 'Porters waiting',
    stripPaused: 'paused',
    stripMissing: (missing: number, item: string): string => `${missing} ${lower(item)}`,
    stripBaby: (time: string): string => `baby ${time}`,
    stripNight: (time: string): string => `night ${time}`,
    nurseryPaused: 'the nursery is paused',
    nurseryWaits: (missing: number, item: string): string => `the nursery needs ${missing} ${lower(item)}`,
    babyIn: (time: string): string => `baby in ${time}`,
  },
  clock: {
    night: (day: number, left: string): string => `Night ${day} · dawn in ${left}`,
    day: (day: number, left: string): string => `Day ${day} · night in ${left}`,
    short: (day: number): string => `D${day}`,
  },
  weather: {
    soon: (weather: string, seconds: number): string => `${weather} in ${seconds} s`,
  },
  needAlert: {
    soonShort: (minutes: number): string => `${minutes} min`,
    outShort: 'out',
    soon: (item: string, minutes: number, who: string): string => `${item}: only ${minutes} min left in town${who ? ` — ${who}, tap to see` : ''}`,
    out: (item: string, who: string): string => `${item}: the town has none left${who ? ` — ${who}, tap to see` : ''}`,
    wanting: {
      hunger: (count: number): string => `${count} hungry`,
      thirst: (count: number): string => `${count} thirsty`,
    },
  },
  people: {
    working: (n: number): string => `${n} worker${n === 1 ? '' : 's'} working`,
    idle: (n: number): string => `${n} idle worker${n === 1 ? '' : 's'}${n > 0 ? ' — tap to see one' : ''}`,
    children: (n: number): string => `${n} child${n === 1 ? '' : 'ren'}`,
    housing: (housed: number, population: number): string =>
      `Housing — ${housed} housed out of ${population} inhabitant${population === 1 ? '' : 's'}` +
      (population > housed ? `: ${population - housed} sleep${population - housed === 1 ? 's' : ''} outside, build a House` : ''),
    happinessName: 'Town happiness',
    happiness: (total: number, average: number, unhappy: number): string =>
      `Town happiness: ${total} (average ${average} per inhabitant, ${unhappy} unhappy)`,
  },
  army: {
    label: (n: number, max: number, hp: number, maxHp: number, training: number): string =>
      `Companions: ${n}/${max} — health ${hp}/${maxHp}` + (training > 0 ? ` (${training} in training)` : ''),
  },
  stock: {
    bag: 'Bag',
    bagLabel: (total: number, capacity: number): string => `Open the bag: ${total} items out of ${capacity}`,
    bagLabelTown: (total: number, capacity: number, town: number): string =>
      `Open the bag: ${total} items out of ${capacity}, ${town} in town`,
    town: 'Town',
    toBuild: 'to build',
    townTitle: 'Town — the town hall stock, which pays for construction',
    bagTip: (total: number, capacity: number): string => `Bag — ${total} item${total === 1 ? '' : 's'} out of ${capacity}`,
    townTotal: (total: number): string => `Town — ${total} item${total === 1 ? '' : 's'} in stock`,
    inBag: (item: string, amount: number): string => `${item} — ${amount} in the bag`,
    inTown: (item: string, amount: number): string => `${item} — ${amount} in town`,
    inTownUp: (item: string, amount: number): string => `${item} — ${amount} in town, rising`,
    inTownDown: (item: string, amount: number): string => `${item} — ${amount} in town, falling`,
    wanted: (item: string, amount: number): string => `${item} — Eve needs it, ${amount} in the bag`,
    prestige: 'Prestige',
    prestigeLabel: (amount: number): string => `Prestige: ${amount}`,
    /** Adam's level, short, in the town banner. */
    level: (level: number): string => `Lv ${level}`,
    levelTip: (level: number, into: number, needed: number, max: boolean): string =>
      max ? `Level ${level} (maximum)` : `Level ${level} — ${into} / ${needed} XP to the next`,
  },
  hintBulb: 'Show the tip',
  pause: 'Pause',
  objectiveDone: 'Goal complete!',
  victory: {
    endless: 'Keep going forever',
    nights: 'Nights held',
    kills: 'Mutants defeated',
    inhabitants: 'Inhabitants',
    buildings: 'Buildings',
    playTime: 'Play time',
  },
  death: {
    title: 'You died',
    countdown: (seconds: number): string => `Respawning in ${seconds} s`,
  },
  defeat: {
    title: 'The town hall has fallen',
    text: 'The mutants got the better of the colony’s first roof.',
    replay: 'Replay this map',
    fresh: 'New map',
    seeds: (seeds: number): string => `+${seeds} seed${s(seeds)}`,
    seedsHint: 'To plant in the memory garden, on the title screen.',
    nights: 'Nights survived',
    kills: 'Mutants defeated',
    time: 'Time held',
  },
  hint: {
    harvestPlenty: (item: string): string => `The town has plenty of ${lower(item)} — Adam stops picking it up`,
    harvestDeliver: (item: string): string => `Enough ${lower(item)} in the bag for the sites — go deliver it`,
    harvestNone: (item: string): string => `Enough ${lower(item)}: no site needs any more`,
    inSentence: (name: string): string => lower(name),
    lessThanMinute: 'less than a minute',
    minutes: (minutes: number): string => `${minutes} minute${s(minutes)}`,
  },
  person: {
    line: (name: string, age: number, occupation: string): string => `${name}, ${age} · ${occupation}`,
    child: 'child',
    childDays: (days: number): string => `child, starts work in ${days} day${s(days)}`,
    working: 'working',
    workingAt: (building: string): string => `working: ${building}`,
    idle: 'no job',
    home: 'at home',
    outside: 'asleep',
    mood: { content: 'happy', neutral: 'neutral', unhappy: 'unhappy' },
    moodLabel: (value: number): string => `Happiness: ${value}/100 — a night in a bed raises it, a night outside lowers it`,
    needs: {
      hunger: { sated: 'well fed', wanting: 'hungry', deprived: 'starving' },
      thirst: { sated: 'not thirsty', wanting: 'thirsty', deprived: 'parched' },
    },
  },
};
