/**
 * Commandes.
 *
 * L'UI ne modifie jamais l'état. Elle pousse une commande, que le tick
 * consomme. Trois bénéfices, tous acquis dès maintenant :
 * - une partie = une seed + une liste de commandes horodatées (rejouabilité) ;
 * - l'undo devient trivial ;
 * - le canal vers un Web Worker est déjà défini, il ne restera qu'à le brancher.
 */

import type { TileCoord } from '../core/grid.ts';
import type { BuildingId } from '../data/buildings.ts';
import type { CompanionClassId } from '../data/companions.ts';
import type { ItemId } from '../data/items.ts';
import type { PerkId } from '../data/perks.ts';
import type { ResearchId } from '../data/research.ts';
import type { Look, PieceId } from '../data/wardrobe.ts';
import type { WorkPriority } from '../data/workers.ts';
import type { TransferDirection, TransferQuantity } from './transfer.ts';
import type { EntityId, MobileId } from './types.ts';

export type Command =
  /** Axe analogique du joystick, dans [-1, 1]. Remplace la valeur précédente. */
  | { type: 'setMoveAxis'; x: number; y: number }
  /** Confirmation de construction, après l'aperçu fantôme. Ouvre un chantier. */
  | { type: 'placeBuilding'; building: BuildingId; tx: number; ty: number }
  /**
   * Livre un chantier d'un coup : tout ce qu'il attend et qu'Adam porte,
   * puis, s'il manque encore quelque chose, ce que le stock de la ville a de
   * disponible. Le bouton « Transférer » de la fenêtre du bâtiment. Si
   * c'était tout ce qui manquait, le chantier s'achève.
   */
  | { type: 'transferToSite'; id: EntityId }
  /**
   * Vide le coffre d'une foreuse ou d'une ferme dans le sac, dans la limite
   * de la place. Le bouton « Prendre le reste » du panneau Recherche ; la
   * fenêtre des autres bâtiments passe par `transferItems`.
   */
  | { type: 'takeFromBuilding'; id: EntityId }
  /**
   * Vide dans le coffre d'une nurserie ou d'une forge ce que sa recette
   * consomme, dans la limite de la place : le sac d'abord, puis la ville si
   * le bâtiment est dans le rayon de la mairie. Le bouton « Transférer » de
   * sa fenêtre. Sur l'antenne, ce que son étage suivant attend.
   */
  | { type: 'supplyBuilding'; id: EntityId }
  /**
   * Vide le sac dans le stock de la ville — le coffre de la mairie. Adam doit
   * être à portée de la mairie. Sans `item`, tout le sac ; avec, cet objet seulement.
   */
  | { type: 'depositToTown'; item?: ItemId }
  /**
   * Fait passer un objet entre le sac et le coffre d'un bâtiment — la mairie,
   * une foreuse, une forge… (`sim/transfer.ts`) : `take` du coffre au sac,
   * `deposit` du sac au coffre, `quantity` unités au plus. Sans `item`, tout
   * ce qui peut passer — « Tout prendre », « Tout déposer ». Le sac ne prend
   * que ce qui y rentre, le coffre que ce qu'il accepte, et ce que des jobs
   * ont réservé reste au coffre. Adam doit être à portée. La zone d'échange
   * de la fenêtre du bâtiment.
   */
  | { type: 'transferItems'; id: EntityId; direction: TransferDirection; quantity: TransferQuantity; item?: ItemId }
  /**
   * Jette à ses pieds, en tas ramassable, ce qu'Adam porte. Sans `item`, tout
   * le sac ; avec, cet objet seulement.
   */
  | { type: 'dropItem'; item?: ItemId }
  /**
   * Le joueur a vu le bâtiment nouvellement débloqué : sa carte du menu de
   * construction perd son badge « Nouveau ». Choisir la carte l'envoie ;
   * poser le bâtiment le fait aussi.
   */
  | { type: 'seeBuilding'; building: BuildingId }
  /**
   * Choisit la recherche que mène le labo. Ses prérequis doivent être finis,
   * et aucun autre labo ne doit la mener ni l'avoir en file. Si une recherche
   * tourne déjà, celle-ci se met en file (`PRODUCTION.queueSize` au plus) ;
   * une recherche qui attendait encore son coût est remplacée — ce qui était
   * déposé reste au coffre.
   * Le bouton « Lancer » du panneau Recherche, qu'on soit loin ou non.
   */
  | { type: 'startResearch'; lab: EntityId; research: ResearchId }
  /**
   * Abandonne la recherche choisie. Tant que son coût n'est pas réuni, ce qui
   * était déposé reste au coffre ; si elle tournait, son coût y revient
   * (remboursé). Les porteurs le rapportent à la mairie, « Prendre » le remet
   * dans le sac. La suivante de la file prend sa place.
   */
  | { type: 'cancelResearch'; lab: EntityId }
  /** Retire une recherche de la file d'un labo (rien n'est payé tant qu'elle n'a pas son tour). */
  | { type: 'dequeueResearch'; lab: EntityId; research: ResearchId }
  /**
   * Dépose au labo ce que sa recherche attend : le sac d'abord, puis le
   * stock de la ville si le labo est dans le rayon de la mairie. Le bouton
   * « Transférer » du panneau. Le dernier objet déposé lance le compte à rebours.
   */
  | { type: 'transferToLab'; id: EntityId }
  /**
   * Passe un bâtiment fini au niveau suivant (`BUILDINGS[proto].upgrades`),
   * tout de suite : le coût est payé comme un « Transférer », le sac d'abord,
   * puis la ville si le bâtiment est dans son rayon. Tout ou rien — il faut
   * le coût entier. Le bouton « Renforcer » de la fenêtre d'une tour.
   */
  | { type: 'upgradeBuilding'; id: EntityId }
  /**
   * Forge l'arc du niveau suivant (`data/gear.ts`) depuis la fenêtre de la
   * forge (`GEAR_WORKSHOP`) : payé d'un coup, le sac d'abord, puis la ville
   * si la forge est dans son rayon. Adam doit être à portée de la forge.
   */
  | { type: 'craftGear'; forge: EntityId }
  /**
   * Change l'apparence d'Adam (`data/wardrobe.ts`) : le bouton « Valider »
   * de l'éditeur de personnage. Refusée si une pièce n'est pas encore
   * trouvée, n'est pas de son emplacement, ou qu'une couleur sort du nuancier.
   */
  | { type: 'dressAdam'; look: Look }
  /** L'éditeur a montré ces pièces trouvées : elles perdent leur « Nouveau » (`Player.unseenPieces`). */
  | { type: 'seePieces'; pieces: PieceId[] }
  /**
   * Recrute un compagnon de la classe `role` à la caserne : le coût de la
   * classe est payé d'un coup, le sac d'abord, puis la ville si la caserne
   * est dans son rayon, et la formation commence. Refusé au-delà de
   * `COMPANIONS.max` compagnons, vivants ou en formation. Le bouton
   * « Recruter » de la fenêtre de la caserne.
   */
  | { type: 'recruitCompanion'; barracks: EntityId; role: CompanionClassId }
  /**
   * Répare un bâtiment abîmé au bois (`REPAIR`) : ce qu'il faut pour le
   * remettre à neuf, le sac d'abord, puis la ville dans son rayon. Le bouton
   * « Réparer » de sa fenêtre.
   */
  | { type: 'repairBuilding'; id: EntityId }
  /**
   * Met en pause un bâtiment producteur (`paused: true`), ou le relance. En
   * pause, il ne produit ni ne consomme ; ses ouvriers finissent leur geste
   * puis flânent, et les porteurs vident toujours son coffre. Le bouton
   * « Pause » / « Reprendre » de sa fenêtre.
   */
  | { type: 'pauseBuilding'; id: EntityId; paused: boolean }
  /**
   * L'effectif voulu d'un bâtiment qui emploie, ramené entre son minimum et
   * son maximum. Les postes se prennent dans la population libre de la
   * ville ; un ouvrier retiré finit son geste puis redevient libre. Le
   * sélecteur − / + de sa fenêtre.
   */
  | { type: 'setWorkers'; id: EntityId; count: number }
  /**
   * La priorité de travail d'un bâtiment qui emploie : Basse, Moyenne ou
   * Haute. Quand les ouvriers manquent, Haute se pourvoit d'abord et reprend
   * ceux de Basse, qui finissent leur geste avant de partir. Le sélecteur à
   * trois positions de sa fenêtre.
   */
  | { type: 'setPriority'; id: EntityId; priority: WorkPriority }
  /**
   * Annule un chantier : l'emprise se libère, et ce qui y avait été livré
   * retourne au stock de la ville — en tas au sol s'il n'y a plus de mairie.
   * Ce que des ouvriers y portaient repart à la mairie. Le chantier de la
   * mairie ne s'annule pas. Le bouton « Annuler le chantier » de sa fenêtre.
   */
  | { type: 'cancelSite'; id: EntityId }
  /**
   * Fait l'échange `offer` (son rang dans `Caravan.offers`) avec la
   * caravane garée : son coût est payé comme un « Transférer », le sac
   * d'abord, puis la ville si la caravane est dans son rayon. Tout ou rien,
   * et une seule fois. Les boutons « Échanger » de la fenêtre Troc.
   */
  | { type: 'trade'; caravan: MobileId; offer: number }
  /**
   * Pave les tuiles du tracé, dans l'ordre, au plus `ROADS.maxTiles` : une
   * pierre chacune, prise au sac d'abord, puis à la ville si la tuile est
   * dans son rayon. Pas de chantier : la tuile payée est pavée. Une tuile
   * déjà pavée ne coûte rien ; une tuile refusée (eau, bâti, arbre, rocher)
   * est sautée ; sans pierre, le tracé s'arrête là.
   */
  | { type: 'paveRoad'; tiles: readonly TileCoord[] }
  /**
   * Retire au marteau les dalles du tracé, au plus `ROADS.maxTiles` : chacune
   * rend sa pierre — au sac, à la ville s'il est plein, au sol sinon.
   */
  | { type: 'removeRoad'; tiles: readonly TileCoord[] }
  /**
   * Les bonus plantés au jardin des souvenirs, au départ d'une nouvelle
   * colonie. Poussée avant le premier tick ; ignorée ensuite.
   */
  | { type: 'applyPerks'; perks: readonly PerkId[] }
  /**
   * Des pièces de garde-robe gagnées en succès (`data/achievements.ts`) :
   * celles qu'Adam n'a pas déjà rejoignent sa garde-robe. `silent` : au départ
   * d'une colonie, sans toast ni pastille « Nouveau ».
   */
  | { type: 'grantPieces'; pieces: readonly PieceId[]; silent?: boolean }
  /**
   * Réglage de débogage : faux, le brouillard de guerre se lève — toute la
   * carte se voit et se bâtit. Les cases explorées continuent de se compter.
   */
  | { type: 'setFog'; enabled: boolean };

