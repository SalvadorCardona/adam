/**
 * Porteurs — contenu pur.
 *
 * Pas de tapis : de petits humains transportent les matériaux. Les ouvriers
 * de la maison des constructeurs vident les coffres des foreuses et des
 * fermes dans la mairie, et livrent les chantiers depuis la mairie. La
 * rareté n'est plus la bande passante d'un tapis mais le nombre de porteurs
 * et la distance à parcourir.
 */

import type { ResourceId } from './resources.ts';

export const PORTERS = {
  /** Vitesse de marche, en tuiles par seconde — plus lent qu'Adam (4,5). */
  speed: 2.4,
  /** Objets portés en un voyage. */
  carry: 5,
  /** Ticks avant qu'un ouvrier oisif cherche à nouveau du travail : la recherche est le coût à surveiller. */
  retryTicks: 20,
} as const;

/**
 * Les **coups de main** : un ouvrier libre — sans poste — n'attend plus les
 * bras croisés. Le jour, il porte depuis la mairie ce qu'attendent les
 * chantiers et les labos de son rayon logistique, en petites charges. Un
 * bâtiment qui l'embauche le prend même chargé : sa charge retourne à la
 * mairie. La nuit, il dort ; pendant une vague, il s'abrite.
 */
export const VOLUNTEERS = {
  /** Objets portés en un voyage : moins qu'un porteur, il n'a pas de hotte. */
  carry: 3,
} as const;

/**
 * Les **glaneurs** : faute de mieux à porter, un ouvrier libre va ramasser à
 * la main une unité de bois ou de pierre dans le rayon de la mairie et la lui
 * rapporte — de quoi faire vivre la colonie avant la première cabane, sans
 * jamais valoir un bûcheron. Il ne glane que ce qu'on attend (chantiers,
 * labos, recettes) plus la réserve de sac : pas de stock à l'infini. Jamais de
 * fer ni de charbon, que les foreuses gardent. Le jour seulement.
 */
export const GLEANERS = {
  /** Glaneurs au travail en même temps : les autres libres flânent. */
  max: 5,
  /** Ticks à ramasser l'unité sur place : trois secondes, marche en plus, ~8 s par unité. */
  pickTicks: 60,
  /** Ressources qu'on ramasse à mains nues. */
  resources: ['tree', 'stoneRock'],
} as const satisfies { resources: readonly ResourceId[] } & Record<string, unknown>;

/**
 * Un ex-mutant, sorti guéri de la clinique, porte comme un ouvrier — mais
 * pas tout à fait : il a gardé la carrure de sa vie d'avant, pas l'allure.
 * Il porte plus lourd, et marche plus lentement.
 */
export const EX_MUTANT = {
  speed: 1.7,
  carry: 8,
} as const;

/**
 * Priorité d'un job. Un job déjà parti n'est jamais repris : le porteur qui
 * porte au chantier finit sa livraison. Parmi ceux qui attendent, un
 * chantier ou une machine en famine passe avant tout ; puis un consommateur
 * sous son stock visé (la nurserie et sa nourriture) ; puis vider un coffre
 * qui a de quoi remplir un voyage ; ramasser les restes d'un coffre ne se
 * fait que si personne n'a mieux à faire.
 */
export const JOB_PRIORITY = {
  /** Livrer un chantier en attente, depuis la mairie. */
  site: 3,
  /** Ravitailler une forge ou une nurserie à qui il manque de quoi tourner. */
  starving: 3,
  /** Compléter le coffre d'une forge ou d'une nurserie qui tourne encore, jusqu'à son stock visé. */
  refill: 2,
  /** Vider une foreuse ou une ferme qui a un plein voyage à donner. */
  empty: 1,
  /** Rapporter un reste — moins d'un voyage — à la mairie. */
  surplus: 0,
} as const;

/**
 * Ravitailler un consommateur : depuis la mairie, ou directement depuis le
 * coffre d'un producteur à `producerReach` tuiles au plus — de centre à
 * centre —, la ferme voisine d'une nurserie.
 */
export const SUPPLY = {
  producerReach: 8,
} as const;

export type JobPriority = (typeof JOB_PRIORITY)[keyof typeof JOB_PRIORITY];

/**
 * Bûcherons — les ouvriers de la cabane de bûcheron (`BUILDINGS.lumberCamp`).
 *
 * En boucle : sortir, marcher jusqu'à l'arbre intact le plus proche dans le
 * rayon de la cabane, le couper à coups de hache — une unité de bois par
 * coup, comme Adam la récolte —, rapporter le bois au coffre de la cabane.
 * Les porteurs le vident ensuite dans la mairie, comme une foreuse.
 */
export const LUMBERJACKS = {
  /** Rayon de coupe, en tuiles, depuis le centre de la cabane : c'est le cercle affiché. */
  radius: 7,
  /** Vitesse de marche, en tuiles par seconde. */
  speed: 2.2,
  /** Ticks entre deux coups de hache ; chaque coup détache une unité de bois. */
  chopTicks: 16,
  /** Bois porté en un voyage : un arbre entier. */
  carry: 5,
  /** Ticks avant qu'un bûcheron sans arbre ni place au coffre réessaie. */
  retryTicks: 40,
} as const;

/**
 * Forestiers — l'ouvrier de la maison du forestier (`BUILDINGS.foresterHouse`).
 *
 * Il plante un carré de forêt autour de la maison, case par case, rang par
 * rang depuis le coin haut-gauche : marcher jusqu'à la première case libre,
 * y planter une pousse, passer à la suivante. Un arbre coupé libère sa case,
 * il la replante. La pousse grandit seule (`SAPLING`, `data/resources.ts`).
 */
