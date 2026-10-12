/** Section `wardrobe` du dictionnaire français : l'éditeur de personnage et ses trouvailles. */

export const wardrobe = {
  title: 'Garde-robe d’Adam',
  /** Les onglets, un par emplacement (`LOOK_SLOTS`). */
  slots: {
    hair: 'Cheveux',
    eyes: 'Yeux',
    beard: 'Barbe',
    top: 'Haut',
    pants: 'Pantalon',
    shoes: 'Chaussures',
    glasses: 'Lunettes',
    hat: 'Chapeau',
  },
  /** Le titre du nuancier, par emplacement coloré. */
  colorOf: {
    eyes: 'Couleur des yeux',
    hair: 'Couleur des cheveux et de la barbe',
    top: 'Couleur du haut',
  },
  /** Les tons de la palette, tels qu'on les nomme dans un nuancier. */
  tones: {
    ink: 'Indigo',
    violet: 'Violet',
    yellow: 'Jaune',
    coral: 'Corail',
    orange: 'Orange',
    mint: 'Menthe',
    cyan: 'Cyan',
    toxic: 'Vert fluo',
    skin: 'Pêche',
    paper: 'Blanc',
  },
  rarities: {
    common: 'Courante',
    rare: 'Rare',
    epic: 'Épique',
  },
  /** D'où vient une pièce trouvée. */
  sources: {
    objective: 'Récompense d’objectif',
    enemyBase: 'Butin d’une base mutante',
    chief: 'Butin d’un chef de base',
    queen: 'Butin de la Reine des flaques',
    beast: 'Trouvée sur une bête',
    chest: 'Trouvée dans un coffre',
  },
  locked: 'À trouver',
  /** Sous une pièce verrouillée choisie : où la chercher. */
  lockedHint: 'Elle se trouve en jouant : coffres de la carte, objectifs, bases mutantes et leurs chefs, la Reine, parfois une bête.',
  new: 'Nouveau',
  /** Le compte des pièces qu'Adam peut porter. */
  owned: (owned: number, total: number): string => `${owned}/${total} pièces`,
  turn: 'Tourner',
  validate: 'Valider',
  cancel: 'Annuler',
  /** Le toast d'une pièce trouvée : son nom, puis d'où elle vient. */
  found: (piece: string): string => `Nouvel objet : ${piece}`,
  tryOn: 'Essayer',
  rejected: 'Adam ne peut pas porter cette tenue.',
  /** Adam a déjà toute la garde-robe : le Prestige qu'il reçoit à la place. */
  spare: (prestige: number): string => `Garde-robe complète : +${prestige} Prestige à la place`,
  /** Le mot qui flotte au-dessus d'un coffre qui s'ouvre. */
  chestOpened: 'Coffre ouvert !',
};
