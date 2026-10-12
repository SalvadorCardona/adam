/**
 * L'Habitation et le bonheur — contenu pur.
 *
 * L'**Habitation** n'est pas un objet : c'est la capacité de logement de la
 * ville, la somme des lits (`beds`, `data/buildings.ts`) de ses bâtiments
 * finis — la Maison, le dortoir des porteurs, la maisonnette du forestier.
 * Elle ne bloque rien : on peut avoir plus d'habitants que de lits. Chaque
 * ouvrier adulte sur la carte (porteur, bûcheron, forestier…) se voit
 * attribuer un lit libre, le plus proche de son lieu de travail, et le
 * garde tant que la maison tient. Sans lit, il dort dehors, au pied de son
 * travail. Un enfant dort à sa nurserie : il n'en cherche pas.
 *
 * Le **bonheur** est une jauge de 0 à 100. À chaque aube, chaque cause de
 * `MOOD` qui s'applique à la nuit passée l'ajoute : un lit le fait remonter,
 * une nuit dehors le fait baisser. Sous `unhappyBelow`, l'habitant est
 * malheureux et marche à `unhappyPace` de son allure. Un besoin de plus (la
 * faim, la soif…) qui pèserait sur le moral est une entrée de plus dans
 * `MOOD`, et une ligne dans `moodCauses` (`sim/housing.ts`) : la jauge, les
 * seuils, l'allure et la bulle suivent.
 */

export const HAPPINESS = {
  /** Le haut de la jauge. */
  max: 100,
  /** Le bonheur d'un habitant qui arrive — ou d'une sauvegarde d'avant lui : neutre. */
  start: 50,
  /** Sous ce niveau, il est malheureux : la bulle, et le pas qui traîne. */
  unhappyBelow: 30,
  /** À partir de ce niveau, il est content. Entre les deux, neutre. */
  contentFrom: 70,
  /** L'allure d'un malheureux, en part de son allure normale. Adam n'en a pas : il ne dort jamais dehors. */
  unhappyPace: 0.7,
  /** L'allure d'un content : un souffle de plus, pas de quoi déséquilibrer. */
  contentPace: 1.05,
} as const;

/**
 * Ce qui fait bouger le bonheur à chaque aube, cause par cause. Trois nuits
 * dehors de suite font un malheureux (50 → 20) ; une nuit dans un lit le
 * remet sur pied (20 → 35).
 */
export const MOOD = {
  /** Une nuit dans un lit. */
  bed: 15,
  /** Une nuit dehors, faute de lit. */
  outside: -10,
  /** Affamé au matin. */
  hungry: -10,
  /** Assoiffé au matin. */
  thirsty: -10,
  /** Un ennemi s'est approché pendant la nuit (le poids de sa peur est celui de son trait). */
  scared: -8,
} as const satisfies Record<string, number>;

export type MoodCause = keyof typeof MOOD;

export const HOUSING = {
  /** Ticks entre deux attributions des lits : une maison finie, un ouvrier de plus, et le compte suit dans la seconde. */
  assignTicks: 20,
  /** Un dormeur dehors s'allonge à moins de tant de tuiles de la porte de son travail. */
  outsideSpread: 1.5,
} as const;
