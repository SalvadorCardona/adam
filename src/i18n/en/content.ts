/** The game's content in English: every entry of `fr/content.ts`, translated. */

import type { content as fr } from '../fr/content.ts';
import type { Messages } from '../messages.ts';

type Content = Pick<Messages, keyof typeof fr>;

export const content: Content = {
  lore: {
    title: 'Adam',
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
    grilledMeat: 'Grilled meat',
    wheat: 'Wheat',
    bread: 'Bread',
    water: 'Water',
    ironPlate: 'Iron plate',
    brick: 'Brick',
    tools: 'Tools',
    steel: 'Steel',
    mutantGoo: 'Mutant goo',
    wolfFang: 'Wolf fang',
    crabClaw: 'Crab claw',
    radCore: 'Radioactive core',
    amber: 'Amber',
    pearl: 'Mother-of-pearl',
    quartz: 'Quartz',
    spore: 'Violet spore',
  },
  buildings: {
    townHall: {
      label: 'Town hall',
      sign: 'Town hall',
      siteDescription:
        'The colony’s first building. The game starts on its construction site: bring it wood and stone to finish it.',
      description: 'The heart of the colony: if it falls, all is lost.',
      effect: 'The heart of the colony: if it falls, all is lost.',
      upgrades: [
        {
          label: 'Stone town hall',
          description:
            'The plank walls give way to a stone plinth: the town hall sees farther, its logistic radius grows and its coral pennant flies higher.',
          action: 'Build in stone',
        },
        {
          label: 'City hall',
          description:
            'Red bricks, lanterns on the pillars and a great golden banner: the whole town gathers under its radius.',
          action: 'Build in brick',
        },
      ],
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
      upgrades: [
        {
          label: 'Stone quarry',
          description:
            'A better-guyed crane and a cut-stone plinth: the workers cut a fifth faster.',
          action: 'Reinforce',
        },
        {
          label: 'Great quarry',
          description:
            'Brick hoists and a golden pennant: the quarry runs almost twice as fast as at the start.',
          action: 'Mechanize',
        },
      ],
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
      upgrades: [
        {
          label: 'Stone drill',
          description:
            'A stone footing under the derrick: the drill bites a fifth faster.',
          action: 'Reinforce',
        },
        {
          label: 'Brick drill',
          description:
            'A brick shaft and a golden banner: the drill runs almost twice as fast as at the start.',
          action: 'Mechanize',
        },
      ],
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
      upgrades: [
        {
          label: 'Stone house',
          description:
            'A stone plinth and one more bed upstairs: six inhabitants sleep warm.',
          action: 'Extend',
        },
        {
          label: 'Brick house',
          description:
            'Red bricks, a lantern on the gable and a golden pennant: eight inhabitants find a bed.',
          action: 'Raise',
        },
      ],
    },
    pigPen: {
      label: 'Pig pen',
      sign: 'Pig pen',
      siteDescription: 'A staked-out pen and a half-built fence: it is still waiting for its first pig.',
      description:
        'A scrap pen, a sty and a trough. It gives nothing until a pig has been brought here: find one in the forest, tame it and lead it home. After that it yields meat every cycle, which porters empty into the town hall.',
      effect: 'A forest pig brought here gives meat; up to 3 pigs.',
      upgrades: [],
    },
    farm: {
      label: 'Farm',
      sign: 'Farm',
      siteDescription: 'A tool shed to put up before turning the soil. Four farmers will work here.',
      description:
        'A few furrows in the irradiated soil and a tool shed. Its farmers sow the field around it, tile by tile, watch it grow, then bring the harvest back to the chest.',
      effect: 'Up to 4 farmers work a 6 × 6 field: about 9 wheat per minute.',
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
    archerTower: {
      label: 'Archer tower',
      sign: 'Archers',
      siteDescription: 'A stone base, plank battlements to nail on. It will take two archers to man it.',
      description:
        'A squat plank keep on a stone base, battlements and two colony archers behind them. Without them it does not shoot; with one, half as fast.',
      effect: 'Shoots mutants within 9 tiles, manned by 2 archers.',
      upgrades: [],
    },
    palisade: {
      label: 'Palisade',
      sign: 'Palisade',
      siteDescription: 'Stakes sharpened to a point, lying on the ground, and a rope to bind them.',
      description:
        'Three sharpened stakes bound with rope. A mutant goes around nothing: it stops and breaks it, while the towers riddle it with arrows.',
      effect: 'Stops mutants while they break it.',
      upgrades: [],
    },
    flowerBed: {
      label: 'Flower bed',
      sign: 'Flower bed',
      siteDescription: 'A square of turned earth and a few seeds, waiting.',
      description: 'A small bed of coral, yellow and violet flowers. Nothing justifies it, which is exactly why the workers nearby wake up in a better mood.',
      effect: '+1 happiness each dawn for workers within 4 tiles.',
      upgrades: [],
    },
    bench: {
      label: 'Bench',
      sign: 'Bench',
      siteDescription: 'Two planks and four legs, flat-packed, to nail together.',
      description: 'A plank bench and a patch of shade. You sit down at the end of the day to watch the colony live, and it does you good.',
      effect: '+1 happiness each dawn for workers within 5 tiles.',
      upgrades: [],
    },
    streetLamp: {
      label: 'Street lamp',
      sign: 'Street lamp',
      siteDescription: 'A post in the ground, its lantern still in the crate.',
      description: 'An indigo post and its yellow lantern, lit from dusk. The night feels shorter when you can see your home from afar.',
      effect: '+2 happiness each dawn for workers within 6 tiles.',
      upgrades: [],
    },
    fountain: {
      label: 'Fountain',
      sign: 'Fountain',
      siteDescription: 'A stone basin to assemble; the water comes later.',
      description: 'A stone basin and a jet falling in pearls: a decoration found by exploring, and the nicest square in the colony.',
      effect: '+3 happiness each dawn for workers within 8 tiles. Unlocked by exploring 500 tiles.',
      upgrades: [],
    },
    adamStatue: {
      label: 'Statue of Adam',
      sign: 'Statue',
      siteDescription: 'An empty stone plinth, and a sculptor taking measurements.',
      description: 'Adam, bow in hand, pack on his back and scarf in the wind. Survivors stand a little straighter passing it: he is the one who held out.',
      effect: '+4 happiness each dawn for workers within 10 tiles. Unlocked after the end of act I.',
      upgrades: [],
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
    bakery: {
      label: 'Bakery',
      sign: 'Bread',
      siteDescription: 'A brick oven to stack, a peel to carve. It will need a baker.',
      description:
        'A round oven of salvaged bricks, a chimney that smokes from dawn and the smell of golden crust drifting through the camp. Its baker bakes the farms’ wheat: bread feeds far better than grilled meat.',
      effect: '2 wheat → 1 bread, 1 worker.',
      upgrades: [],
    },
    grill: {
      label: 'Grill',
      sign: 'Grill',
      siteDescription: 'A half-drum to set on its scrap legs, a grate to bend. It will need a cook.',
      description:
        'A drum cut in two, a scrap grate and embers that never die. Its cook roasts the meat from the hunts: cooked, it feeds far better than raw, and the smoke announces dinner to the whole camp.',
      effect: '1 meat → 1 grilled meat, 1 worker.',
      upgrades: [],
    },
    brickworks: {
      label: 'Brickworks',
      sign: 'Bricks',
      siteDescription: 'A long kiln to lay up, wooden molds drying in the sun. It will need a brickmaker.',
      description:
        'A long kiln lying under a tiled roof, and rows of bricks cooling on racks. Its brickmaker bakes crushed stone over a wood fire: the borough rebuilds in brick.',
      effect: '2 stone + 1 wood → 1 brick, 1 worker.',
      upgrades: [],
    },
    workshop: {
      label: 'Workshop',
      sign: 'Workshop',
      siteDescription: 'A workbench already set down, an awning to stretch. It will need iron plates to fit out.',
      description:
        'A brick workshop under a striped awning: a vise, a grindstone, wrenches hanging on the wall. Its craftsman shapes tools out of iron plates, and the town can finally build big.',
      effect: '1 iron plate + 2 wood → 1 tools, 1 worker.',
      upgrades: [],
    },
    steelworks: {
      label: 'Steelworks',
      sign: 'Steel',
      siteDescription: 'A blast furnace to raise, girders waiting. It will need tools and bricks.',
      description:
        'A brick blast furnace hooped with iron, two chimneys puffing away, a glowing ladle of metal. Its founder casts steel from iron plates and coal: the industrial city has its heart.',
      effect: '2 iron plates + 2 coal → 1 steel, 1 worker.',
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
    grillMeat: 'Grilling',
    bakeBread: 'Batch',
    fireBrick: 'Firing',
    makeTools: 'Toolmaking',
    castSteel: 'Casting',
  },
  weapons: {
    bow: 'Makeshift bow',
    towerBow: 'Tower bow',
    reinforcedBow: 'Reinforced bow',
    archerBow: 'Archers’ bows',
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
    greatWolf: 'Great wolf',
    giantCrab: 'Giant crab',
    colossus: 'Quarry colossus',
    sludgeKing: 'Sludge king',
  },
  biomes: {
    meadow: 'Meadow',
    forest: 'Forest',
    coast: 'Coast',
    mountain: 'Mountain',
    wasteland: 'Polluted lands',
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
  objectives: {
    townHall: {
      title: 'Build the Town hall',
      hint: 'Wood and stone to the site, Adam.',
      celebration: 'The first roof stands: the town hall becomes the town’s storehouse.',
    },
    lab: {
      title: 'Build a lab',
      hint: 'The lab opens up everything else: lumber camp, quarry, well. It needs 4 iron — follow the marker to the blue rocks!',
      celebration: 'The lab stands: research opens up the “Build” menu.',
    },
    lumberCamp: {
      title: 'Build a lumber camp',
      hint: 'Lumberjacks will cut wood for us. “Woodcraft” at the lab, and the camp shows up in “Build”!',
      celebration: 'Axes sing in the forest: +6 stone.',
    },
    quarry: {
      title: 'Build a quarry',
      hint: 'The quarry cuts stone out of the ruins. “Mining” at the lab opens it.',
      celebration: 'Stone comes out of the ruins by itself: +8 wood.',
    },
    well: {
      title: 'Build a well',
      hint: 'A well on the waterside, and nobody’s thirsty anymore. “Well digging” at the lab!',
      celebration: 'Water comes up in the bucket: +6 food to celebrate.',
    },
    home: {
      title: 'Build a house',
      hint: 'Four beds under one roof: the workers will sleep somewhere warm.',
      celebration: 'Four workers sleep somewhere warm: +6 wood.',
    },
    nights3: {
      title: 'Survive 3 nights',
      hint: 'At night, stay near the town hall: your bow shoots by itself. I’ll show up after the third!',
      celebration: 'Three nights held. Eve has a spare bag for Adam: +20 slots.',
    },
    watchtowers: {
      title: 'Build 2 watchtowers',
      hint: 'Two watchtowers on either side of the town hall: they shoot all night long. “Lookout” at the lab.',
      celebration: 'Two towers watch over the town: +10 wood.',
    },
    palisade: {
      title: 'Build 4 palisades',
      hint: 'Stakes in front of the town hall: a mutant has to break them before it gets through. “Fortifications” at the lab, for a bit of goo.',
      celebration: 'The palisade keeps the mutants at bay: +8 stone.',
    },
    eveQuests: {
      title: 'Answer Eve’s requests',
      hint: 'Tap me to see what I need. Every request done, a blueprint or a tool!',
      celebration: 'All of Eve’s requests done: she fixes the town hall up like new.',
    },
    logisticsPost: {
      title: 'Build a logistics post',
      hint: 'A logistics post near our producers: its runners empty their chests into the town hall.',
      celebration: 'Crates move around on their own: +6 food.',
    },
    constructionPost: {
      title: 'Build a construction post',
      hint: 'Builders who supply and build our sites! “Organized sites” at the lab.',
      celebration: 'The yellow helmets take over: +10 wood, +6 stone.',
    },
    pigPen: {
      title: 'Build a pig pen',
      hint: 'A pen, then bring a pig back from the forest: stay close and it’ll follow you. “Pig farming” at the lab.',
      celebration: 'The pen is waiting for its pigs: +8 wood.',
    },
    farm: {
      title: 'Build a farm',
      hint: 'A farm on bare grass: its farmers sow all around it.',
      celebration: 'The first sprouts are up: +8 water.',
    },
    bread: {
      title: 'Bake 20 loaves of bread',
      hint: 'Wheat from the farm, a bakery to bake it: “Bakery” at the lab.',
      celebration: 'You can smell warm bread all the way to the town hall: +10 stone.',
    },
    firstChild: {
      title: 'See the first child born',
      hint: 'A nursery, with six food inside: a baby!',
      celebration: 'A child is born: the colony has a future. Town hall repaired, +20 bag slots.',
    },
    ironOre: {
      title: 'Mine 20 iron ore',
      hint: 'A drill on the edge of the blue rocks: that’s where the iron sleeps.',
      celebration: 'The drill is spinning: +14 wood, +6 stone.',
    },
    coal: {
      title: 'Make 20 coal',
      hint: 'A charcoal kiln turns wood into coal. “Foundry” at the lab opens it along with the forge.',
      celebration: 'The kiln smokes all day long: +12 wood.',
    },
    ironPlate: {
      title: 'Make 10 iron plates',
      hint: 'The forge melts iron and coal into plates: our towers need them.',
      celebration: 'The first plates come out of the forge: +10 iron ore.',
    },
    brick: {
      title: 'Make 20 bricks',
      hint: 'The brickworks is learned at the lab once we’re a Borough: move to the next era from the town hall!',
      celebration: 'Red bricks, stacked like loaves: +12 stone.',
    },
    clinic: {
      title: 'Build a clinic',
      hint: 'A stunned mutant can be healed: “Makeshift medicine” at the lab, for some goo.',
      celebration: 'The clinic opens its beds: +10 food.',
    },
    grilledMeat: {
      title: 'Grill 20 pieces of meat',
      hint: 'Meat from the pig pen over the coals of a grill: it feeds better! “Grilling” at the lab.',
      celebration: 'The grill sizzles, the town feasts: +10 wood, +6 stone.',
    },
    happiness: {
      title: 'Reach an average Happiness of 80',
      hint: 'A bed for everyone, and flowers, benches, street lamps near the houses: spirits rise every dawn.',
      celebration: 'People are smiling in the streets: +10 food.',
    },
    nights5: {
      title: 'Hold out for 5 nights',
      hint: 'Towers all around the town hall, and you in the middle. Five nights and we’re safe, Adam!',
      celebration: 'Five more nights: the town won’t bend.',
    },
    archerTowers: {
      title: 'Build 2 archer towers',
      hint: 'Two archers per tower, and the waves melt away. “Fortifications” at the lab.',
      celebration: 'The archers take their posts: +12 wood, +8 stone.',
    },
    barracks: {
      title: 'Build a barracks',
      hint: 'An escort for you: “Militia” at the lab, for two wolf fangs.',
      celebration: 'The barracks is recruiting: +10 food.',
    },
    industrialEra: {
      title: 'Reach the Industrial city',
      hint: 'Eras are passed at the town hall, “Eras”: each step opens its research at the lab.',
      celebration: 'The city rumbles: +10 bricks.',
    },
    tools: {
      title: 'Make 10 tools',
      hint: 'A workshop shapes tools from plates and wood: “Toolmaking” at the lab, once we’re a Town.',
      celebration: 'Tools for everyone: +6 iron plates.',
    },
    steel: {
      title: 'Make 10 steel',
      hint: 'A steelworks casts steel once we’re an Industrial city: “Blast furnace” at the lab.',
      celebration: 'Steel is flowing: +10 coal.',
    },
    purifier: {
      title: 'Build a cleanup station',
      hint: 'The purple mud washes clean: “Decontamination” at the lab, and a cleanup station by the polluted land.',
      celebration: 'The land is healthy again: +12 stone.',
    },
    antenna: {
      title: 'Build the Antenna',
      hint: 'An antenna 8 tiles from the town hall, three floors: you’ll need the Queen’s cores, and to defend it!',
      celebration: 'Someone’s answering!',
    },
  },
  chapters: [
    { title: 'The first roof', celebration: 'The first roof stands: the town hall becomes the town’s storehouse.', banner: '' },
    {
      title: 'The foundations',
      celebration: 'The town has its foundations: wood, stone, water and a roof. +20 wood, +12 stone.',
      banner: '',
    },
    { title: 'Through the night', celebration: 'The town makes it through the night. Eve patches up the town hall.', banner: '' },
    { title: 'Eve’s requests', celebration: 'Eve is at home: the town gets organized. +8 iron ore.', banner: '' },
    { title: 'Feeding the town', celebration: 'Nobody goes hungry anymore: +20 food.', banner: '' },
    { title: 'Industry', celebration: 'The chimneys are smoking: the town can smelt and bake. +4 iron plates, +6 coal.', banner: '' },
    { title: 'A town worth living in', celebration: 'The town has its care, its hot meals and its smiles. +10 bricks.', banner: '' },
    {
      title: 'Holding on',
      celebration: 'The colony will live. Eve has an idea: an antenna to call other survivors.',
      banner: 'Act I complete',
    },
    { title: 'Preparing the Signal', celebration: 'Everything is ready for the Antenna: +10 iron plates, +20 food.', banner: '' },
    { title: 'The Signal', celebration: 'Someone’s answering!', banner: '' },
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
      labOpen: 'We need: {building}. It opens at the lab, Adam — build one, it’s in “Build”.',
      labResearch: 'We need: {building}. At the lab, start “{research}” and it’ll show up in “Build”.',
      labSupply: 'We need “{research}”: bring {item} to the lab and it will start the research.',
      labRunning: '“{research}” is running at the lab: a little patience, it will show up in “Build”.',
      labForge: 'To reinforce our towers, we’ll need iron plates. Build a lab: that’s where we’ll learn to forge.',
      foundry: 'At the lab, start the Foundry: the forge and the charcoal kiln will show up in “Build”.',
      forge: 'The forge is unlocked! Iron and coal in, iron plates out.',
      farm: 'We’re running out of food, Adam! A farm for wheat, then a bakery for bread.',
      bakery: 'Wheat isn’t eaten raw, Adam! A bakery will turn it into bread for our crew.',
      outOfRange: 'Your {building} is outside the town hall’s radius: nobody will deliver to it. Bring it yourself, or place a logistics or construction post in range.',
      storeStuck: 'Your {building} is overflowing and nobody empties it! Put a logistics post next to it: its crew will haul everything to the town hall.',
      kiln: 'Forge hungry for coal? A charcoal kiln bakes your spare wood: three logs, one coal.',
      idle: 'Your {n} guys are slacking, Adam: place a logistics post, or any building that hires.',
      idleHousing: 'Your {n} guys are slacking and sleeping outside: place a house for them, then a logistics post.',
      eraReady: 'We’ve got everything to become a {era}! Open the town hall, “Eras” tab, and make the move.',
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
  eras: [
    { label: 'Camp', motto: 'Tarps, a fire, ten pairs of hands. We hang on.', threat: 'Only the nearby mutant bases prowl at night.' },
    {
      label: 'Borough',
      motto: 'Streets, kilns, neighbors: it smells of bread and warm brick.',
      threat: 'Mutants sniff out the borough: two more every night.',
    },
    {
      label: 'Town',
      motto: 'Workshops, tools, children running around: the town hums.',
      threat: 'A big mutant leads every wave.',
    },
    {
      label: 'Industrial city',
      motto: 'Chimneys, rails, sirens: the city rumbles, and the whole wasteland hears it.',
      threat: 'Two big mutants and an extra pack, every night.',
    },
  ],
  researchStats: {
    bowDamage: { label: 'Bow damage', unit: '' },
    bowCooldown: { label: 'Time between arrows', unit: ' s' },
    bagCapacity: { label: 'Bag slots', unit: '' },
    walkSpeed: { label: 'Adam’s speed', unit: ' tiles/s' },
    maxHp: { label: 'Adam’s hit points', unit: '' },
    porterCarry: { label: 'Porter load', unit: '' },
    workerSpeed: { label: 'Townsfolk speed', unit: '' },
    workSpeed: { label: 'Work pace', unit: '' },
    hungerResist: { label: 'Less hunger', unit: '' },
    thirstResist: { label: 'Less thirst', unit: '' },
    woodYield: { label: 'Extra wood harvested', unit: '' },
    drillTicks: { label: 'Mining time', unit: ' s' },
    purifyTicks: { label: 'Time per cleaned tile', unit: ' s' },
    farmYield: { label: 'Wheat per harvest', unit: '' },
  },
  buildingCategories: {
    ore: 'Ore',
    production: 'Production',
    defense: 'Attack',
    logistics: 'Logistics',
    housing: 'Housing',
    research: 'Research',
    decor: 'Decoration',
  },
  researchThemes: {
    building: 'Buildings',
    workers: 'Workers',
    character: 'Character',
  },
  research: {
    waterWell: {
      label: 'Well digging',
      description: 'A rope, a bucket, a stone rim: river water within reach.',
    },
    pigFarming: {
      label: 'Pig farming',
      description: 'A scrap pen, a sty, a trough: a forest pig would give the town meat.',
    },
    woodcraft: {
      label: 'Woodcraft',
      description: 'Salvaged axes and saplings to replant: the forest works for the town.',
    },
    lookout: {
      label: 'Lookout',
      description: 'A ladder, a flag, a makeshift crossbow: you see the mutants coming.',
    },
    mining: {
      label: 'Mining',
      description: 'A wheel, a drill bit, iron wedges: stone and ore come out on their own.',
    },
    organizedSites: {
      label: 'Organized sites',
      description: 'A plan on the table, a helmet per head: the builders take over.',
    },
    purification: {
      label: 'Decontamination',
      description: 'Charcoal and sand filters: the purple mud washes clean.',
    },
    charcoalFilters: {
      label: 'Double filters',
      description: 'Two layers of charcoal instead of one: the station cleans twice as fast.',
    },
    sandals: {
      label: 'Braided sandals',
      description: 'Braided bark under every foot: the whole town walks faster.',
    },
    rations: {
      label: 'Dried rations',
      description: 'Dried meat in every pocket: they last longer without eating.',
    },
    canteens: {
      label: 'Canteens',
      description: 'A hooped wooden canteen on the belt: thirst can wait.',
    },
    goodTools: {
      label: 'Quality tools',
      description: 'Polished handles, iron blades: every swing gets more done.',
    },
    runners: {
      label: 'Runners',
      description: 'Iron-studded soles: the town runs from one building to the next.',
    },
    paddedVest: {
      label: 'Padded vest',
      description: 'A crab shell sewn on the chest: blows glance off.',
    },
    metalworking: {
      label: 'Foundry',
      description: 'A stone crucible, a makeshift bellows: iron gives in and melts.',
    },
    masonry: {
      label: 'Masonry',
      description: 'Kiln-fired bricks and lime mortar: the town hall, houses, quarry and drill can reach level 3.',
    },
    fieldMedicine: {
      label: 'Makeshift medicine',
      description: 'Mutant goo under the magnifier: what changes them can be cured.',
    },
    militia: {
      label: 'Militia',
      description: 'Sharpened spears and a rack: enough to train a small escort.',
    },
    fortification: {
      label: 'Fortifications',
      description: 'Stakes, battlements and two good archers: the town gets ready for the night.',
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
    amberBows: {
      label: 'Amber-varnished bows',
      description: 'Forest amber stiffens the bow: every arrow hits harder.',
    },
    pearlBag: {
      label: 'Pearl-stitched bag',
      description: 'Mother-of-pearl buckles from the coast: the bag opens wider.',
    },
    quartzBits: {
      label: 'Quartz bits',
      description: 'Mountain quartz never dulls: drills dig faster.',
    },
    sporeFilters: {
      label: 'Spore filters',
      description: 'Spores from the polluted lands, packed into the filters: the station cleans faster.',
    },
    baking: {
      label: 'Bakery',
      description: 'A brick oven and hand-ground flour: the farms’ wheat becomes bread.',
    },
    grilling: {
      label: 'Grilling',
      description: 'A half-drum, a grate, some embers: cooked meat feeds better than raw.',
    },
    brickmaking: {
      label: 'Brick firing',
      description: 'Crushed stone, a wood fire, plank molds: bricks are back.',
    },
    handcarts: {
      label: 'Handcarts',
      description: 'Two scrap wheels under a brick crate: porters carry more.',
    },
    toolmaking: {
      label: 'Toolmaking',
      description: 'A vise, a grindstone and iron plates: we shape our own tools.',
    },
    compositeBows: {
      label: 'Composite bows',
      description: 'Wood, fang horn, precise tools: the bow bites harder.',
    },
    toolDrills: {
      label: 'Tooled drills',
      description: 'Bits swapped with a wrench, without stopping the wheel.',
    },
    steelmaking: {
      label: 'Blast furnace',
      description: 'Hotter than the forge, taller than the town hall: steel flows.',
    },
    steelArrows: {
      label: 'Steel arrows',
      description: 'Tempered steel tips: nothing resists them anymore.',
    },
    steelFrame: {
      label: 'Steel-frame bag',
      description: 'A steel frame, new straps: the bag holds twice as much without sagging.',
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
  challenges: {
    woodcutter: 'Harvest 40 wood',
    stonecutter: 'Harvest 30 stone',
    miner: 'Harvest 12 iron ore',
    courier: 'Deliver 30 items to sites',
    builder: 'Finish 2 buildings',
    hunter: 'Defeat 4 enemies',
    scout: 'Discover 250 tiles',
  },
  boons: {
    coffee: { label: 'Eve’s coffee', description: 'Everyone trots along: 30% faster until nightfall.' },
    workSongs: { label: 'Work songs', description: 'Everyone works 40% faster until nightfall.' },
    sharpAxe: { label: 'Sharp axe', description: 'Every axe stroke brings double wood until nightfall.' },
    sneakers: { label: 'New sneakers', description: 'Adam runs faster until nightfall.' },
    goodBreakfast: { label: 'Hearty breakfast', description: 'Hunger grows half as fast until nightfall.' },
    scrapCrate: { label: 'Scrap crate', description: 'A crate left by the town hall: 25 wood and 15 stone.' },
    picnic: { label: 'Picnic', description: 'A forgotten basket: 15 food and 15 water for the town.' },
    oreCart: { label: 'Ore cart', description: 'A tipped-over cart: 10 iron ore and 8 coal.' },
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
    pigs: 'Pig pen',
    wardrobe: 'Wardrobe',
    regions: 'Regions',
  },
};
