/**
 * Section `hud` du dictionnaire français : la quête, le conseil, l'horloge,
 * les bulles, les bandeaux, les écrans de victoire et de défaite. Le jeu
 * vouvoie le joueur ; les répliques d'Ève sont dans `content.eve`.
 *
 * Un nom d'objet, de bâtiment ou de météo glissé dans une phrase arrive tel
 * que le dictionnaire le donne (`t().items[id]`, avec sa majuscule) : c'est
 * ici qu'on le met en minuscules au milieu d'une phrase, avec l'article et
 * l'accord.
 */

import { BUILDINGS } from '../../data/buildings.ts';
import { LORE } from '../../data/lore.ts';

const HALL = LORE.buildings.townHall.name;
const NURSERY = LORE.buildings.nursery.name.toLowerCase();

/** « s » au pluriel : en français, 0 et 1 sont au singulier. */
const s = (n: number): string => (n > 1 ? 's' : '');

/** Un nom tel qu'on le lit au milieu d'une phrase : « Bois » → « bois ». */
const lower = (name: string): string => String(name).toLowerCase();

export const hud = {
  /** Pourquoi un bâtiment armé ne se pose pas (`PlacementRejection`). */
  rejection: {
    occupied: 'Emplacement déjà occupé',
    road: 'Une route passe ici — retirez-la d’abord',
    terrain: 'Terrain non constructible',
    polluted: 'Terre polluée — une station de dépollution la nettoiera',
    radioactive: 'Terre radioactive — rien ne la nettoie, pas encore',
    outOfReach: 'Trop loin — rapprochez-vous',
    resource: 'Dégagez d’abord les arbres et rochers',
    onPlayer: 'Vous êtes sur l’emplacement',
    locked: 'Pas encore débloqué — il faut son plan, ou tenir encore une nuit',
    unique: 'Un seul par colonie — il y en a déjà un',
    shore: 'Le puits se pose au bord d’une rivière',
    nearHall: `Trop près de la mairie — l’antenne se dresse à ${BUILDINGS.antenna.hallDistance} cases au moins`,
    enemyZone: 'Une base mutante tient cette zone — abattez-la d’abord',
    unexplored: 'Zone inexplorée — allez-y d’abord',
  },
  /** Ce que dit la bulle quand un tracé de route n'a pas été pavé en entier. */
  road: {
    /** `paved` tuiles l'ont été avant que la pierre manque. */
    noStone: (paved: number): string => `Plus de pierre : route arrêtée après ${paved} tuile${s(paved)}`,
    noStoneAtAll: 'Pas de pierre pour paver — ni dans le sac, ni en ville à portée',
    terrain: 'Pas de route sur l’eau',
    occupied: 'Une route ne passe pas sous un bâtiment',
    resource: 'Arbres et rochers sautés : dégagez-les pour paver',
    enemyZone: 'Pas de route dans la zone d’une base mutante',
    unexplored: 'Pas de route dans l’inconnu : explorez d’abord',
    polluted: 'Pas de route sur la terre polluée — une station de dépollution la nettoiera',
    radioactive: 'Pas de route sur la terre radioactive',
  },
  /** Pourquoi un arc n'a pas été forgé (`GearRejection`, hors `missing`). */
  gear: {
    outOfReach: 'Trop loin de la forge — rapprochez-vous',
    maxLevel: 'Vous avez déjà le meilleur arc',
    missingItems: 'Il manque de quoi forger cet arc — ni dans le sac, ni en ville',
  },
  /** Pourquoi un compagnon n'a pas été recruté (`RecruitRejection`, hors `missing`). */
  recruit: {
    outOfReach: 'Trop loin de la caserne — rapprochez-vous',
    busy: 'La caserne forme déjà une recrue',
    full: 'Troupe complète : cinq compagnons au plus',
    missingItems: 'Il manque de quoi équiper cette recrue — ni dans le sac, ni en ville',
  },
  /** Pourquoi une réparation n'a pas eu lieu (`RepairRejection`, hors `missing`). */
  repair: {
    outOfReach: 'Trop loin — rapprochez-vous',
    intact: 'Rien à réparer',
    noMaterial: 'Il faut du bois pour réparer — ni dans le sac, ni en ville',
  },
  /** D'où vient une vague, dit comme on le dirait. */
  from: {
    north: 'par le nord',
    northEast: 'par le nord-est',
    east: 'par l’est',
    southEast: 'par le sud-est',
    south: 'par le sud',
    southWest: 'par le sud-ouest',
    west: 'par l’ouest',
    northWest: 'par le nord-ouest',
  },
  /** Les bulles empilées des événements. */
  toast: {
    depositFar: 'Trop loin de la mairie — rapprochez-vous pour déposer',
    depositNoTown: 'Pas encore de ville : bâtissez d’abord la mairie',
    siteNothing: 'Rien dans le sac que ce chantier attende',
    supplyNothing: 'Rien dans le sac ni en ville que ce bâtiment attende',
    nurseryHungry: 'La nurserie attend de la nourriture pour le prochain enfant',
    chestEmpty: 'Le coffre est vide',
    bagFullTake: 'Sac plein — rien à prendre de plus',
    bagFullTown: 'Sac plein — allez déposer en ville',
    bagFullSite: 'Sac plein — allez livrer le chantier',
    bagFullDrop: 'Sac plein — tapez le sac, puis « Jeter »',
    upgradeMissing: 'Il manque de quoi payer — ni dans le sac, ni en ville',
    /** `item` : le nom de l'objet, avec sa majuscule. */
    repairedFromTown: (amount: number, item: string): string => `Réparé avec ${amount} ${lower(item)} de la ville`,
    /** Ève prévient de la Reine alors qu'elle n'est pas encore arrivée. */
    eveRadio: (line: string): string => `Ève, par radio : ${line}`,
    dusk: 'La nuit tombe — rentrez !',
    dawn: (night: number): string => `L’aube ! Nuit ${night} survécue`,
    destroyed: (building: string): string => `${building} détruite`,
    /** `building` : le nom du bâtiment, avec sa majuscule. */
    siteCancelled: (building: string, toTown: boolean): string =>
      `Chantier annulé : ${building} — ${toTown ? 'le livré retourne en ville' : 'le livré reste au sol'}`,
    childBorn: (name: string): string => `${name} est né à la nurserie !`,
    mutantStunned: 'Un mutant assommé ! Touchez-le pour l’emmener à la clinique',
    patientFollowing: 'Il vous suit en boitillant — direction la clinique',
    patientAdmitted: 'Admis à la clinique : une nuit de soins',
    mutantHealed: 'Un ex-mutant sort de la clinique : un porteur de plus !',
    kidGrewUp: (name: string): string => `${name} a 14 ans, un ouvrier de plus`,
    /** Un ouvrier à bout : le temps qu'il lui reste. */
    starving: {
      hunger: (name: string, seconds: number): string => `${name} meurt de faim dans ${seconds} s — de la nourriture !`,
      thirst: (name: string, seconds: number): string => `${name} meurt de soif dans ${seconds} s — de l’eau !`,
    },
    workerStarved: {
      hunger: (name: string): string => `${name} est mort de faim`,
      thirst: (name: string): string => `${name} est mort de soif`,
    },
    /** Un enfant affamé ou assoiffé ne prend pas d'année : un message par besoin. */
    growthStunted: {
      hunger: (name: string): string => `${name} a faim : pas d’anniversaire cette aube`,
      thirst: (name: string): string => `${name} a soif : pas d’anniversaire cette aube`,
    },
    /** `weather` : le nom de la météo, avec sa majuscule ; `advice` : son conseil. */
    weatherSoon: (weather: string, seconds: number, advice: string): string => `${weather} dans ${seconds} s — ${advice}`,
    weatherEnded: (weather: string): string => `Fin : ${lower(weather)}`,
    knockedOut: 'Adam s’est évanoui — il se réveille à la mairie',
    eveArriving: 'Quelqu’un arrive à vélo…',
    eveArrived: 'Ève a rejoint la colonie !',
    caravanArriving: 'Une caravane de troc arrive au bord de la clairière',
    caravanLeaving: 'La caravane repart',
    /** Un objet de la liste de `storedAtHall` : « 3 bois » ; `item` avec sa majuscule. */
    storedItem: (amount: number, item: string): string => `${amount} ${lower(item)}`,
    /** `list` : « 3 bois, 2 pierre », ce qui n'est pas entré dans le sac. */
    storedAtHall: (list: string): string => `Sac plein : ${list} attend à la mairie`,
    tradeFar: 'Approchez-vous de la charrette',
    tradeMissing: 'Il manque de quoi payer cet échange',
    tradeDone: 'Cet échange est déjà fait',
    tradeGone: 'La caravane est repartie',
    planReceived: (building: string): string => `Plan reçu : ${building}`,
    toolReceived: (tool: string): string => `Outil reçu : ${tool}`,
    researchStarted: (research: string): string => `${research} : la recherche commence`,
    researchCompleted: (effect: string): string => `Recherche terminée — ${effect}`,
    /** `labels` : les bâtiments entrés au menu, déjà joints. */
    buildingsUnlocked: (n: number, labels: string): string =>
      n > 1 ? `Nouveaux bâtiments débloqués : ${labels}` : `Nouveau bâtiment débloqué : ${labels}`,
    researchBusy: 'La file de ce labo est pleine',
    researchTaken: 'Un autre labo mène déjà cette recherche',
    researchLocked: 'Il manque une recherche avant celle-ci',
    researchNothing: 'Rien dans le sac ni en ville que cette recherche attende',
    antennaRaised: (floor: number, night: number): string =>
      `Étage ${floor} debout ! La nuit ${night}, toutes les vagues marcheront sur l’antenne.`,
    antennaFell: (floor: number): string => `L’antenne a perdu un étage — elle retombe à l’étage ${floor}`,
    /** `gear` : l'arc qu'il faut, avec sa majuscule. */
    betterGear: (gear: string, level: number): string => `Il vous faut un meilleur équipement : ${gear} (niveau ${level}) — forgez-le à la forge`,
    enemyZone: (level: number): string => `Zone d’une base mutante (niveau ${level}) : ni récolte ni construction tant qu’elle tient`,
    baseDestroyed: (prestige: number): string => `Base mutante détruite ! +${prestige} Prestige, sa zone est libre`,
    baseShielded: 'Son chef la protège : abattez-le d’abord, le bouclier tombera avec lui',
    levelUp: (level: number, maxHp: number, bowDamage: number): string =>
      `Niveau ${level} ! +${maxHp} PV max, +${String(Math.round(bowDamage * 100) / 100).replace('.', ',')} dégâts d’arc`,
    chiefDefeated: (prestige: number): string => `Chef de base abattu ! +${prestige} Prestige — la base n’a plus de bouclier`,
    /** `gear` : l'arc forgé, avec sa majuscule. */
    companionTraining: (label: string, seconds: number): string => `${label} en formation — ${seconds} s`,
    companionJoined: (label: string): string => `${label} rejoint Adam !`,
    companionDied: (label: string): string => `${label} est tombé — recrutez-en un autre à la caserne`,
    gearCrafted: (gear: string, level: number): string => `${gear} forgé : vous entamez les bases de niveau ${level}`,
    survivors: (count: number): string =>
      count > 1
        ? `${count} survivants arrivent à l’appel de l’antenne : ${count} porteurs de plus`
        : 'Un survivant arrive à l’appel de l’antenne : un porteur de plus',
  },
  /** Ce qui monte du toit d'un bâtiment achevé, ou de la tête d'Adam. */
  float: {
    built: (building: string): string => `${building} bâtie !`,
    /** Un niveau atteint : son nom, tel quel. */
    upgraded: (level: string): string => `${level} !`,
    /** L'objet refusé à la récolte : il en a assez. */
    enough: 'assez',
    /** Le Prestige gagné, qui monte du bâtiment ou de l'ennemi. */
    prestige: (amount: number): string => `+${amount} Prestige`,
    /** L'expérience gagnée sur un ennemi abattu. */
    xp: (amount: number): string => `+${amount} XP`,
  },
  /** Le bandeau des vagues et de la Reine. */
  wave: {
    night: (night: number): string => `Nuit ${night}`,
    reinforcements: 'Renforts',
    /** `from` : « par le nord » (`from`). */
    queen: (from: string): string => `La Reine des flaques sort ${from} !`,
    /** `target` : le nom du bâtiment visé, avec sa majuscule — tous ceux que vise une vague sont féminins. */
    boss: (from: string, target: string): string => `Un gros mutant mène la charge ${from} : il vise la ${lower(target)} !`,
    /** `bases` : combien de bases lâchent les leurs ; `from` dit où est la plus proche. */
    mutants: (count: number, bases: number, from: string, target: string): string =>
      bases > 1
        ? `${count} mutants sortent de ${bases} bases, la plus proche ${from} : ils visent la ${lower(target)} !`
        : count > 1
          ? `${count} mutants arrivent ${from} : ils visent la ${lower(target)} !`
          : `${count} mutant arrive ${from} : il vise la ${lower(target)} !`,
    cleared: (night: number): string => `Nuit ${night} — vague repoussée !`,
    clearedText: 'Ramassez ce que les mutants ont lâché',
    queenSlain: 'La Reine des flaques est tombée !',
    queenSlainText: (night: number): string => `Nuit ${night} — son cœur radioactif est au sol`,
    queenNight: (night: number): string => `Nuit ${night} — la Reine des flaques`,
    /** `time` : « 1:05 ». */
    queenIn: (time: string): string => `Elle sort dans ${time}`,
  },
  /** La quête en haut de l'écran. */
  quest: {
    objective: (index: number, total: number): string => `Objectif ${index}/${total}`,
    afterSignal: 'Après le Signal',
    buildHall: `Bâtir la ${HALL}`,
    defeat: 'Défaite',
    hallFallen: `La ${HALL.toLowerCase()} est tombée.`,
    attack: 'Attaque !',
    endless: 'Tenir le plus longtemps possible',
    /** La ligne de l'attaque : « Nuit 3 · 4 mutants ». */
    status: (night: number, mutants: number): string => `Nuit ${night} · ${mutants} mutant${s(mutants)}`,
    inhabitants: 'Habitants',
    kills: 'Mutants abattus',
    /** Le compteur d'ouvriers : « 6/10 », libres sur le total. */
    crew: (free: number, total: number): string => `${free} ouvrier${s(free)} libre${s(free)} sur ${total} — voir le détail`,
    noCrew: 'Aucun ouvrier pour l’instant.',
    assigned: 'Affectés',
    free: 'Libres',
    emptyPosts: 'Postes vides',
    portersBusy: 'Porteurs occupés',
    portersIdle: 'Porteurs en attente',
    /** La ligne repliée d'une naissance retenue ou attendue. */
    stripPaused: 'en pause',
    /** `item` : le nom de l'objet qui manque, avec sa majuscule. */
    stripMissing: (missing: number, item: string): string => `${missing} ${lower(item)}${s(missing)}`,
    stripBaby: (time: string): string => `bébé ${time}`,
    stripNight: (time: string): string => `nuit ${time}`,
    nurseryPaused: `la ${NURSERY} est en pause`,
    nurseryWaits: (missing: number, item: string): string => `la ${NURSERY} attend ${missing} ${lower(item)}${s(missing)}`,
    babyIn: (time: string): string => `bébé dans ${time}`,
  },
  /** L'horloge du jour et de la nuit. */
  clock: {
    /** `left` : « 1:31 ». */
    night: (day: number, left: string): string => `Nuit ${day} · aube dans ${left}`,
    day: (day: number, left: string): string => `Jour ${day} · nuit dans ${left}`,
    /** Le numéro du jour, à côté du cadran. */
    short: (day: number): string => `J${day}`,
  },
  /** La météo en capsule, sous la quête. */
  weather: {
    /** `weather` : son nom, avec sa majuscule. */
    soon: (weather: string, seconds: number): string => `${weather} dans ${seconds} s`,
  },
  /** L'alerte de nourriture ou d'eau, sous la population : la ville va en manquer. */
  needAlert: {
    soonShort: (minutes: number): string => `${minutes} min`,
    outShort: 'à sec',
    /** `who` : qui en manque déjà (`wanting`), vide si personne. */
    soon: (item: string, minutes: number, who: string): string =>
      `${item} : plus que ${minutes} min en ville${who ? ` — ${who}, taper pour voir` : ''}`,
    out: (item: string, who: string): string => `${item} : la ville n’en a plus${who ? ` — ${who}, taper pour voir` : ''}`,
    wanting: {
      hunger: (count: number): string => `${count} ${count > 1 ? 'ont' : 'a'} faim`,
      thirst: (count: number): string => `${count} ${count > 1 ? 'ont' : 'a'} soif`,
    },
  },
  /** La population : au travail, inactifs, enfants. */
  people: {
    working: (n: number): string => `${n} ouvrier${s(n)} au travail`,
    idle: (n: number): string => `${n} ouvrier${s(n)} inactif${s(n)}${n > 0 ? ' — taper pour en voir un' : ''}`,
    children: (n: number): string => `${n} enfant${s(n)}`,
    /** L'Habitation : logés / ouvriers adultes. */
    housing: (housed: number, population: number): string =>
      `Habitation — ${housed} logé${s(housed)} sur ${population} habitant${s(population)}` +
      (population > housed ? ` : ${population - housed} dor${population - housed > 1 ? 'ment' : 't'} dehors, bâtissez une Maison` : ''),
    /** Le Bonheur de la ville : la somme des bonheurs de ses habitants. */
    happinessName: 'Bonheur de la ville',
    happiness: (total: number, average: number, unhappy: number): string =>
      `Bonheur de la ville : ${total} (moyenne ${average} par habitant, ${unhappy} malheureux)`,
  },
  /** Les compagnons d'Adam, dans la bulle de la population. */
  army: {
    /** `n` compagnons sur `max`, `hp` points de vie sur `maxHp`, `training` recrues en formation. */
    label: (n: number, max: number, hp: number, maxHp: number, training: number): string =>
      `Compagnons : ${n}/${max} — santé ${hp}/${maxHp}` + (training > 0 ? ` (${training} en formation)` : ''),
  },
  /** Le sac et la ville, en version compacte. */
  stock: {
    bag: 'Sac',
    bagLabel: (total: number, capacity: number): string => `Ouvrir le sac : ${total} objets sur ${capacity}`,
    bagLabelTown: (total: number, capacity: number, town: number): string =>
      `Ouvrir le sac : ${total} objets sur ${capacity}, ${town} en ville`,
    town: 'Ville',
    toBuild: 'à bâtir',
    townTitle: 'Ville — le stock de la mairie, qui paie les constructions',
    /** Les libellés des icônes, au survol ou à l'appui long ; `item` : le nom de l'objet, avec sa majuscule. */
    bagTip: (total: number, capacity: number): string => `Sac — ${total} objet${s(total)} sur ${capacity}`,
    townTotal: (total: number): string => `Ville — ${total} objet${s(total)} en stock`,
    inBag: (item: string, amount: number): string => `${item} — ${amount} dans le sac`,
    inTown: (item: string, amount: number): string => `${item} — ${amount} en ville`,
    /** La même, quand l'objet monte ou baisse sur la dernière minute. */
    inTownUp: (item: string, amount: number): string => `${item} — ${amount} en ville, en hausse`,
    inTownDown: (item: string, amount: number): string => `${item} — ${amount} en ville, en baisse`,
    wanted: (item: string, amount: number): string => `${item} — Ève en demande, ${amount} dans le sac`,
    prestige: 'Prestige',
    prestigeLabel: (amount: number): string => `Prestige : ${amount}`,
    /** Le niveau d'Adam, court, dans le bandeau de la ville. */
    level: (level: number): string => `Niv. ${level}`,
    levelTip: (level: number, into: number, needed: number, max: boolean): string =>
      max ? `Niveau ${level} (maximum)` : `Niveau ${level} — ${into} / ${needed} XP pour le suivant`,
  },
  hintBulb: 'Afficher le conseil',
  pause: 'Pause',
  /** Le bandeau d'un objectif réussi sans bandeau à lui. */
  objectiveDone: 'Objectif réussi !',
  victory: {
    endless: 'Continuer sans fin',
    nights: 'Nuits tenues',
    kills: 'Mutants abattus',
    inhabitants: 'Habitants',
    buildings: 'Bâtiments',
    playTime: 'Temps de jeu',
  },
  death: {
    title: 'Vous êtes mort',
    countdown: (seconds: number): string => `Réapparition dans ${seconds} s`,
  },
  defeat: {
    title: `La ${HALL.toLowerCase()} est tombée`,
    text: 'Les mutants ont eu raison du premier toit de la colonie.',
    replay: 'Rejouer cette carte',
    fresh: 'Nouvelle carte',
    seeds: (seeds: number): string => `+${seeds} graine${s(seeds)}`,
    seedsHint: 'À planter au jardin des souvenirs, sur l’écran titre.',
    nights: 'Nuits survécues',
    kills: 'Mutants abattus',
    time: 'Temps tenu',
  },
  /** Ce que `hint.ts` écrit lui-même ; les répliques d'Ève sont dans `content.eve.hints`. */
  hint: {
    /** `item` : le nom de l'objet, avec sa majuscule. */
    harvestPlenty: (item: string): string => `La ville a assez de ${lower(item)} — Adam n’en ramasse plus en passant`,
    harvestDeliver: (item: string): string => `Assez de ${lower(item)} dans le sac pour les chantiers — allez les livrer`,
    harvestNone: (item: string): string => `Assez de ${lower(item)} : aucun chantier n’en attend plus`,
    /** Un nom glissé dans une réplique d'Ève (`{item}`, `{building}`) : « bois », « mairie ». */
    inSentence: (name: string): string => lower(name),
    /** Le temps d'une attente, glissé dans `{time}`. */
    lessThanMinute: 'moins d’une minute',
    minutes: (minutes: number): string => `${minutes} minute${s(minutes)}`,
  },
  /** L'infobulle d'un habitant : « Lina, 12 ans · enfant, travaille dans 2 jours ». */
  person: {
    line: (name: string, age: number, occupation: string): string => `${name}, ${age} ans · ${occupation}`,
    child: 'enfant',
    childDays: (days: number): string => `enfant, travaille dans ${days} jour${s(days)}`,
    working: 'au travail',
    workingAt: (building: string): string => `au travail : ${building}`,
    idle: 'sans travail',
    home: 'à la maison',
    outside: 'endormi',
    /** Son moral, sous ses jauges : « content », « neutre », « malheureux ». */
    mood: { content: 'content', neutral: 'neutre', unhappy: 'malheureux' },
    moodLabel: (value: number): string => `Bonheur : ${value}/100 — une nuit dans un lit le fait monter, une nuit dehors baisser`,
    /** L'état d'un besoin, sous la ligne : « rassasié », « a faim », « affamé » ; « désaltéré », « a soif », « assoiffé ». */
    needs: {
      hunger: { sated: 'rassasié', wanting: 'a faim', deprived: 'affamé' },
      thirst: { sated: 'désaltéré', wanting: 'a soif', deprived: 'assoiffé' },
    },
  },
};