export const FORESTERS = {
  /** Côté du carré, en tuiles, centré sur la maison : c'est le carré affiché. */
  plot: 6,
  /** Vitesse de marche, en tuiles par seconde : celle d'un bûcheron. */
  speed: 2.2,
  /** Ticks pour planter une pousse, une fois sur la case. */
  plantTicks: 40,
  /** Ticks avant qu'un forestier sans case libre cherche à nouveau. */
  retryTicks: 40,
} as const;

/**
 * Fermiers — les ouvriers de la ferme (`BUILDINGS.farm`).
 *
 * Comme le forestier, ils travaillent un carré autour du bâtiment, le champ
 * (`sim/farmer.ts`) : semer la première case libre, rang par rang, la
 * laisser pousser (`CROPS`, `data/resources.ts`), puis la récolter quand
 * elle est mûre, rapporter la récolte au coffre de la ferme et revenir la
 * semer. Deux fermiers ne prennent jamais la même case.
 */
export const FARMERS = {
  /** Côté du champ, en tuiles, centré sur la ferme : c'est le carré affiché. */
  plot: 6,
  /** Vitesse de marche, en tuiles par seconde : celle d'un forestier. */
  speed: 2.2,
  /** Ticks pour semer une case, une fois dessus. */
  sowTicks: 40,
  /** Ticks pour récolter une case mûre. */
  harvestTicks: 40,
  /** Ticks avant qu'un fermier sans case à semer ni à récolter cherche à nouveau. */
  retryTicks: 40,
} as const;

/**
 * Logisticiens — les ouvriers du poste de logistique (`BUILDINGS.logisticsPost`).
 *
 * En boucle : choisir, parmi les producteurs (foreuses, fermes, cabanes de
 * bûcheron) dans le rayon du poste, le coffre le plus rempli, en charger un
 * voyage, le livrer à la mairie, revenir. Les producteurs qu'un poste
 * couvre sont à lui : les porteurs de la maison des constructeurs ne les
 * vident plus, ils livrent les chantiers.
 */
export const LOGISTICIANS = {
  /** Rayon d'action, en tuiles, du centre du poste au centre du producteur : c'est le cercle affiché. */
  radius: 10,
  /** Vitesse de marche, en tuiles par seconde : celle d'un porteur. */
  speed: 2.4,
  /** Objets portés en un voyage : un peu plus qu'un porteur (5), c'est leur métier. */
  carry: 7,
} as const;

/**
 * La flânerie d'un ouvrier sans travail : de petits trajets en ligne droite
 * autour de sa porte, entrecoupés de pauses. Aucun chemin à calculer — un
 * point tiré, une ligne vérifiée hors de l'eau, et c'est tout.
 */
export const WANDER = {
  /** Rayon de flânerie autour de la porte, en tuiles. */
  radius: 3,
  /** Allure d'un ouvrier qui flâne, en part de sa vitesse de marche. */
  pace: 0.55,
  /** Pause entre deux trajets, en ticks : un minimum, plus une part tirée au hasard. */
  pauseTicks: 30,
  pauseJitter: 90,
} as const;

/**
 * Un ouvrier qui glande : dehors, sans rien à faire. Un porteur entre deux
 * jobs n'en est pas un — il cherche du travail toutes les `PORTERS.retryTicks` :
 * il ne passe inactif qu'au bout de `graceTicks`, et le compteur du HUD ne
 * clignote pas à chaque livraison.
 */
export const IDLE = {
  graceTicks: 60,
} as const;

/**
 * Bâtisseurs — les ouvriers du poste de construction (`BUILDINGS.constructionPost`).
 *
 * En boucle : prendre, dans le rayon du poste, le chantier le plus ancien
 * qui attend encore quelque chose que la mairie a, aller le chercher à la
 * mairie, le livrer ; puis, quand un chantier a tout reçu, venir le bâtir au
 * marteau. Les chantiers qu'un poste couvre sont à lui : les porteurs de la
 * maison des constructeurs ne les livrent plus. Hors de portée de tout poste,
 * rien ne change — le dernier objet livré achève le chantier.
 */
export const BUILDERS = {
  /** Rayon d'action, en tuiles, du centre du poste au centre du chantier : c'est le cercle affiché. */
  radius: 9,
  /** Vitesse de marche, en tuiles par seconde : celle d'un porteur. */
  speed: 2.4,
  /** Objets portés en un voyage : ceux d'un porteur. */
  carry: 5,
  /** Travail d'un chantier, en ticks de bâtisseur par objet de son coût : 20 objets, 10 s pour un seul bâtisseur. */
  workPerItem: 10,
  /** Bâtisseurs qui travaillent ensemble sur un chantier, au plus : au-delà, ils se gênent. */
  perSite: 3,
} as const;

/**
 * Priorité de travail d'un bâtiment qui emploie (`sim/staffing.ts`), de la
 * plus basse à la plus haute : quand les ouvriers manquent, les postes d'une
 * priorité plus haute se pourvoient d'abord, et vont chercher ceux d'une plus
 * basse. Elle fait aussi passer devant les livraisons et enlèvements des
 * porteurs et logisticiens.
 */
export const WORK_PRIORITIES = ['low', 'normal', 'high'] as const;

export type WorkPriority = (typeof WORK_PRIORITIES)[number];

export const WORK_PRIORITY = {
  /** Celle d'un bâtiment neuf, ou d'une sauvegarde d'avant les priorités. */
  initial: 'normal',
  /**
   * Ticks pendant lesquels un bâtiment qui vient de gagner un ouvrier le
   * garde : une priorité plus haute ne le lui reprend qu'ensuite. Pas
   * d'allers-retours d'un bâtiment à l'autre quand on change d'avis.
   */
  holdTicks: 200,
} as const satisfies { initial: WorkPriority; holdTicks: number };