/** Motif de refus d'une commande sur un chantier — remonté à l'UI par un événement. */
export type SiteRejection =
  /** Le chantier n'existe plus, ou n'est plus un chantier. */
  | 'missing'
  /** Adam est trop loin de l'emprise. */
  | 'outOfReach'
  /** Adam n'a rien dans le sac que le chantier attende. */
  | 'nothingToGive';

/** Motif de refus d'un « Prendre » — remonté à l'UI par un événement. */
export type TakeRejection =
  /** Le bâtiment n'existe plus, ou n'a pas de production à prendre. */
  | 'missing'
  /** Adam est trop loin de l'emprise. */
  | 'outOfReach'
  /** Le coffre est vide. */
  | 'empty'
  /** Le sac est plein : rien n'est pris, rien n'est jeté. */
  | 'bagFull';

/** Motif de refus d'un « Transférer » vers une nurserie ou une forge. */
export type SupplyRejection =
  /** Le bâtiment n'existe plus, ou ne consomme rien. */
  | 'missing'
  /** Adam est trop loin de l'emprise. */
  | 'outOfReach'
  /** Ni le sac ni la ville à portée n'ont rien que le bâtiment attende, ou son coffre est plein. */
  | 'nothingToGive';

/** Motif de refus d'une commande sur le labo de recherche. */
export type ResearchRejection =
  /** Le labo n'existe plus, ou n'est pas encore bâti. */
  | 'missing'
  /** La file du labo est pleine. */
  | 'busy'
  /** Un autre labo mène déjà cette recherche, ou l'a en file. */
  | 'taken'
  /** Il manque un prérequis, ou la recherche est déjà finie. */
  | 'locked'
  /** Pas de recherche en attente de son coût : rien à abandonner ni à livrer. */
  | 'idle'
  /** Adam est trop loin du labo pour y déposer. */
  | 'outOfReach'
  /** Ni le sac ni la ville à portée n'ont ce que la recherche attend. */
  | 'nothingToGive';

