/**
 * Section `panel` du dictionnaire français : la fenêtre d'un bâtiment
 * (`ui/buildingPanel.ts`), sa zone d'échange (`transfer`, `ui/transferPanel.ts`)
 * et les motifs d'un refus de pose (`placement`, `ui/placementReason.ts`).
 *
 * Un nom d'objet glissé dans une phrase arrive tel qu'au dictionnaire
 * (« Bois ») : c'est la phrase qui choisit sa casse et son article.
 */

import type { DrillDeposit } from '../../data/buildings.ts';

/** Le pluriel français : 0 et 1 au singulier. */
const s = (count: number): string => (count > 1 ? 's' : '');

export const panel = {
  /** Le bouton (i) qui déplie la phrase d'ambiance. */
  about: 'À propos',
  /** Une forge qui attend qu'on la vide. */
  blocked: 'Bloquée : coffre plein — heurtez-la ou appuyez sur Tout prendre.',
  paused: 'En pause : plus rien ne sort ni n’entre en production — appuyez sur Reprendre.',
  /** Un producteur arrêté coffre plein : la bulle d’alerte de la carte, expliquée. */
  storeFull: 'Entrepôt plein : la production est à l’arrêt. Videz-le ou construisez un poste de logistique à proximité.',
  /** Le bouton qui verse dans un chantier ou un consommateur : le sac, puis la ville. */
  transferButton: 'Transférer',
  /** Le même, hors du rayon de la ville. */
  transferBag: 'Transférer le sac',
  cancelSite: 'Annuler le chantier',
  /** Le second tap d'« Annuler le chantier ». */
  cancelConfirm: 'Vraiment annuler ?',
  pause: 'Pause',
  resume: 'Reprendre',
  maxLevel: 'Niveau max',
  hp: (value: string): string => `Points de vie : ${value}`,

  /** Les onglets de la fenêtre, sous le titre. */
  tabs: {
    label: 'Onglets de la fenêtre',
    building: 'Bâtiment',
    inventory: 'Inventaire',
  },

  site: {
    allDelivered: 'Tout est livré : les bâtisseurs arrivent pour le bâtir.',
    building: (builders: number, percent: number): string => `${builders} bâtisseur${s(builders)} au marteau — ${percent} %`,
    byYard: 'Les bâtisseurs du poste de construction le livrent depuis la mairie, puis le bâtiront.',
    comeCloser: 'Chantier en cours — rapprochez-vous pour livrer.',
    transferOrBump: 'Chantier en cours — transférez le sac, ou heurtez-le.',
    workers: (count: number): string => `Ouvriers qu’il emploiera : ${count}`,
    /** Ce que « Transférer » ferait, selon d'où vient la matière (`SiteCoverage`). */
    coverage: {
      bag: 'Votre sac suffit : transférez pour l’achever.',
      town: 'Le stock de la ville couvre le reste : transférez pour l’achever.',
      both: 'Sac et ville couvrent le reste : transférez pour l’achever.',
      short: 'Chantier en cours — transférez le sac et la ville, ou heurtez-le.',
    },
    /** Le libellé d'une ligne du registre : « Pierre : 0/8 livrés, 2 en route, 5 en ville ». */
    needDone: (item: string, delivered: number, needed: number): string => `${item} : ${delivered}/${needed}, tout est livré`,
    needDelivered: (item: string, delivered: number, needed: number): string => `${item} : ${delivered}/${needed} livrés`,
    needIncoming: (count: number): string => `${count} en route`,
    needTownEmpty: 'plus rien en ville',
    needInTown: (count: number): string => `${count} en ville`,
  },

  repair: {
    /** Abîmé, sans bois nulle part. */
    noStock: (item: string, hp: number): string => `Abîmé — rapportez du ${item.toLowerCase()} pour le réparer (1 = ${hp} PV).`,
    damaged: (item: string, hp: number): string =>
      `Abîmé — réparez-le, ou heurtez-le avec du ${item.toLowerCase()} dans le sac (1 = ${hp} PV).`,
    button: (amount: number, item: string): string => `Réparer (${amount} ${item.toLowerCase()})`,
  },

  chest: {
    town: 'Coffre de la ville',
    plain: 'Coffre',
    /** « Coffre 12/40 », ou « Coffre 12 » sans plafond. */
    label: (count: string): string => `Coffre ${count}`,
    /** Le libellé d'un coffre vide. */
    emptyLabel: (label: string): string => `${label} : vide`,
    /** Le compte au pied du pictogramme d'un coffre vide. */
    empty: 'vide',
  },

  townHall: {
    adults: (count: number): string => `Adultes : ${count}`,
    children: (count: number): string => `Enfants : ${count}`,
    workers: (count: number): string => `Ouvriers : ${count}`,
    nights: (count: number): string => `Nuits affrontées : ${count}`,
    radius: (tiles: number): string => `Rayon d’approvisionnement : les chantiers à ${tiles} cases puisent dans son coffre`,
  },

  drill: {
    extracts: (item: string): string => `Extrait : ${item}`,
    dry: 'Posée à sec : aucun gisement dessous.',
    running: 'En marche.',
  },

  nursery: {
    /** `recipe` : « 6 nourriture ». */
    perBirth: (recipe: string): string => `Chaque naissance mange ${recipe}.`,
    /** `why` : d'où vient la famine (`starved`). */
    hungry: (why: string): string => `En attente de nourriture. ${why}`,
    /** Le coffre, rapporté au stock visé (`demand`), et ce que porteurs ou logisticiens apportent. */
    stock: (item: string, count: number, target: number, coming: number): string =>
      `${item} au coffre : ${count} sur ${target} visés${coming > 0 ? ` — ${coming} en route` : ''}`,
    /** Le libellé de la barre verte, au tap : le temps est dans la barre. */
    nextChild: 'Prochain enfant',
    full: 'Pleine : le prochain enfant attend qu’un grand parte travailler.',
    /** `time` : jusqu'à l'aube où le plus âgé a l'âge de travailler. */
    nextAdult: (time: string): string => `Prochain ouvrier dans ${time}`,
    noKids: 'Aucun enfant ici pour l’instant.',
    kids: (count: number, capacity: number): string => `Enfants à la nurserie : ${count} sur ${capacity}`,
    born: (count: number): string => `Enfants nés ici : ${count}`,
  },

  forge: {
    noOne: 'À l’arrêt : personne au four — ajoutez un ouvrier.',
    /** `why` : d'où vient la famine (`starved`). */
    starved: (why: string): string => `À l’arrêt. ${why}`,
    heating: 'Le four chauffe.',
  },

  tower: {
    range: (weapon: string, tiles: number): string => `${weapon} — portée : ${tiles} cases`,
    alert: 'En alerte : des mutants approchent.',
    idle: 'En veille.',
  },

  farm: {
    growing: (count: number): string => `${count} case${s(count)} semée${s(count)} en train de pousser`,
    ripe: (count: number): string => `${count} case${s(count)} mûre${s(count)}, bonne${s(count)} à récolter`,
    free: (count: number): string => `${count} case${s(count)} libre${s(count)} à semer`,
    field: (side: number): string => `Champ : un carré de ${side} × ${side} cases autour de la ferme.`,
    paused: 'En pause : les fermiers rapportent leur récolte, puis flânent.',
    noOne: 'À l’arrêt : pas de fermier — ajoutez un ouvrier. Rien ne se sème.',
    sowing: 'Les fermiers sèment, case par case.',
    harvesting: 'Les fermiers récoltent ce qui est mûr.',
    asleep: 'Les fermiers dorment ; les cultures poussent encore.',
    growingLine: 'Le champ pousse : les fermiers attendent qu’il mûrisse.',
    nowhere: 'Aucune case à cultiver ici : eau, sable, roche, routes ou bâtiments.',
  },

  quarry: {
    noOne: 'À l’arrêt : personne à la taille — ajoutez un ouvrier.',
    working: 'Les pioches entament la ruine.',
  },

  well: {
    noOne: 'À l’arrêt : personne au treuil — ajoutez un ouvrier.',
    working: 'Le seau remonte, plein.',
  },

  house: {
    sleeping: 'Les ouvriers dorment ici entre deux journées.',
    beds: 'Ceux qui n’ont pas de lit y trouvent le leur, le plus près de leur travail.',
    /** La puce des lits, sur tout bâtiment qui en a. */
    bedsTaken: (used: number, beds: number): string => `Lits occupés : ${used}/${beds}`,
  },

  lumberCamp: {
    radius: (tiles: number): string => `Rayon : les bûcherons coupent les arbres à ${tiles} cases`,
    paused: 'En pause : les bûcherons rapportent leur bois, puis flânent.',
    noOne: 'À l’arrêt : aucun bûcheron — ajoutez un ouvrier.',
    noTrees: 'Plus d’arbres à portée.',
    working: 'Les haches résonnent.',
  },

  foresterHouse: {
    saplings: (count: number): string => `${count} pousse${s(count)} en train de grandir`,
    trees: (count: number): string => `${count} arbre${s(count)} adulte${s(count)}, bon${s(count)} à couper`,
    free: (count: number): string => `${count} case${s(count)} libre${s(count)} à planter`,
    plot: (side: number): string => `Forêt : un carré de ${side} × ${side} cases autour de la maison.`,
    paused: 'En pause : le forestier laisse sa bêche et flâne.',
    noOne: 'À l’arrêt : pas de forestier — ajoutez un ouvrier. Rien ne se plante.',
    toPlot: 'Le forestier va planter la case suivante.',
    planting: 'Le forestier met une pousse en terre.',
    asleep: 'Le forestier dort : il replantera demain.',
    seeking: 'Le forestier cherche une case libre.',
    full: 'Forêt complète : le forestier replantera ce que les bûcherons couperont.',
    nowhere: 'Aucune case à planter ici : eau, roche, routes ou bâtiments.',
  },

  depot: {
    radius: (tiles: number): string => `Rayon : les logisticiens vident les producteurs à ${tiles} cases`,
    none: 'Aucun producteur à portée : ils flânent.',
    served: (count: number): string => `${count} producteur${s(count)} à portée : leur production part à la mairie.`,
  },

  yard: {
    radius: (tiles: number): string => `Rayon : les bâtisseurs livrent et bâtissent les chantiers à ${tiles} cases`,
    paused: 'En pause : ses chantiers reviennent aux porteurs et à vous.',
    noOne: 'À l’arrêt : aucun bâtisseur — ajoutez un ouvrier.',
    none: 'Aucun chantier à portée : ils flânent.',
    served: (count: number): string => `${count} chantier${s(count)} à portée : les bâtisseurs s’en chargent.`,
  },

  antenna: {
    floor: (level: number, max: number): string => `Étage ${level}/${max}`,
    nextFloor: 'L’étage suivant se livre comme un chantier : transférez, heurtez-la, ou laissez faire les porteurs.',
    signalSent: 'Le Signal est lancé : des survivants arrivent à chaque aube.',
    lureNight: (night: number): string => `La nuit ${night}, toutes les vagues marcheront sur elle.`,
    lureTonight: 'Cette nuit, toutes les vagues marchent sur elle.',
  },

  /** La fenêtre d'une base mutante. */
  enemyBase: {
    level: (level: number): string => `Niveau ${level}`,
    zone: (tiles: number): string => `Zone tenue : ni récolte ni construction à ${tiles} cases`,
    /** `gear` : l'arc qu'il faut, avec sa majuscule. */
    required: (gear: string, level: number): string => `Équipement requis : ${gear} (niveau ${level})`,
    weak: 'Il vous faut un meilleur équipement : vos flèches n’y font rien. Forgez un meilleur arc à la forge.',
    ready: 'Votre arc l’entame : approchez-vous, il tire seul.',
    prestige: (amount: number): string => `Abattue, elle rapporte ${amount} Prestige et libère sa zone.`,
    raiders: (count: number, capacity: number): string => `Assaillants en réserve : ${count} sur ${capacity}`,
    guards: (count: number, max: number): string => `Gardiens : ${count} sur ${max}`,
    spitters: (count: number, max: number): string => `Cracheurs : ${count} sur ${max}`,
    fire: (range: number, damage: number): string => `Boules de feu : ${damage} points de vie à ${range} cases`,
    fireWarning: 'Elle tire des boules de feu sur qui entre dans sa zone : une lueur les annonce, bougez pour les esquiver.',
    chief: (hp: number, max: number): string => `Chef : ${hp} sur ${max} points de vie`,
    shielded: 'Sous le bouclier de son chef : aucune flèche ne l’entame tant qu’il vit. Abattez-le d’abord — il ne revient pas.',
    chiefReward: (prestige: number): string => `Son chef abattu rapporte ${prestige} Prestige et un butin rare.`,
    raid: 'Le jour, elle produit des assaillants ; à la nuit tombée, ils sortent tous attaquer la ville.',
    asleep: (night: number): string => `Elle n’enverra ses premiers assaillants qu’à la nuit ${night}.`,
  },

  /** La forge d'équipement, dans la fenêtre de la forge. */
  gear: {
    /** `gear` : l'arc d'Adam, avec sa majuscule. */
    current: (gear: string, level: number): string => `Votre arc : ${gear} (niveau ${level})`,
    next: (gear: string, level: number): string => `Forger : ${gear} — entame les bases de niveau ${level}`,
    button: 'Forger l’arc',
    best: 'Vous avez le meilleur arc.',
    comeCloser: ' — rapprochez-vous.',
  },

  barracks: {
    /** `n` compagnons sur `max`, formations comprises. */
    army: (n: number, max: number): string => `Troupe : ${n}/${max}`,
    recruitTitle: 'Recruter',
    training: (label: string, seconds: number): string => `Formation : ${label}, encore ${seconds} s`,
    full: (max: number): string => `Troupe complète : ${max} compagnons au plus. Un compagnon tombé laisse une place.`,
    rosterTitle: 'Armée',
    none: 'Aucun compagnon pour l’instant : recrutez-en un ci-dessus.',
    hp: (hp: number, max: number): string => `${hp}/${max} PV`,
    stats: {
      hp: (n: number): string => `${n} points de vie`,
      damage: (n: number): string => `${n} dégât${n > 1 ? 's' : ''} par coup`,
      range: (n: number): string => `portée ${n} case${n > 1 ? 's' : ''}`,
      heal: (n: number): string => `soigne ${n} point${n > 1 ? 's' : ''} de vie`,
    },
    recruit: 'Recruter',
    seconds: (n: number): string => `${n} s de formation`,
    comeCloser: ' — rapprochez-vous.',
  },
  clinic: {
    beds: (used: number, beds: number): string => `Places occupées : ${used}/${beds}`,
    full: 'Complète : les mutants vaincus ne tombent plus assommés pour elle.',
    open: 'Un mutant vaincu peut tomber assommé — touchez-le, il vous suivra jusqu’ici.',
  },

  /** La fenêtre d'une créature — un habitant ou un ennemi —, tapée sur la carte (`ui/creatureView.ts`). */
  creature: {
    /** Les libellés de la fiche, colonne de gauche : une ligne par donnée. */
    field: {
      sex: 'Sexe',
      age: 'Âge',
      role: 'Métier',
      species: 'Espèce',
      doing: 'Activité',
      employer: 'Travaille pour',
      bed: 'Dort à',
      carry: 'Porte',
      rank: 'Rôle',
      target: 'Marche sur',
      status: 'État',
      trait: 'Trait',
      bio: 'Biographie',
    },
    /** Le sexe d'un habitant, après son symbole (♂, ♀). */
    sex: {
      male: 'Homme',
      female: 'Femme',
    },
    age: (years: number): string => `${years} an${s(years)} — un de plus à chaque aube`,
    /** Ce qu'il est : son métier, ou son espèce pour un ennemi. */
    role: {
      free: 'Ouvrier libre',
      porter: 'Porteur',
      logistician: 'Logisticien',
      builder: 'Bâtisseur',
      lumberjack: 'Bûcheron',
      forester: 'Forestier',
      farmer: 'Fermier',
      child: 'Enfant',
      exMutant: 'Ex-mutant, porteur',
      survivor: 'Survivant, porteur',
    },
    /** Le métier d'une femme. */
    roleFemale: {
      free: 'Ouvrière libre',
      porter: 'Porteuse',
      logistician: 'Logisticienne',
      builder: 'Bâtisseuse',
      lumberjack: 'Bûcheronne',
      forester: 'Forestière',
      farmer: 'Fermière',
      child: 'Enfant',
      exMutant: 'Ex-mutante, porteuse',
      survivor: 'Survivante, porteuse',
    },
    /** Son trait (`data/traits.ts`) et son petit effet de jeu, sur la même ligne. */
    trait: {
      hardworking: { name: 'Travailleur', effect: 'plus vif à la tâche' },
      glutton: { name: 'Gourmand', effect: 'a faim plus vite, mais plein d’entrain' },
      fearful: { name: 'Peureux', effect: 'le danger lui pèse deux fois plus' },
      sturdy: { name: 'Costaud', effect: 'tient longtemps sans manger ni boire, le danger l’ébranle peu' },
      dreamer: { name: 'Rêveur', effect: 'un peu lent, la tête ailleurs : le danger l’effleure' },
    },
    /** Une ligne drôle par trait et par rang (`BIO_COUNT` chacun), tirée de la seed et de l’id : un récit sans genre. */
    bios: {
      hardworking: [
        'A déjà fini la journée de demain, et s’en vante.',
        'Dort avec ses gants de travail, au cas où.',
        'Compte les briques pour se détendre.',
      ],
      glutton: [
        'Connaît la recette de la soupe de lichen par cœur, et la mange aussi.',
        'Garde toujours une croûte de pain dans la poche, « pour plus tard ».',
        'Se plaint du menu, resservi trois fois.',
      ],
      fearful: [
        'Entend un mutant dans chaque courant d’air.',
        'A un plan de fuite pour chaque pièce, y compris les placards.',
        'Dit bonjour aux ombres, par prudence.',
      ],
      sturdy: [
        'A déjà soulevé une porte de mairie, une fois, pour voir.',
        'Plaisante avec la faim : « Reviens quand j’aurai fini. »',
        'Boit à la gourde une fois par semaine, et jure qu’elle est pleine.',
      ],
      dreamer: [
        'Voit des animaux dans les nuages de cendre.',
        'Compose des chansons pour les arbres, qui ne répondent pas.',
        'Rêve d’un toit en forme de baleine.',
      ],
    },
    /** Renommer un habitant depuis sa fiche. */
    rename: {
      label: 'Nom',
      placeholder: 'Un nouveau nom',
      confirm: 'Renommer',
      hint: 'Laissez vide pour retrouver son prénom d’origine.',
    },
    /** Pour qui il travaille, quand son bâtiment est tombé. */
    homeless: 'personne',
    /** Où il dort, faute de lit. */
    outside: 'dehors, faute de lit',
    /** Un mutant : la flaque dont il sort. */
    emerging: 'Sort de sa flaque',
    /** Une bête, selon son humeur (`BeastState`). */
    beast: {
      roam: 'Flâne autour de sa tanière',
      chase: 'Charge Adam !',
      return: 'Rentre à sa tanière',
    },
    /** Ce que fait un gardien de base à part. */
    spitter: 'Crache de loin, et recule si on l’approche',
    chief: 'Chef de sa base : tant qu’il vit, elle est sous bouclier',
    slamming: 'Lève sa massue — sortez du cercle !',
  },

  crew: {
    less: 'Un ouvrier de moins',
    more: 'Un ouvrier de plus',
    missing: (count: number): string =>
      `${count} ouvrier${s(count)} manquant${s(count)} : le poste se remplira dès qu’un ouvrier sera libre.`,
    none: 'Aucun ouvrier : le bâtiment est à l’arrêt.',
    /** `returned` : les postes fermés, rendus à la ville (0 : on n'en parle pas). */
    assigned: (filled: number, returned: number): string =>
      `${filled} ouvrier${s(filled)} affecté${s(filled)}` + (returned > 0 ? `, ${returned} rendu${s(returned)} à la ville.` : '.'),
    /** Le sélecteur de priorité de travail : qui se pourvoit d'abord quand les ouvriers manquent. */
    priority: {
      label: 'Priorité',
      low: 'Basse',
      normal: 'Moyenne',
      high: 'Haute',
    },
  },

  upgrade: {
    /** « Renforcer : PV 60 → 90… ». */
    effect: (action: string, effect: string): string => `${action} : ${effect}`,
    comeCloser: ' — rapprochez-vous.',
    lacking: (count: number): string => `manque ${count}`,
    hp: (from: number, to: number): string => `PV ${from} → ${to}`,
    range: (from: number, to: number): string => `portée ${from} → ${to}`,
    /** Le gain de cadence de tir, en pour cent. */
    rate: (percent: number): string => `cadence ${percent > 0 ? '+' : ''}${percent} %`,
  },

  /** D'où vient la famine d'une forge ou d'une nurserie. */
  starved: {
    coming: (item: string): string => `${item} : les porteurs l’apportent.`,
    inTown: (item: string, count: number): string => `${item} en ville : ${count} — les porteurs arrivent.`,
    /** `inRange` : la ville peut la servir — on transfère ; sinon, on apporte. */
    noPorter: (item: string, count: number, inRange: boolean): string =>
      `${item} en ville : ${count} — aucun porteur : ${inRange ? 'transférez-le' : 'apportez-le'}.`,
    inBag: (item: string): string => `${item} dans le sac — heurtez-la ou transférez.`,
    nowhere: (item: string): string => `Plus de ${item.toLowerCase()} nulle part — récoltez-en.`,
  },

  /** Une quantité de recette : « 2 minerai de fer ». */
  recipeAmount: (amount: number, item: string): string => `${amount} ${item.toLowerCase()}`,
  /** Un compte à rebours : « 9 min 32 s », ou « 32 s ». */
  duration: (minutes: number, seconds: number): string =>
    minutes > 0 ? `${minutes} min ${seconds.toString().padStart(2, '0')} s` : `${seconds} s`,

  /** La zone d'échange sac ⇄ coffre. */
  transfer: {
    quantity: 'Quantité par tap',
    all: 'Tout',
    bag: 'Sac d’Adam',
    takeAll: 'Tout prendre',
    depositAll: 'Tout déposer',
    empty: 'Vide',
    reserved: (count: number): string => `dont ${count} réservé${s(count)}`,
    comeCloser: 'Rapprochez-vous du bâtiment pour échanger.',
    bagFull: 'Sac plein : déposez avant de prendre.',
    nothingFits: 'Rien de votre sac n’entre dans ce coffre pour l’instant.',
  },

  /**
   * Pourquoi « Poser » est grisé : le motif (`text`) et, s'il y en a un, le
   * remède (`remedy`, '' sinon).
   */
  placement: {
    locked: 'Il vous manque le plan',
    terrain: 'Pas sur l’eau',
    occupied: 'Case occupée',
    onPlayer: 'Vous êtes sur l’emplacement',
    outOfReach: 'Trop loin — rapprochez-vous',
    unique: 'Un seul par colonie',
    /**
     * Une foreuse hors de son assise (`footing`) : `vein`, le filon qu'elle
     * couvre le plus (`veins`), `null` sans filon ; `ore` et `grass`, les cases
     * qu'il en faut.
     */
    footing: {
      text: (vein: string | null, ore: number, grass: number): string =>
        vein === null
          ? `Une foreuse se pose sur ${ore} cases d’un filon et ${grass} cases d’herbe.`
          : `Une foreuse de ${vein} se pose sur ${ore} cases de ${vein} et ${grass} cases d’herbe.`,
      remedy: 'À cheval sur le bord du filon : cassez ses rochers, gardez l’herbe',
    },
    /** Le nom court d'un filon, au milieu d'une phrase : « 2 cases de fer ». */
    veins: { ironOre: 'fer', coal: 'charbon', stone: 'pierre' } satisfies Record<DrillDeposit, string>,
    polluted: { text: 'Terre polluée', remedy: 'Une station de dépollution à côté la rendra saine' },
    radioactive: { text: 'Terre radioactive', remedy: 'Inconstructible, et rien ne la nettoie pour l’instant' },
    road: { text: 'Une route passe ici', remedy: 'Retirez-la d’abord : Bâtir › Route › Retirer' },
    shore: { text: 'Le puits se pose au bord d’une rivière', remedy: 'Collez-le à l’eau : il y puise' },
    nearHall: { text: 'Trop près de la mairie', remedy: 'Éloignez-vous, hors du cercle autour d’elle' },
    treesAndRocks: { text: 'Des arbres et des rochers gênent', remedy: 'Adam peut les récolter' },
    rocks: { text: 'Des rochers gênent', remedy: 'Adam peut les casser' },
    rock: { text: 'Un rocher gêne', remedy: 'Adam peut le casser' },
    trees: { text: 'Des arbres gênent', remedy: 'Adam peut les couper' },
    tree: { text: 'Un arbre gêne', remedy: 'Adam peut le couper' },
    enemyZone: { text: 'Une base mutante tient cette zone', remedy: 'Abattez-la avec un arc de son niveau' },
    unexplored: 'Zone inexplorée — allez-y d’abord',
    /** Ce qu'une foreuse posée là extraira. */
    extracts: (item: string): string => `Extraira : ${item}`,
    /** Pourquoi une partie d'un tracé de route ne sera pas pavée. */
    roads: {
      noStone: { text: 'Plus de pierre pour la suite', remedy: 'Cassez des rochers, ou tracez dans le rayon de la mairie' },
      terrain: { text: 'Pas sur l’eau', remedy: '' },
      occupied: { text: 'Un bâtiment est sur le tracé', remedy: '' },
      resource: { text: 'Un arbre ou un rocher gêne', remedy: 'Adam peut le récolter' },
      enemyZone: { text: 'Une base mutante tient la zone', remedy: 'Abattez-la avec un arc de son niveau' },
      unexplored: { text: 'Le tracé entre dans l’inconnu', remedy: 'Explorez d’abord la zone' },
      polluted: { text: 'Terre polluée sur le tracé', remedy: 'Une station de dépollution la rendra saine' },
      radioactive: { text: 'Terre radioactive sur le tracé', remedy: 'Inconstructible, et rien ne la nettoie pour l’instant' },
    },
  },
};
