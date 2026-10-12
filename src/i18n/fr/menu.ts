/** Section `menu` du dictionnaire français : le tiroir « Bâtir », la carte Route, la barre de placement. */

/** « 1 pierre », « 3 pierres ». */
const count = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`;

/** « fer, charbon ou pierre ». */
const or = (words: readonly string[]): string =>
  words.length > 1 ? `${words.slice(0, -1).join(', ')} ou ${words[words.length - 1]}` : (words[0] ?? '');

export const menu = {
  /** Le bouton du tiroir : aucun autre bouton ne porte ce libellé. */
  build: 'Bâtir',
  /** Les touches, en petites capsules (masquées sans clavier). */
  keys: {
    space: 'Espace',
    inventory: 'I',
    arrows: 'Flèches',
    enter: 'Entrée',
    escape: 'Échap',
  },
  drawerTitle: 'Bâtiments',
  /** Le champ de recherche en haut du tiroir, et son bouton qui le vide. */
  searchPlaceholder: 'Rechercher un bâtiment…',
  searchClear: 'Effacer la recherche',
  /** La recherche n'a rien trouvé parmi les cartes du menu. */
  searchEmpty: 'Aucun bâtiment ne correspond',
  /** La première puce du filtre : toutes les familles. */
  allCategories: 'Tous',
  /** Le libellé d'une puce : « Minerai, 2 bâtiments ». */
  categoryCount: (category: string, n: number): string => `${category}, ${count(n, 'bâtiment')}`,
  /** La puce active n'a rien pour la recherche, une autre si : « 2 résultats dans Tous ». */
  resultsElsewhere: (n: number, category: string): string => `${count(n, 'résultat')} dans ${category}`,
  /** La ligne d'effet au pied du tiroir, tant qu'aucune carte n'a été lue. */
  effectPrompt: 'Appui long sur une carte : à quoi sert le bâtiment',
  /** La ligne d'effet d'une carte lue : « Forge : … ». */
  cardEffect: (name: string, effect: string): string => `${name} : ${effect}`,
  /** Un bâtiment sans coût. */
  free: 'gratuit',
  employs: (n: number): string => `Emploie ${n} ouvrier${n > 1 ? 's' : ''}`,
  /** L'assise d'une foreuse, sur sa carte : `veins`, les filons qu'elle accepte (« fer »). */
  footing: (ore: number, veins: readonly string[], grass: number): string =>
    `Se pose sur ${ore} cases d’un filon (${or(veins)}) et ${grass} cases d’herbe`,
  /** Le badge d'une carte qui vient d'entrer au menu, jusqu'à ce qu'on la choisisse ou la pose. */
  newBadge: 'Nouveau',
  place: 'Poser',
  placeAgain: 'Poser encore',
  /** La barre de placement, fantôme posé. */
  placing: (name: string): string => `Poser : ${name}`,
  /** La barre de placement, avant de taper la carte. */
  tapToPlace: (name: string): string => `Tapez la carte pour placer ${name}`,
};