/** Motif de refus d'un « Déposer en ville ». */
export type DepositRejection =
  /** La mairie n'est pas encore bâtie, ou elle est tombée : pas de ville où déposer. */
  | 'noTown'
  /** Adam est trop loin de la mairie. */
  | 'outOfReach'
  /** Rien à déposer : le sac est vide, ou ne contient pas cet objet. */
  | 'empty';

/** Motif de refus d'un échange sac ⇄ coffre. */
export type TransferRejection =
  /** Le bâtiment n'existe plus, ou n'a pas de coffre où échanger. */
  | 'missing'
  /** Adam est trop loin de l'emprise. */
  | 'outOfReach'
  /** Rien ne passe : le coffre n'a rien de libre, ou n'accepte rien du sac. */
  | 'nothing'
  /** Le sac est plein : rien n'est pris, rien n'est jeté. */
  | 'bagFull';

/** Motif de refus d'un échange avec la caravane. */
export type TradeRejection =
  /** La caravane est repartie, n'est pas encore garée, ou n'a pas cet échange. */
  | 'missing'
  /** Adam est trop loin de la charrette. */
  | 'outOfReach'
  /** L'échange est déjà fait — ou l'offre rare a atteint son plafond sur la partie. */
  | 'done'
  /** Ni le sac, ni la ville à portée n'ont tout le coût. */
  | 'missingItems'
  /** Un étage d'antenne ne s'achète pas : il se livre, comme un chantier (`supplyBuilding`). */
  | 'delivered';

