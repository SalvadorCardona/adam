/** The game's content in English: every entry of `fr/content.ts`, translated. */

import type { content as fr } from '../fr/content.ts';
import type { Messages } from '../messages.ts';

type Content = Pick<Messages, keyof typeof fr>;

export const content: Content = {
  lore: {
    title: 'Mobile Factory',
    pitch:
      'An apocalyptic future. A handful of survivors. Adam, alone among the ruins, gathers wood and ore with his bare hands to build a town hall — the colony’s first roof. Eve will come next. And with her, the radioactive mutants prowling beyond the clearing.',
    signal: {
      actOne: 'Act I complete',
      title: 'The Signal',
      answer: 'Someone’s answering!',
      text: 'The antenna speaks: other survivors heard it, and they’re coming. As for the night, it isn’t done rising.',
    },
  },
  items: {
    wood: 'Wood',
    stone: 'Stone',
    coal: 'Coal',
    ironOre: 'Iron ore',
    food: 'Food',
    meat: 'Meat',
    water: 'Water',
    ironPlate: 'Iron plate',
    mutantGoo: 'Mutant goo',
    wolfFang: 'Wolf fang',
    crabClaw: 'Crab claw',
    radCore: 'Radioactive core',
  },
  buildings: {
    townHall: {
      label: 'Town hall',
      sign: 'Town hall',
      siteDescription:
        'The colony’s first building. The game starts on its construction site: bring it wood and stone to finish it.',
      description: 'The heart of the colony: if it falls, all is lost.',
      effect: 'The heart of the colony: if it falls, all is lost.',
      upgrades: [],
    },
    lumberCamp: {
      label: 'Lumber camp',
      sign: 'Lumberjacks',
      siteDescription: 'A few stacked logs, an axe stuck in the stump: the camp is waiting for its walls.',
      description:
        'A log cabin, its woodpile and its axe stuck in the stump. Two lumberjacks live here: they fell the nearby trees on their own and stack the wood in its chest, which porters empty into the town hall.',
      effect: '2 lumberjacks fell nearby trees on their own.',
      upgrades: [],
    },
    foresterHouse: {
      label: 'Forester’s house',
      sign: 'Forester',
      siteDescription: 'A wheelbarrow of young plants and a spade stuck in the earth: the house is waiting for its walls.',
      description:
        'A little house with a mossy roof, its seedling pots and its watering can. The forester who lives here plants a square of young trees all around, row by row, and replants every tile the lumberjacks have cut.',
      effect: '1 forester plants and replants a forest around it.',
      upgrades: [],
    },
    quarry: {
      label: 'Quarry',
      sign: 'Quarry',
      siteDescription: 'A makeshift crane over an old collapsed car park: three workers will break the concrete here.',
      description:
        'A collapsed car park, a jury-rigged crane and piles of pink rubble. Three workers cut stone from the ruins of the old world and store it in its chest, which porters empty into the town hall. No rock needed: there’s no shortage of ruins.',
      effect: '3 workers cut stone, no rock needed.',
      upgrades: [],
    },
    well: {
      label: 'Well',
      sign: 'Well',
      siteDescription: 'A half-built curb and two posts with no roof: one worker will draw water here.',
      description:
        'A stone curb, a winch and its bucket under a little roof. Set on a riverbank, one worker draws the water the colony drinks and stores it in its chest, which porters empty into the town hall.',
      effect: '1 worker draws 12 water a minute, on a riverbank.',
      upgrades: [],
    },
    logisticsPost: {
      label: 'Logistics post',
      sign: 'Logistics',
      siteDescription: 'Stacked crates and a crooked arrow sign: the post is waiting for its awning.',
      description:
        'A loading dock under a striped awning, stacked crates, a cart and an arrow sign. Four haulers, crates on their backs, empty the chests of nearby producers and bring everything back to the town hall.',
      effect: '4 haulers empty nearby producers into the town hall.',
      upgrades: [],
    },
    constructionPost: {
      label: 'Construction post',
      sign: 'Builders',
      siteDescription: 'A half-built workbench and a pile of planks: the post is waiting for its scaffolding.',
      description:
        'A workshop under scaffolding, a workbench, a pile of planks and striped barriers. Four builders, yellow hard hats and hammers on their belts, fetch from the town hall what nearby sites are missing, deliver it, then build them.',
      effect: '4 builders supply and build nearby sites.',
      upgrades: [],
    },
    drill: {
      label: 'Drill',
      sign: 'Drill',
      siteDescription: 'A stone frame waiting for its iron. Set on the edge of an ore vein, it will mine it on its own.',
      description: 'A salvaged machine that mines the vein beneath it.',
      effect: 'Mines the ore of the vein beneath it on its own.',
      upgrades: [],
    },
    nursery: {
      label: 'Nursery',
      sign: 'Nursery',
      siteDescription: 'Walls to raise before the cradle goes in. It needs wood and stone.',
      description:
        'A heated shelter, blankets, a cradle. Every three minutes a child is born here and the colony grows by one survivor — if there’s enough to feed them: each birth eats six food from the hunt.',
      effect: '+1 child every 3 min, for 6 food.',
      upgrades: [],
    },
    builderHouse: {
      label: 'Builders’ house',
      sign: 'Porters',
      siteDescription: 'A bunkhouse for four workers, still just a pile of planks and sheet metal.',
      description:
        'A bunkhouse of planks and sheet metal for four workers. Soon they’ll be the ones hauling resources instead of Adam.',
      effect: 'Houses 4 workers. No other effect yet.',
      upgrades: [],
    },
    home: {
      label: 'House',
      sign: 'House',
      siteDescription: 'A floor, some posts and four bed frames waiting for their walls.',
      description:
        'A two-storey house, its chimney smoking and a quilt airing at the window. Four inhabitants sleep warm here: without a bed, you sleep outside, wake up unhappy and drag your feet.',
      effect: '4 beds: 4 inhabitants sleep warm.',
      upgrades: [],
    },
    farm: {
      label: 'Farm',
      sign: 'Farm',
      siteDescription: 'A tool shed to put up before turning the soil. Four farmers will work here.',
      description:
        'A few furrows in the irradiated soil and a tool shed. Its farmers sow the field around it, tile by tile, watch it grow, then bring the harvest back to the chest.',
      effect: 'Up to 4 farmers work a 6 × 6 field: about 9 food per minute.',
      upgrades: [],
    },
    watchtower: {
      label: 'Watchtower',
      sign: 'Watchtower',
      siteDescription: 'Four posts in the ground, a platform to nail on top. The bow comes later.',
      description:
        'A plank platform on four posts, with a bow and a quiver. It shoots on its own at any mutant that wanders into range, and spots from afar what the fog hides.',
      effect: 'Shoots mutants within 8 tiles, sees 13 out.',
      upgrades: [
        {
          label: 'Reinforced watchtower',
          description:
            'A watchtower armored with iron plates. Its bow reaches farther and shoots faster than a plank tower’s.',
          action: 'Reinforce',
        },
      ],
    },
    forge: {
      label: 'Forge',
      sign: 'Forge',
      siteDescription: 'A stone furnace and its chimney, still cold. It needs iron ore to fire it up.',
      description:
        'A stone furnace, a smoking chimney and an anvil. Two iron ore and one coal become an iron plate here.',
      effect: '2 iron + 1 coal → 1 iron plate.',
      upgrades: [],
    },
    charcoalKiln: {
      label: 'Charcoal kiln',
      sign: 'Kiln',
      siteDescription: 'A brick dome to raise around a round door. It will need a stoker.',
      description:
        'A dome of pink bricks where wood smolders slowly. Its stoker bakes three wood into one coal, which porters carry to the town hall: the forge never runs dry, and spare wood finally has a use.',
      effect: '3 wood → 1 coal, 1 worker.',
      upgrades: [],
    },
    clinic: {
      label: 'Clinic',
      sign: 'Clinic',
      siteDescription: 'Walls to raise, a camp bed already waiting. It will also need food for the patients.',
      description:
        'Three camp beds, bandages and a mint cross on the door. A knocked-out mutant that Adam brings here walks out cured after a night of care — a villager, a little green around the edges, who carries more than the others.',
      effect: 'Treats knocked-out mutants: 3 beds.',
      upgrades: [],
    },
    purifier: {
      label: 'Cleanup station',
      sign: 'Cleanup',
      siteDescription: 'A tank to set down, pipes waiting for their pump. It needs a clean tile at the edge of the polluted land.',
      description:
        'A violet tank, a beating pump and a pipe sunk into the grey earth: around it, polluted land drains tile by tile and becomes good soil to build on again. Radioactive land does not budge.',
      effect: 'Cleans the polluted land around it, one tile at a time.',
      upgrades: [],
    },
    barracks: {
      label: 'Barracks',
      sign: 'Barracks',
      siteDescription: 'A palisade to raise, an empty rack waiting for weapons. The recruits will need gear afterwards.',
      description:
        'A squat fort, a rack of makeshift spears and a round shield above the door. Up to five companions are trained here — warrior, archer or healer — who follow Adam, fight at his side and patch him up when things go wrong.',
      effect: 'Trains companions who follow Adam: warrior, archer, healer. Five at most.',
      upgrades: [],
    },
    lab: {
      label: 'Research lab',
      sign: 'Lab',
      siteDescription: 'A plank shack, vials waiting on a crate, an antenna to put up.',
      description:
        'Gurgling vials, a jury-rigged antenna and a chimney that smokes when it’s thinking. Drop off wood, stone and enemy trophies; out come upgrades for the whole game.',
      effect: 'Research: a better bow, a bigger bag, stronger porters… One research at a time per lab: build another to run two.',
      upgrades: [],
    },
    antenna: {
      label: 'Antenna',
      sign: 'Antenna',
      siteDescription: 'A stone base to pour, beams to raise: the first floor of the Signal.',
      description:
        'A pylon of beams on a stone base. Each floor built draws the mutants: the next night, every wave marches on it.',
      effect: 'Three floors to call other survivors. At least 8 tiles from the town hall.',
      upgrades: [
        {
          label: 'Antenna — 2nd floor',
          description:
            'The pylon rises, ringed with iron plates, a radioactive core in its cage. One more floor and the transmitter can talk.',
          action: 'Build the floor',
        },
        {
          label: 'Antenna — transmitter',
          description:
            'At the top, the dish and its two radioactive cores: the Signal goes out to other survivors, and they answer.',
          action: 'Build the transmitter',
        },
      ],
    },
  },
  resources: {
    tree: 'Chop',
    ironRock: 'Mine',
    coalRock: 'Mine',
    stoneRock: 'Break',
  },
  recipes: {
    mineOre: 'Mining',
    cutStone: 'Stonecutting',
    drawWater: 'Drawing water',
    raiseChild: 'Birth',
    smeltPlate: 'Smelting',
    burnCharcoal: 'Charring',
  },
  weapons: {
    bow: 'Makeshift bow',
    towerBow: 'Tower bow',
    reinforcedBow: 'Reinforced bow',
  },
  companionClasses: {
    warrior: { label: 'Warrior', effect: 'Fights up close, lots of hit points.' },
    archer: { label: 'Archer', effect: 'Shoots from afar and keeps his distance, few hit points.' },
    healer: { label: 'Healer', effect: 'Does not fight: heals Adam and wounded companions.' },
  },
  enemies: {
    mutant: 'Radioactive mutant',
    brute: 'Big mutant',
    queen: 'Puddle Queen',
    larva: 'Puddle larva',
  },
  wildlife: {
    crab: 'Ruin crab',
    wolf: 'Indigo wolf',
    guardian: 'Base guardian',
    spitter: 'Base spitter',
    chief: 'Base chief',
  },
  enemyBase: {
    label: 'Mutant base',
    description: 'A camp of ruins and glowing puddles. While it stands, nobody builds or harvests in its zone.',
  },
  gear: ['Makeshift bow', 'Iron-bound bow', 'Composite bow', 'Radioactive bow'],
  pieces: {
    hairShort: 'Rebel cowlick',
    hairBuzz: 'Buzz cut',
    hairCurly: 'Curls',
    hairMohawk: 'Mohawk',
    hairBun: 'Gardener’s bun',
    eyesBold: 'Steady gaze',
    eyesSleepy: 'Heavy lids',
    eyesBright: 'Sparkling eyes',
    eyesWink: 'Wink',
    eyesStarry: 'Starry eyes',
    beardNone: 'Clean-shaven',
    beardStubble: 'Stubble',
    beardShort: 'Short beard',
    beardMustache: 'Handlebar moustache',
    beardFull: 'Trapper beard',
    beardBraid: 'Braided beard',
    topTunic: 'Belted tunic',
    topHoodie: 'Hoodie',
    topJacket: 'Work jacket',
    topPoncho: 'Striped poncho',
    topArmor: 'Scrap breastplate',
    pantsCargo: 'Cargo trousers',
    pantsShorts: 'Shorts',
    pantsPatched: 'Patched jeans',
    pantsStriped: 'Striped trousers',
    pantsGarden: 'Flowered trousers',
    shoesBoots: 'Clodhoppers',
    shoesSandals: 'Sandals',
    shoesSneakers: 'Sneakers',
    shoesRainBoots: 'Rain boots',
    shoesBunny: 'Bunny slippers',
    glassesNone: 'No glasses',
    glassesRound: 'Round glasses',
    glassesAviator: 'Aviator glasses',
    glassesGoggles: 'Welding goggles',
    hatNone: 'Bare head',
    hatBandana: 'Bandana',
    hatFlower: 'Flower behind the ear',
    hatCap: 'Cap',
    hatStraw: 'Straw hat',
    hatAntenna: 'Tinkered antenna',
  },
  tools: {
    axe: 'Sharpened axe',
    pickaxe: 'Scrap pickaxe',
  },
  quests: {
    housing: {
      label: 'Build a house',
      give: 'A house, Adam! Nobody rebuilds the world without a roof overhead.',
      done: 'Cosy. Here, my blueprint for the builders’ house!',
    },
    towers: {
      label: 'Two watchtowers',
      give: 'Two watchtowers, and I’ll sleep like a baby.',
      done: 'Perfect! Gift for you: a sharpened axe. Trees, watch yourselves.',
    },
    builders: {
      label: 'Builders’ house',
      give: 'My blueprint won’t build itself: the builders’ house!',
      done: 'Four more pairs of hands! And for you, a scrap pickaxe.',
    },
  },
  objectives: [
    {
      title: 'Build the Town hall',
      hint: 'Wood and stone to the site, Adam.',
      celebration: 'The first roof stands: the town hall becomes the town’s storehouse.',
      banner: '',
    },
    {
      title: 'Survive 3 nights',
      hint: 'At night, stay near the town hall: your bow shoots by itself. I’ll show up after the third!',
      celebration: 'Eve rolls in on her cargo bike, with a spare bag: +20 slots.',
      banner: '',
    },
    {
      title: 'Answer Eve’s requests',
      hint: 'Tap me to see what I need. Every request done, a blueprint or a tool!',
      celebration: 'All of Eve’s requests done: she fixes the town hall up like new.',
      banner: '',
    },
    {
      title: 'Mine 20 iron ore',
      hint: 'A drill near the blue rocks: that’s where the iron sleeps.',
      celebration: 'The drill is spinning. Enough to build a nursery: +14 wood, +6 stone.',
      banner: '',
    },
    {
      title: 'See the first child born',
      hint: 'A nursery, with six food from the hunt inside: a baby!',
      celebration: 'A child is born: the colony has a future. Town hall repaired, +20 bag slots.',
      banner: '',
    },
    {
      title: 'Hold out for 5 nights',
      hint: 'Towers all around the town hall, and you in the middle. Five nights and we’re safe, Adam!',
      celebration: 'The colony will live. Eve has an idea: an antenna to call other survivors.',
      banner: 'Act I complete',
    },
    {
      title: 'Build the Antenna',
      hint: 'An antenna 8 tiles from the town hall, three floors: you’ll need the Queen’s cores, and to defend it!',
      celebration: 'Someone’s answering!',
      banner: '',
    },
  ],
  eve: {
    hints: {
      bagFull: 'Your bag’s overflowing, Adam. Go dump all that on the site!',
      bagUseless: 'Your bag is full of {item}, Adam: place a site that needs it, or tap the bag then "Drop".',
      wood: 'Hello, Adam? Eve here. Walk past the trees: we need wood.',
      stone: 'Stone next. Get close to the pink rocks.',
      deliver: 'Drop it all off: walk into the site, or tap it.',
      tower: 'Mutants come out at night! A watchtower, quick.',
      bow: 'Stay close to them: your bow shoots by itself.',
      repair: 'The town hall is damaged! Charge into it with wood, or tap it then "Repair".',
      repairFetch: 'The town hall is damaged! Bring back wood and charge into it: that fixes it.',
      well: 'Our workers are getting thirsty, Adam! Place a well on a riverbank: a single worker draws water there.',
      quarry: 'Out of stone in town? Place a quarry: its workers cut it from the ruins.',
      coming: 'Hang in there: {n} more night{s} and I’m coming with my machine!',
      labForge: 'To reinforce our towers, we’ll need iron plates. Build a lab: that’s where we’ll learn to forge.',
      foundry: 'At the lab, start the Foundry: the forge and the charcoal kiln will show up in “Build”.',
      forge: 'The forge is unlocked! Iron and coal in, iron plates out.',
      kiln: 'Forge hungry for coal? A charcoal kiln bakes your spare wood: three logs, one coal.',
      waitBirth: 'The baby arrives in {time}.',
      waitDawn: 'Next dawn in {time}.',
      meanwhile: '{wait} In the meantime: {todo}',
      meanwhileRepair: 'fix what’s damaged ({building}) by charging into it with wood?',
      meanwhileTower: 'one more watchtower around the town hall?',
      meanwhileSecondTower: 'a second watchtower, on the other side of the town hall?',
      meanwhileStock: 'the town is short on {item}, go gather some?',
      meanwhileResearch: 'the lab is free, pick it a research?',
      meanwhileIdle: '{wait} Make the most of it and explore a bit!',
    },
    arrival: [
      'Adam! It’s me, Eve. I followed the smoke.',
      'Nice town hall. A bit crooked, but nice.',
      'I’m settling in here. I’ll patch up whatever they break.',
    ],
    chatter: [
      'You really plan to carry everything by hand? Brave.',
      'This bike? Three toasters and a wheelbarrow. You’re welcome.',
      'Mutants have such adorable smiles. From a distance.',
      'If it squeaks, I fix it. If it doesn’t squeak, I improve it.',
      'You don’t talk much, huh. Fine by me, I talk for two.',
    ],
    caravan: 'A caravan! Go see what he’s offering.',
    queen: 'Tomorrow night, the Queen comes out. Towers, Adam!',
    busy: 'Not now, Adam, they’re coming!',
    allDone: 'No more blueprints for now. I’m sketching what’s next!',
  },
  researchStats: {
    bowDamage: { label: 'Bow damage', unit: '' },
    bowCooldown: { label: 'Time between arrows', unit: ' s' },
    bagCapacity: { label: 'Bag slots', unit: '' },
    walkSpeed: { label: 'Adam’s speed', unit: ' tiles/s' },
    porterCarry: { label: 'Porter load', unit: '' },
    woodYield: { label: 'Extra wood harvested', unit: '' },
    drillTicks: { label: 'Mining time', unit: ' s' },
    farmYield: { label: 'Food per harvest', unit: '' },
  },
  buildingCategories: {
    ore: 'Ore',
    production: 'Production',
    defense: 'Attack',
    logistics: 'Logistics',
    housing: 'Housing',
    research: 'Research',
  },
  researchThemes: {
    building: 'Buildings',
    combat: 'Combat',
    harvest: 'Harvest',
    town: 'Town',
  },
  research: {
    metalworking: {
      label: 'Foundry',
      description: 'A stone crucible, a makeshift bellows: iron gives in and melts.',
    },
    fieldMedicine: {
      label: 'Makeshift medicine',
      description: 'Mutant goo under the magnifier: what changes them can be cured.',
    },
    militia: {
      label: 'Militia',
      description: 'Sharpened spears and a rack: enough to train a small escort.',
    },
    sharpArrows: {
      label: 'Fang arrows',
      description: 'Wolf fangs for arrowheads: they bite.',
    },
    quickDraw: {
      label: 'Quick draw',
      description: 'A bowstring coated in mutant goo: it snaps back faster.',
    },
    irradiatedArrows: {
      label: 'Irradiated arrows',
      description: 'A shard of the Queen’s core in every tip: it burns.',
    },
    bigBag: {
      label: 'Reinforced bag',
      description: 'Crab claws for buckles: the bag gets a bit of a belly.',
    },
    walkingBoots: {
      label: 'Walking boots',
      description: 'Polished stone soles, braided uppers: Adam zooms.',
    },
    sturdyPorters: {
      label: 'Sturdy porters',
      description: 'Good meals and wider baskets for the workers.',
    },
    sharpAxes: {
      label: 'Sharpened axes',
      description: 'A grindstone and some iron wire: every swing counts.',
    },
    fastDrills: {
      label: 'Fast drills',
      description: 'Coal-tempered bits: the drills dig faster.',
    },
    fertileFarms: {
      label: 'Fertile farms',
      description: 'A fertilizer of mutant goo, diluted. Very diluted.',
    },
  },
  achievements: {
    firstRoof: {
      label: 'First roof',
      description: 'Build the town hall.',
    },
    firstNight: {
      label: 'One night down',
      description: 'Survive a night.',
    },
    firstShot: {
      label: 'First shot',
      description: 'Take down an enemy.',
    },
    firstChest: {
      label: 'Lucky find',
      description: 'Open a chest on the map.',
    },
    firstChild: {
      label: 'One more face',
      description: 'See a child born at the nursery.',
    },
    firstTrade: {
      label: 'Good deal',
      description: 'Barter with the caravan.',
    },
    firstLab: {
      label: 'Eureka',
      description: 'Finish a research at the lab.',
    },
    twentyWorkers: {
      label: 'A real crew',
      description: 'Have 20 workers in the colony.',
    },
    builder10: {
      label: 'Little hamlet',
      description: 'Have 10 buildings standing.',
    },
    builder25: {
      label: 'Small town',
      description: 'Have 25 buildings standing.',
    },
    level5: {
      label: 'Adam toughens up',
      description: 'Reach level 5.',
    },
    level10: {
      label: 'Veteran',
      description: 'Reach level 10.',
    },
    nights5: {
      label: 'Five nights',
      description: 'Survive 5 nights.',
    },
    nights20: {
      label: 'Twenty nights',
      description: 'Survive 20 nights.',
    },
    quests5: {
      label: 'Eve’s errands',
      description: 'Complete 5 of Eve’s quests.',
    },
    signal: {
      label: 'The Signal',
      description: 'Send the Signal from the antenna.',
    },
    base1: {
      label: 'First camp razed',
      description: 'Destroy a mutant base.',
    },
    base3: {
      label: 'Conqueror',
      description: 'Destroy 3 mutant bases.',
    },
    army5: {
      label: 'Full army',
      description: 'Lead 5 companions at once.',
    },
    cleanTen: {
      label: 'Unbroken ramparts',
      description: 'Hold 10 nights in a row without losing a building.',
    },
    fedTen: {
      label: 'Full bellies',
      description: 'Hold 10 nights in a row with nobody dying of hunger or thirst.',
    },
    queenSlain: {
      label: 'The Queen has fallen',
      description: 'Slay the Puddle Queen.',
    },
    chiefs3: {
      label: 'Chief hunter',
      description: 'Defeat 3 base chiefs.',
    },
    rares: {
      label: 'Collector',
      description: 'Find all 6 rare buildings.',
    },
    wardrobe20: {
      label: 'Full closet',
      description: 'Own 20 wardrobe pieces.',
    },
    hallFell: {
      label: 'That smelled like smoke',
      description: 'See the town hall fall. It happens to the best.',
    },
    tripleNap: {
      label: 'Forced nap',
      description: 'Get knocked out 3 times in one colony.',
    },
    dryDiet: {
      label: 'Dry diet',
      description: 'Lose a worker to hunger or thirst.',
    },
    treasure10: {
      label: 'Chest looter',
      description: 'Open 10 chests in one colony.',
    },
    mutantFriend: {
      label: 'It’s curable',
      description: 'Cure a mutant at the clinic.',
    },
    haggler: {
      label: 'Rug merchant',
      description: 'Make 5 trades in one colony.',
    },
  },
  trophies: {
    flagGarland: {
      label: 'Bunting garland',
      description: 'Patched cloth pennants for party days.',
    },
    gnomeStatue: {
      label: 'Garden gnome',
      description: 'It survived the end of the world. It is proud.',
    },
    mintBanner: {
      label: 'Mint banner',
      description: 'Life is taking over, and you can see it from afar.',
    },
    goldenHall: {
      label: 'Golden town hall',
      description: 'A town hall repainted sunshine yellow.',
    },
    vinedTower: {
      label: 'Flowery tower',
      description: 'A watchtower overrun with vines and flowers.',
    },
    paintedDrill: {
      label: 'Painted drill',
      description: 'A drill in the colony’s colours.',
    },
  },
  perks: {
    woodStart: {
      label: 'Starter bundle',
      description: 'Adam starts with 10 wood in his bag.',
    },
    stoneStart: {
      label: 'Starter stones',
      description: 'Adam starts with 6 stone in his bag.',
    },
    bigBag: {
      label: 'Big bag',
      description: 'Adam’s bag holds 10 more items.',
    },
    sharpAxe: {
      label: 'Sharpened axe',
      description: 'Trees are chopped 10% faster.',
    },
    freeTower: {
      label: 'Free tower',
      description: 'The first watchtower site arrives fully supplied.',
    },
  },
  weather: {
    acidRain: {
      label: 'Acid rain',
      advice: 'take shelter near the town hall',
    },
    wind: {
      label: 'Gust of wind',
      advice: 'arrows drift, pushed mutants move faster',
    },
    fog: {
      label: 'Fog',
      advice: 'follow the edge markers',
    },
    rainbow: {
      label: 'Radioactive rainbow',
      advice: 'trees and rocks yield double',
    },
  },
  rareOffers: {
    bigBag: 'Patched bag',
  },
  testScenarios: {
    base: 'Small base',
    lab: 'Lab',
    forest: 'Forester',
    farm: 'Farm',
    housing: 'Houses',
    nursery: 'Nursery',
    trends: 'Trends',
    army: 'Barracks',
    raid: 'Mutant base',
    chest: 'Chest to open',
    wardrobe: 'Wardrobe',
  },
};
