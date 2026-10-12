/**
 * Pitch et univers — contenu pur, aucune logique.
 *
 * Ce fichier est la référence narrative du projet. Tout texte affiché au
 * joueur, toute description d'un sprite, tout nom de bâtiment ou de
 * personnage part d'ici. Si l'univers évolue, c'est ce fichier qui change en
 * premier ; le reste suit.
 */

export const LORE = {
  /** Nom du jeu, tel qu'affiché. */
  title: 'Mobile Factory',

  /**
   * Le pitch, en une respiration.
   *
   * Nous sommes dans un futur apocalyptique. Il ne reste que quelques
   * survivants. Le héros s'appelle Adam ; Ève viendra sûrement le rejoindre.
   * Dehors, des humains mutants radioactifs rôdent. Reconstruire une colonie
   * commence par une mairie, et par ramasser de ses mains ce qu'il faut pour
   * la bâtir.
   */
  pitch:
    'Un futur apocalyptique. Quelques survivants. Adam, seul au milieu des ' +
    'ruines, ramasse du bois et du minerai à mains nues pour bâtir une mairie ' +
    '— le premier toit de la colonie. Ève arrivera ensuite. Et avec elle, ' +
    'les mutants radioactifs qui rôdent au-delà de la clairière.',

  /** Époque : futur post-apocalyptique, après une catastrophe nucléaire. */
  era: 'futur post-apocalyptique, longtemps après une catastrophe nucléaire',

  characters: {
    adam: {
      name: 'Adam',
      role: 'héros, premier survivant, celui que le joueur incarne',
      description:
        'Homme adulte, cheveux indigo, tunique orange, écharpe corail au vent, ' +
        'sac à dos violet où il porte ce qu’il ramasse, et son arc de fortune à la main.',
    },
    eve: {
      name: 'Ève',
      role:
        'seconde survivante, ingénieure bricoleuse ; arrive après la troisième nuit, ' +
        'vit à la mairie, répare le bâti et donne les quêtes',
      description:
        'Femme adulte, taquine et bienveillante, création originale comme Adam. ' +
        'Chignon rond et carré court indigo, bandeau jaune, salopette cyan sur une ' +
        'chemise orange, clé à molette à la main. Elle arrive sur un vélo-cargo de ' +
        'récup à caisse jaune fleurie. Elle tutoie Adam, qui ne parle pas.',
    },
    mutant: {
      name: 'Mutant radioactif',
      role: 'humain irradié, hostile, marche droit sur la mairie pour la démolir',
      description:
        'Drôle plus qu’effrayant : tête bosselée, un œil énorme et un tout petit, ' +
        'sourire idiot, un bras trop long qui traîne au sol, peau vert fluo et ' +
        'halo radioactif. Il arrive par vagues ' +
        'dès que la mairie est debout, traverse tout, et ne s’arrête que devant ' +
        'un mur pour le casser.',
    },
    exMutant: {
      name: 'Ex-mutant',
      role: 'mutant assommé, ramené à la clinique et guéri ; habitant et porteur',
      description:
        'Un humain de nouveau, tunique orange comme les autres, mais il lui reste ' +
        'une touffe vert fluo sur le crâne, un œil qui louche et un pansement sur la joue. ' +
        'Plus costaud qu’un porteur, plus lent aussi.',
    },
    child: {
      name: 'Enfant',
      role: 'né à la nurserie, premier signe que la colonie vit',
      description:
        'Petit survivant en tunique orange et casquette jaune, écharpe corail. Il joue ' +
        'autour de la nurserie et n’en va jamais loin.',
    },
  },

  /**
   * Adam n'a pas de bouton d'action, mais il n'est pas sans défense : un
   * petit arc de fortune tire tout seul sur le mutant le plus proche.
   */
  weapons: {
    bow: {
      name: 'Arc de fortune',
      description:
        'Une branche courbée et un fil récupéré. Il tire de lui-même sur le ' +
        'mutant le plus proche dès qu’il entre à portée.',
    },
  },

  /**
   * Chaque bâtiment a trois textes : `site` pour son chantier, `description`
   * pour le bâtiment fini, `effect` pour sa carte du menu de construction —
   * une ligne, ce qu'il fait vraiment aujourd'hui. Un bâtiment debout ne
   * parle jamais de son chantier ; un bâtiment qui ne fait encore rien le dit.
   * `sign` est son nom court, peint sur sa pancarte : un mot ou deux, qui
   * disent à quoi il sert.
   */
  buildings: {
    townHall: {
      name: 'Mairie',
      sign: 'Mairie',
      site:
        'Le premier bâtiment de la colonie. Le jeu commence sur son chantier : ' +
        'il faut y apporter du bois et de la pierre pour l’achever.',
      description: 'Le cœur de la colonie : si elle tombe, tout est perdu.',
      effect: 'Le cœur de la colonie : si elle tombe, tout est perdu.',
    },
    lumberCamp: {
      name: 'Cabane de bûcheron',
      sign: 'Bûcherons',
      site: 'Quelques rondins empilés, une hache plantée dans la souche : la cabane attend ses murs.',
      description:
        'Une cabane de rondins, sa pile de bûches et sa hache plantée dans la souche. ' +
        'Deux bûcherons y vivent : ils coupent seuls les arbres alentour et rangent le bois ' +
        'dans son coffre, que les porteurs vident à la mairie.',
      effect: '2 bûcherons coupent seuls les arbres alentour.',
    },
    foresterHouse: {
      name: 'Maison du forestier',
      sign: 'Forestier',
      site: 'Une brouette de jeunes plants et une bêche plantée dans la terre : la maison attend ses murs.',
      description:
        'Une maisonnette au toit couvert de mousse, ses pots de semis et son arrosoir. ' +
        'Le forestier y vit : il plante tout autour un carré de jeunes arbres, rang par rang, ' +
        'et replante chaque case que les bûcherons ont coupée.',
      effect: '1 forestier plante et replante une forêt autour.',
    },
    logisticsPost: {
      name: 'Poste de logistique',
      sign: 'Logistique',
      site: 'Des caisses empilées et un panneau fléché planté de travers : le poste attend son auvent.',
      description:
        'Un quai sous un auvent rayé, des caisses empilées, une charrette et un panneau fléché. ' +
        'Quatre logisticiens, caisse au dos, y vident les coffres des producteurs alentour ' +
        'et en rapportent tout à la mairie.',
      effect: '4 logisticiens vident les producteurs alentour dans la mairie.',
    },
    constructionPost: {
      name: 'Poste de construction',
      sign: 'Bâtisseurs',
      site: 'Un établi à moitié monté et un tas de planches : le poste attend son échafaudage.',
      description:
        'Un atelier sous un échafaudage, un établi, un tas de planches et des barrières rayées. ' +
        'Quatre bâtisseurs, casque jaune et marteau à la ceinture, y prennent à la mairie ' +
        'ce qui manque aux chantiers alentour, le livrent, puis les bâtissent.',
      effect: '4 bâtisseurs livrent et bâtissent les chantiers alentour.',
    },
    drill: {
      name: 'Foreuse',
      sign: 'Foreuse',
      site: 'Un bâti de pierre qui attend son fer. Posée au bord d’un filon, elle l’extraira seule.',
      description: 'Machine de récupération qui extrait le filon sous elle.',
      effect: 'Extrait seule le minerai du filon sous elle.',
    },
    nursery: {
      name: 'Nurserie',
      sign: 'Nurserie',
      site: 'Des murs à monter avant d’y installer le berceau. Il lui faut du bois et de la pierre.',
      description:
        'Un abri chauffé, des couvertures, un berceau. Toutes les trois minutes, ' +
        'un enfant y naît et la colonie grandit d’un survivant — s’il y a de ' +
        'quoi le nourrir : chaque naissance mange six nourritures, rapportées de la chasse.',
      effect: '+1 enfant toutes les 3 min, contre 6 nourritures.',
    },
    builderHouse: {
      name: 'Maison des constructeurs',
      sign: 'Porteurs',
      site: 'Le dortoir de quatre ouvriers, encore à l’état de planches et de tôle empilées.',
      description:
        'Un dortoir de planches et de tôle pour quatre ouvriers. Ce sont eux ' +
        'qui, bientôt, porteront les ressources à la place d’Adam.',
      effect: 'Loge 4 ouvriers. Pas encore d’autre effet.',
    },
    home: {
      name: 'Maison',
      sign: 'Maison',
      site: 'Un plancher, des montants et quatre sommiers qui attendent leurs murs.',
      description:
        'Une maison à étage, sa cheminée qui fume et un édredon qui prend l’air à la fenêtre. ' +
        'Quatre habitants y dorment au chaud : sans lit, on dort dehors, on se lève malheureux ' +
        'et on traîne les pieds.',
      effect: '4 lits : 4 habitants dorment au chaud.',
    },
    quarry: {
      name: 'Carrière',
      sign: 'Carrière',
      site: 'Une grue de fortune au-dessus d’un vieux parking effondré : trois ouvriers y casseront le béton.',
      description:
        'Un parking effondré, une grue bricolée et des tas de moellons roses. Trois ouvriers ' +
        'y taillent la pierre dans les ruines du vieux monde et la rangent dans son coffre, ' +
        'que les porteurs vident à la mairie. Pas besoin de rocher : les ruines ne manquent pas.',
      effect: '3 ouvriers taillent la pierre, sans rocher.',
    },
    well: {
      name: 'Puits',
      sign: 'Puits',
      site: 'Une margelle à moitié montée et deux montants sans toit : un ouvrier y tirera l’eau.',
      description:
        'Une margelle de pierres, un treuil et son seau sous un petit toit, au bord ' +
        'de la rivière : un ouvrier y puise l’eau que boit la colonie et la range ' +
        'dans son coffre, que les porteurs vident à la mairie.',
      effect: '1 ouvrier puise 12 eaux par minute, au bord d’une rivière.',
    },
    farm: {
      name: 'Ferme',
      sign: 'Ferme',
      site: 'Une cabane à outils à monter avant de retourner la terre. Quatre fermiers y travailleront.',
      description:
        'Quelques sillons dans la terre irradiée et une cabane à outils. Ses ' +
        'fermiers sèment le champ autour, case par case, le regardent pousser, ' +
        'puis rapportent la récolte au coffre.',
      effect: 'Jusqu’à 4 fermiers cultivent un champ de 6 × 6 : environ 9 nourritures par minute.',
    },
    watchtower: {
      name: 'Tour de guet',
      sign: 'Tour de guet',
      site: 'Quatre poteaux plantés, une plateforme à clouer dessus. L’arc viendra ensuite.',
      description:
        'Une plateforme de planches sur quatre poteaux, avec un arc et un carquois. ' +
        'Elle tire seule sur tout mutant qui passe à sa portée, et voit venir de loin ce que le brouillard cache.',
      effect: 'Tire sur les mutants à 8 cases, voit à 13.',
      /** Le niveau 2, gagné depuis la fenêtre de la tour : `BUILDINGS.watchtower.upgrades`. */
      reinforced: {
        name: 'Tour de guet renforcée',
        action: 'Renforcer',
        description:
          'Une tour de guet blindée de plaques de fer. Son arc porte plus loin ' +
          'et tire plus vite que celui d’une tour de planches.',
      },
    },
    archerTower: {
      name: 'Tour d’archers',
      sign: 'Archers',
      site: 'Un socle de pierre, des créneaux de planches à clouer. Il faudra deux archers pour la tenir.',
      description:
        'Un donjon trapu de planches sur un socle de pierre, des créneaux et deux archers ' +
        'de la colonie derrière. Sans eux, elle ne tire pas ; avec un seul, deux fois moins vite.',
      effect: 'Tire sur les mutants à 9 cases, tenue par 2 archers.',
    },
    palisade: {
      name: 'Palissade',
      sign: 'Palissade',
      site: 'Des pieux taillés en pointe, couchés au sol, et une corde pour les lier.',
      description:
        'Trois pieux taillés en pointe, liés de corde. Un mutant ne contourne rien : ' +
        'il s’arrête et la casse, le temps que les tours le criblent.',
      effect: 'Arrête les mutants le temps qu’ils la cassent.',
    },
    forge: {
      name: 'Forge',
      sign: 'Forge',
      site: 'Un four de pierre et sa cheminée, encore sans feu. Il lui faut du minerai de fer pour l’armer.',
      description:
        'Un four de pierre, une cheminée qui fume et une enclume. Deux minerais de fer ' +
        'et un charbon y deviennent une plaque de fer.',
      effect: '2 fer + 1 charbon → 1 plaque de fer.',
    },
    charcoalKiln: {
      name: 'Four à charbon',
      sign: 'Charbonnière',
      site: 'Un dôme de briques à monter autour d’une porte ronde. Il lui faudra un chauffeur.',
      description:
        'Un dôme de briques roses où le bois couve à l’étouffée. Son chauffeur y ' +
        'cuit trois bois en un charbon, que les porteurs emportent à la mairie : ' +
        'la forge ne reste plus à sec, et le bois en trop sert enfin.',
      effect: '3 bois → 1 charbon, 1 ouvrier.',
    },
    clinic: {
      name: 'Clinique',
      sign: 'Clinique',
      site: 'Des murs à monter, un lit de camp qui attend déjà. Il faudra aussi de quoi nourrir les convalescents.',
      description:
        'Trois lits de camp, des bandages et une croix menthe sur la porte. Un mutant ' +
        'assommé qu’Adam y ramène en ressort guéri après une nuit de soins — un ' +
        'habitant, un peu vert sur les bords, qui porte plus lourd que les autres.',
      effect: 'Soigne les mutants assommés : 3 places.',
    },
    purifier: {
      name: 'Station de dépollution',
      sign: 'Dépollution',
      site: 'Une cuve à poser, des tuyaux qui attendent leur pompe. Il faut une case saine, au bord des terres polluées.',
      description:
        'Une cuve violette, une pompe qui bat et un tuyau planté dans la terre grise : ' +
        'autour d’elle, les terres polluées se vident case après case, et redeviennent ' +
        'de la bonne terre où bâtir. La terre radioactive, elle, ne bouge pas.',
      effect: 'Rend saines les terres polluées alentour, une case à la fois.',
    },
    barracks: {
      name: 'Caserne',
      sign: 'Caserne',
      site: 'Une palissade à dresser, un râtelier vide qui attend ses armes. Il faudra ensuite de quoi équiper les recrues.',
      description:
        'Un fortin trapu, un râtelier de lances de fortune et un bouclier rond au-dessus de la porte. ' +
        'On y forme jusqu’à cinq compagnons — guerrier, archer ou soigneur — qui suivent Adam, ' +
        'se battent à ses côtés et se font soigner quand ça tourne mal.',
      effect: 'Forme des compagnons qui suivent Adam : guerrier, archer, soigneur. Cinq au plus.',
    },
    lab: {
      name: 'Labo de recherche',
      sign: 'Labo',
      site: 'Une cabane de planches, des fioles qui attendent sur une caisse, une antenne à dresser.',
      description:
        'Des fioles qui glougloutent, une antenne bricolée et une cheminée qui fume ' +
        'quand ça cherche. On y dépose bois, pierre et trophées d’ennemis ; il en ' +
        'ressort des améliorations pour toute la partie.',
      effect: 'Recherches : un meilleur arc, un plus grand sac, des porteurs plus forts… Une recherche à la fois par labo : bâtissez-en un autre pour en mener deux.',
    },
    /**
     * L'Antenne, le projet de l'acte II : trois étages livrés l'un après
     * l'autre, et au sommet, l'émetteur qui appelle d'autres survivants.
     */
    antenna: {
      name: 'Antenne',
      sign: 'Antenne',
      site: 'Un socle de pierre à couler, des poutres à dresser : le premier étage du Signal.',
      description:
        'Un pylône de poutres sur un socle de pierre. Chaque étage monté attire les mutants : ' +
        'la nuit suivante, toutes les vagues marchent sur elle.',
      effect: 'Trois étages pour appeler d’autres survivants. À 8 cases au moins de la mairie.',
      floors: [
        {
          name: 'Antenne — 2ᵉ étage',
          action: 'Monter l’étage',
          description:
            'Le pylône s’élève, cerclé de plaques de fer, un cœur radioactif dans sa cage. ' +
            'Encore un étage, et l’émetteur pourra parler.',
        },
        {
          name: 'Antenne — l’émetteur',
          action: 'Monter l’émetteur',
          description:
            'Au sommet, la parabole et ses deux cœurs radioactifs : le Signal part vers ' +
            'les autres survivants, et ils répondent.',
        },
      ],
    },
  },

  /** Ce que le Signal change : la fin de l'acte I, puis la partie sans fin. */
  signal: {
    actOne: 'Acte I terminé',
    title: 'Le Signal',
    answer: 'Quelqu’un répond !',
    text: 'L’antenne parle : d’autres survivants ont entendu, et ils viennent. La nuit, elle, n’a pas fini de monter.',
  },
} as const;
