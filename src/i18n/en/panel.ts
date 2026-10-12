/** Section `panel` du dictionnaire anglais. */

import type { Messages } from '../messages.ts';

/** Le pluriel anglais : seul 1 est au singulier. */
const s = (count: number): string => (count === 1 ? '' : 's');

export const panel: Messages['panel'] = {
  about: 'About',
  blocked: 'Stuck: chest full. Bump into it or tap Take all.',
  paused: 'Paused: nothing goes in or out. Tap Resume.',
  /** A producer stopped by a full chest: the map's alert bubble, explained. */
  storeFull: 'Storage full: production has stopped. Empty it or build a logistics post nearby.',
  transferButton: 'Transfer',
  transferBag: 'Transfer bag',
  cancelSite: 'Cancel site',
  cancelConfirm: 'Really cancel?',
  pause: 'Pause',
  resume: 'Resume',
  maxLevel: 'Max level',
  hp: (value: string): string => `Health: ${value}`,

  tabs: {
    label: 'Window tabs',
    building: 'Building',
    inventory: 'Inventory',
  },

  site: {
    allDelivered: 'All delivered: the builders are on their way to build it.',
    building: (builders: number, percent: number): string => `${builders} builder${s(builders)} hammering away — ${percent}%`,
    byYard: 'The construction post builders bring supplies from the town hall, then build it.',
    comeCloser: 'Under construction — come closer to deliver.',
    transferOrBump: 'Under construction — transfer your bag, or bump into it.',
    workers: (count: number): string => `Workers it will employ: ${count}`,
    coverage: {
      bag: 'Your bag has enough: transfer to finish it.',
      town: 'The town stock covers the rest: transfer to finish it.',
      both: 'Bag and town cover the rest: transfer to finish it.',
      short: 'Under construction — transfer bag and town, or bump into it.',
    },
    needDone: (item: string, delivered: number, needed: number): string => `${item}: ${delivered}/${needed}, all delivered`,
    needDelivered: (item: string, delivered: number, needed: number): string => `${item}: ${delivered}/${needed} delivered`,
    needIncoming: (count: number): string => `${count} on the way`,
    needTownEmpty: 'none left in town',
    needInTown: (count: number): string => `${count} in town`,
  },

  repair: {
    noStock: (item: string, hp: number): string => `Damaged — bring some ${item.toLowerCase()} to fix it (1 = ${hp} HP).`,
    damaged: (item: string, hp: number): string =>
      `Damaged — repair it, or bump into it with ${item.toLowerCase()} in your bag (1 = ${hp} HP).`,
    button: (amount: number, item: string): string => `Repair (${amount} ${item.toLowerCase()})`,
  },

  chest: {
    town: 'Town chest',
    plain: 'Chest',
    label: (count: string): string => `Chest ${count}`,
    emptyLabel: (label: string): string => `${label}: empty`,
    empty: 'empty',
  },

  townHall: {
    adults: (count: number): string => `Adults: ${count}`,
    children: (count: number): string => `Children: ${count}`,
    workers: (count: number): string => `Workers: ${count}`,
    nights: (count: number): string => `Nights survived: ${count}`,
    radius: (tiles: number): string => `Supply radius: sites within ${tiles} tiles draw from its chest`,
  },

  drill: {
    extracts: (item: string): string => `Extracting: ${item}`,
    dry: 'Built on dry ground: no deposit underneath.',
    running: 'Running.',
  },

  nursery: {
    perBirth: (recipe: string): string => `Each birth eats ${recipe}.`,
    hungry: (why: string): string => `Waiting for food. ${why}`,
    stock: (item: string, count: number, target: number, coming: number): string =>
      `${item} in store: ${count} of ${target} wanted${coming > 0 ? ` — ${coming} on the way` : ''}`,
    nextChild: 'Next child',
    full: 'Full: the next child waits for an older one to go to work.',
    nextAdult: (time: string): string => `Next worker in ${time}`,
    noKids: 'No children here yet.',
    kids: (count: number, capacity: number): string => `Children in the nursery: ${count} of ${capacity}`,
    born: (count: number): string => `Children born here: ${count}`,
  },

  forge: {
    noOne: 'Stopped: nobody at the furnace. Add a worker.',
    starved: (why: string): string => `Stopped. ${why}`,
    heating: 'The furnace is heating up.',
  },

  tower: {
    range: (weapon: string, tiles: number): string => `${weapon} — range: ${tiles} tiles`,
    alert: 'On alert: mutants incoming.',
    idle: 'On watch.',
  },

  farm: {
    growing: (count: number): string => `${count} sown tile${s(count)} growing`,
    ripe: (count: number): string => `${count} ripe tile${s(count)}, ready to harvest`,
    free: (count: number): string => `${count} free tile${s(count)} to sow`,
    field: (side: number): string => `Field: a ${side} × ${side} square around the farm.`,
    paused: 'Paused: the farmers bring back their harvest, then loaf around.',
    noOne: 'Stopped: no farmer. Add a worker. Nothing gets sown.',
    sowing: 'The farmers are sowing, tile by tile.',
    harvesting: 'The farmers are harvesting what is ripe.',
    asleep: 'The farmers are asleep; the crops keep growing.',
    growingLine: 'The field is growing: the farmers wait for it to ripen.',
    nowhere: 'No tile to farm here: water, sand, rock, roads or buildings.',
  },

  quarry: {
    noOne: 'Stopped: nobody cutting stone. Add a worker.',
    working: 'Pickaxes chipping away at the ruin.',
  },

  well: {
    noOne: 'Stopped: nobody at the winch. Add a worker.',
    working: 'The bucket comes up full.',
  },

  house: {
    sleeping: 'The workers sleep here between shifts.',
    beds: 'Whoever has no bed finds one here, the closest to their work.',
    bedsTaken: (used: number, beds: number): string => `Beds taken: ${used}/${beds}`,
  },

  lumberCamp: {
    radius: (tiles: number): string => `Radius: lumberjacks fell trees within ${tiles} tiles`,
    paused: 'Paused: the lumberjacks bring back their wood, then loaf around.',
    noOne: 'Stopped: no lumberjack. Add a worker.',
    noTrees: 'No trees left in range.',
    working: 'Axes ringing out.',
  },

  foresterHouse: {
    saplings: (count: number): string => `${count} sapling${s(count)} growing`,
    trees: (count: number): string => `${count} grown tree${s(count)}, ready to cut`,
    free: (count: number): string => `${count} free tile${s(count)} to plant`,
    plot: (side: number): string => `Forest: a ${side} × ${side} square around the house.`,
    paused: 'Paused: the forester puts down the spade and loafs around.',
    noOne: 'Stopped: no forester. Add a worker. Nothing gets planted.',
    toPlot: 'The forester is heading to the next tile.',
    planting: 'The forester is putting a sapling in the ground.',
    asleep: 'The forester is asleep and will replant tomorrow.',
    seeking: 'The forester is looking for a free tile.',
    full: 'Forest complete: the forester will replant whatever the lumberjacks cut.',
    nowhere: 'No tile to plant here: water, rock, roads or buildings.',
  },

  depot: {
    radius: (tiles: number): string => `Radius: logisticians empty producers within ${tiles} tiles`,
    none: 'No producer in range: they loaf around.',
    served: (count: number): string => `${count} producer${s(count)} in range: output goes to the town hall.`,
  },

  yard: {
    radius: (tiles: number): string => `Radius: builders supply and build sites within ${tiles} tiles`,
    paused: 'Paused: its sites go back to the porters and to you.',
    noOne: 'Stopped: no builder. Add a worker.',
    none: 'No site in range: they loaf around.',
    served: (count: number): string => `${count} site${s(count)} in range: the builders are on it.`,
  },

  antenna: {
    floor: (level: number, max: number): string => `Floor ${level}/${max}`,
    nextFloor: 'The next floor is delivered like a site: transfer, bump into it, or let the porters do it.',
    signalSent: 'The Signal is out: survivors arrive every dawn.',
    lureNight: (night: number): string => `On night ${night}, every wave will march on it.`,
    lureTonight: 'Tonight, every wave is marching on it.',
  },

  enemyBase: {
    level: (level: number): string => `Level ${level}`,
    zone: (tiles: number): string => `Held zone: no harvesting or building within ${tiles} tiles`,
    required: (gear: string, level: number): string => `Required gear: ${gear} (level ${level})`,
    weak: 'You need better gear: your arrows do nothing to it. Forge a better bow at the forge.',
    ready: 'Your bow can damage it: get closer, it shoots on its own.',
    prestige: (amount: number): string => `Destroyed, it gives ${amount} Prestige and frees its zone.`,
    raiders: (count: number, capacity: number): string => `Raiders in reserve: ${count} of ${capacity}`,
    guards: (count: number, max: number): string => `Guards: ${count} of ${max}`,
    spitters: (count: number, max: number): string => `Spitters: ${count} of ${max}`,
    fire: (range: number, damage: number): string => `Fireballs: ${damage} hit points at ${range} tiles`,
    fireWarning: 'It fires fireballs at anyone entering its zone: a glow warns of each one, keep moving to dodge.',
    chief: (hp: number, max: number): string => `Chief: ${hp} of ${max} hit points`,
    shielded: 'Shielded by its chief: no arrow harms it while he lives. Bring him down first — he never comes back.',
    chiefReward: (prestige: number): string => `Its chief, defeated, gives ${prestige} Prestige and rare loot.`,
    raid: 'By day it breeds raiders; at nightfall they all march on the town.',
    asleep: (night: number): string => `It sends its first raiders only on night ${night}.`,
  },

  gear: {
    current: (gear: string, level: number): string => `Your bow: ${gear} (level ${level})`,
    next: (gear: string, level: number): string => `Forge: ${gear} — damages level ${level} bases`,
    button: 'Forge the bow',
    best: 'You have the best bow.',
    comeCloser: ' — get closer.',
  },

  barracks: {
    army: (n: number, max: number): string => `Troop: ${n}/${max}`,
    recruitTitle: 'Recruit',
    training: (label: string, seconds: number): string => `Training: ${label}, ${seconds} s left`,
    full: (max: number): string => `Troop is full: ${max} companions at most. A fallen companion frees a slot.`,
    rosterTitle: 'Army',
    none: 'No companions yet: recruit one above.',
    hp: (hp: number, max: number): string => `${hp}/${max} HP`,
    stats: {
      hp: (n: number): string => `${n} hit points`,
      damage: (n: number): string => `${n} damage per hit`,
      range: (n: number): string => `range ${n} tile${n > 1 ? 's' : ''}`,
      heal: (n: number): string => `heals ${n} hit point${n > 1 ? 's' : ''}`,
    },
    recruit: 'Recruit',
    seconds: (n: number): string => `${n} s of training`,
    comeCloser: ' — get closer.',
  },
  clinic: {
    beds: (used: number, beds: number): string => `Beds taken: ${used}/${beds}`,
    full: 'Full: defeated mutants no longer drop stunned for it.',
    open: 'A defeated mutant may drop stunned — touch it and it will follow you here.',
  },

  creature: {
    field: {
      sex: 'Sex',
      age: 'Age',
      role: 'Job',
      species: 'Species',
      doing: 'Doing',
      employer: 'Works for',
      bed: 'Sleeps at',
      carry: 'Carrying',
      rank: 'Role',
      target: 'Marching on',
      status: 'Status',
      trait: 'Trait',
      bio: 'Biography',
    },
    sex: {
      male: 'Man',
      female: 'Woman',
    },
    age: (years: number): string => `${years} year${s(years)} old — one more at every dawn`,
    role: {
      free: 'Free worker',
      porter: 'Porter',
      logistician: 'Logistician',
      builder: 'Builder',
      lumberjack: 'Lumberjack',
      forester: 'Forester',
      farmer: 'Farmer',
      child: 'Child',
      exMutant: 'Ex-mutant, porter',
      survivor: 'Survivor, porter',
    },
    roleFemale: {
      free: 'Free worker',
      porter: 'Porter',
      logistician: 'Logistician',
      builder: 'Builder',
      lumberjack: 'Lumberjack',
      forester: 'Forester',
      farmer: 'Farmer',
      child: 'Child',
      exMutant: 'Ex-mutant, porter',
      survivor: 'Survivor, porter',
    },
    trait: {
      hardworking: { name: 'Hard worker', effect: 'quicker at the job' },
      glutton: { name: 'Glutton', effect: 'gets hungry faster, but full of beans' },
      fearful: { name: 'Fearful', effect: 'danger weighs twice as much on them' },
      sturdy: { name: 'Sturdy', effect: 'lasts long without food or water, hardly shaken by danger' },
      dreamer: { name: 'Dreamer', effect: 'a little slow, head in the clouds: danger barely touches them' },
    },
    bios: {
      hardworking: [
        'Has already finished tomorrow’s work, and brags about it.',
        'Sleeps in work gloves, just in case.',
        'Counts bricks to unwind.',
      ],
      glutton: [
        'Knows the lichen soup recipe by heart, and eats it too.',
        'Always keeps a bread crust in a pocket, “for later”.',
        'Complains about the menu, served up a third time.',
      ],
      fearful: [
        'Hears a mutant in every draught.',
        'Has an escape plan for every room, closets included.',
        'Says hello to shadows, to be safe.',
      ],
      sturdy: [
        'Once lifted a town hall door, just to see.',
        'Jokes with hunger: “Come back when I’m done.”',
        'Sips from the canteen once a week, and swears it’s full.',
      ],
      dreamer: [
        'Sees animals in the ash clouds.',
        'Writes songs for the trees, who never answer.',
        'Dreams of a whale-shaped roof.',
      ],
    },
    rename: {
      label: 'Name',
      placeholder: 'A new name',
      confirm: 'Rename',
      hint: 'Leave empty to get the original name back.',
    },
    homeless: 'nobody',
    outside: 'outside, no bed',
    emerging: 'Crawling out of its puddle',
    beast: {
      roam: 'Roaming around its den',
      chase: 'Charging Adam!',
      return: 'Heading back to its den',
    },
    spitter: 'Spits from afar, and backs off if you come close',
    chief: 'Chief of its base: while he lives, the base is shielded',
    slamming: 'Raising his club — get out of the circle!',
  },

  crew: {
    less: 'One worker fewer',
    more: 'One worker more',
    missing: (count: number): string => `${count} worker${s(count)} missing: the post fills up as soon as someone is free.`,
    none: 'No workers: the building is stopped.',
    assigned: (filled: number, returned: number): string =>
      `${filled} worker${s(filled)} assigned` + (returned > 0 ? `, ${returned} sent back to town.` : '.'),
    priority: {
      label: 'Priority',
      low: 'Low',
      normal: 'Medium',
      high: 'High',
    },
  },

  upgrade: {
    effect: (action: string, effect: string): string => `${action}: ${effect}`,
    comeCloser: ' — come closer.',
    lacking: (count: number): string => `${count} short`,
    hp: (from: number, to: number): string => `HP ${from} → ${to}`,
    range: (from: number, to: number): string => `range ${from} → ${to}`,
    rate: (percent: number): string => `fire rate ${percent > 0 ? '+' : ''}${percent}%`,
  },

  starved: {
    coming: (item: string): string => `${item}: the porters are bringing it.`,
    inTown: (item: string, count: number): string => `${item} in town: ${count} — the porters are coming.`,
    noPorter: (item: string, count: number, inRange: boolean): string =>
      `${item} in town: ${count} — no porter: ${inRange ? 'transfer it' : 'bring it over'}.`,
    inBag: (item: string): string => `${item} in your bag — bump into it or transfer.`,
    nowhere: (item: string): string => `No ${item.toLowerCase()} anywhere — go gather some.`,
  },

  recipeAmount: (amount: number, item: string): string => `${amount} ${item.toLowerCase()}`,
  duration: (minutes: number, seconds: number): string =>
    minutes > 0 ? `${minutes} min ${seconds.toString().padStart(2, '0')} s` : `${seconds} s`,

  transfer: {
    quantity: 'Amount per tap',
    all: 'All',
    bag: 'Adam’s bag',
    takeAll: 'Take all',
    depositAll: 'Deposit all',
    empty: 'Empty',
    reserved: (count: number): string => `${count} reserved`,
    comeCloser: 'Come closer to the building to trade items.',
    bagFull: 'Bag full: deposit before taking.',
    nothingFits: 'Nothing in your bag fits this chest right now.',
  },

  placement: {
    locked: 'You don’t have the blueprint',
    terrain: 'Not on water',
    occupied: 'Tile taken',
    onPlayer: 'You are standing on the spot',
    outOfReach: 'Too far — come closer',
    unique: 'Only one per colony',
    footing: {
      text: (vein: string | null, ore: number, grass: number): string =>
        vein === null
          ? `A drill sits on ${ore} tiles of an ore vein and ${grass} grass tiles.`
          : `${/^[aeiou]/.test(vein) ? 'An' : 'A'} ${vein} drill sits on ${ore} ${vein} tiles and ${grass} grass tiles.`,
      remedy: 'Straddle the edge of the vein: break its rocks, keep the grass',
    },
    veins: { ironOre: 'iron', coal: 'coal', stone: 'stone' },
    polluted: { text: 'Polluted land', remedy: 'A cleanup station next to it will make it clean' },
    radioactive: { text: 'Radioactive land', remedy: 'Unbuildable, and nothing cleans it for now' },
    road: { text: 'A road runs here', remedy: 'Remove it first: Build › Road › Remove' },
    shore: { text: 'The well goes on a riverbank', remedy: 'Set it right against the water: it draws from it' },
    nearHall: { text: 'Too close to the town hall', remedy: 'Move away, outside the circle around it' },
    treesAndRocks: { text: 'Trees and rocks in the way', remedy: 'Adam can harvest them' },
    rocks: { text: 'Rocks in the way', remedy: 'Adam can break them' },
    rock: { text: 'A rock is in the way', remedy: 'Adam can break it' },
    trees: { text: 'Trees in the way', remedy: 'Adam can chop them' },
    tree: { text: 'A tree is in the way', remedy: 'Adam can chop it' },
    enemyZone: { text: 'A mutant base holds this zone', remedy: 'Take it down with a bow of its level' },
    unexplored: 'Unexplored area — go there first',
    extracts: (item: string): string => `Will extract: ${item}`,
    roads: {
      noStone: { text: 'Out of stone for the rest', remedy: 'Break some rocks, or draw within the town hall radius' },
      terrain: { text: 'Not on water', remedy: '' },
      occupied: { text: 'A building is on the path', remedy: '' },
      resource: { text: 'A tree or rock is in the way', remedy: 'Adam can harvest it' },
      enemyZone: { text: 'A mutant base holds the zone', remedy: 'Take it down with a bow of its level' },
      unexplored: { text: 'The path runs into the unknown', remedy: 'Explore the area first' },
      polluted: { text: 'Polluted land on the path', remedy: 'A purifier will make it clean' },
      radioactive: { text: 'Radioactive land on the path', remedy: 'Unbuildable, and nothing cleans it yet' },
    },
  },
};