/** Motif de refus d'une amélioration. */
/** Motif de refus d'une réparation — remonté à l'UI par un événement. */
export type RepairRejection =
  /** Le bâtiment n'existe plus, ou n'est encore qu'un chantier. */
  | 'missing'
  /** Adam est trop loin de l'emprise. */
  | 'outOfReach'
  /** Le bâtiment n'a rien à réparer. */
  | 'intact'
  /** Ni le sac, ni la ville à portée n'ont de quoi réparer. */
  | 'noMaterial';

export type UpgradeRejection =
  /** Le bâtiment n'existe plus, ou n'est encore qu'un chantier. */
  | 'missing'
  /** Adam est trop loin de l'emprise. */
  | 'outOfReach'
  /** Le bâtiment est déjà à son niveau maximal. */
  | 'maxLevel'
  /** Ni le sac, ni la ville à portée n'ont tout le coût. */
  | 'missingItems'
  /** Un étage d'antenne ne s'achète pas : il se livre, comme un chantier (`supplyBuilding`). */
  | 'delivered';

/** Motif de refus d'un équipement à forger — remonté à l'UI par un événement. */
export type GearRejection =
  /** La forge n'existe plus, n'est qu'un chantier, ou ne forge pas d'équipement. */
  | 'missing'
  /** Adam est trop loin de la forge. */
  | 'outOfReach'
  /** Adam a déjà le meilleur arc. */
  | 'maxLevel'
  /** Ni le sac, ni la ville à portée n'ont tout le coût. */
  | 'missingItems';

/** Motif de refus d'un recrutement — remonté à l'UI par un événement. */
export type RecruitRejection =
  /** La caserne n'existe plus ou n'est qu'un chantier. */
  | 'missing'
  /** Adam est trop loin de la caserne. */
  | 'outOfReach'
  /** La caserne forme déjà une recrue. */
  | 'busy'
  /** La troupe est complète : `COMPANIONS.max`, formations comprises. */
  | 'full'
  /** Ni le sac, ni la ville à portée n'ont tout le coût. */
  | 'missingItems';

/** Pourquoi une tuile d'un tracé de route n'a pas été pavée — remonté à l'UI par un événement. */
export type RoadRejection =
  /** De l'eau : on ne pave pas un lac. */
  | 'terrain'
  /** Un bâtiment ou un chantier occupe la tuile. */
  | 'occupied'
  /** Un arbre ou un rocher : il faut le récolter d'abord. */
  | 'resource'
  /** Une base mutante tient la zone : on n'y pave pas tant qu'elle est debout. */
  | 'enemyZone'
  /** Personne n'y est encore allé : on ne pave pas l'inconnu. */
  | 'unexplored'
  /** Terre polluée : comme un bâtiment, on n'y pave pas (une station la nettoie). */
  | 'polluted'
  /** Terre radioactive : on n'y pave pas, et rien ne la nettoie. */
  | 'radioactive'
  /** Plus de pierre, ni dans le sac, ni en ville à portée. */
  | 'noStone';

/** Motif de refus d'un placement — remonté à l'UI par un événement. */
export type PlacementRejection =
  | 'occupied'
  /** Une route pave l'emprise : on la retire d'abord, au marteau. */
  | 'road'
  /** Terre polluée : inconstructible tant qu'une station de dépollution ne l'a pas nettoyée. */
  | 'polluted'
  /** Terre radioactive : inconstructible, et rien ne la nettoie (pour l'instant). */
  | 'radioactive'
  | 'terrain'
  | 'outOfReach'
  /** Un arbre ou un rocher encombre l'emprise : il faut le récolter d'abord. */
  | 'resource'
  /** Le joueur est dans l'emprise : un bâtiment est solide, il y resterait coincé. */
  | 'onPlayer'
  /**
   * Une foreuse se pose au bord d'un filon : la moitié de son emprise sur un
   * de ses gisements, l'autre sur l'herbe (`sim/footing.ts`).
   */
  | 'footing'
  /** Le puits puise au bord de l'eau : aucune case de l'emprise ne touche une rivière. */
  | 'shore'
  /** Trop près de la mairie : l'antenne se dresse à `hallDistance` tuiles au moins. */
  | 'nearHall'
  /**
   * Pas encore débloqué : il faut d'abord le plan, qu'Ève donne en récompense
   * d'une quête, la recherche du labo qui le débloque (`RESEARCH.unlocks`),
   * ou finir l'acte I (`unlockObjective`).
   */
  | 'locked'
  /** Une base mutante tient la zone : on n'y bâtit pas tant qu'elle est debout. */
  | 'enemyZone'
  /** Le brouillard couvre une case de l'emprise : personne n'y est encore allé. */
  | 'unexplored'
  /** Un seul par colonie, et il y en a déjà un — chantier compris. */
  | 'unique';

export interface CommandLogEntry {
  tick: number;
  command: Command;
}
