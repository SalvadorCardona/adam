/** Section `researchPanel` du dictionnaire français : le panneau du labo et ses textes (`ui/researchText.ts`). */

export const researchPanel = {
  transfer: 'Transférer',
  abandon: 'Abandonner',
  takeRest: 'Prendre le reste',
  noneTitle: 'Aucune recherche en cours',
  noneHint: 'Choisissez-en une dans les onglets, puis apportez son coût.',
  approach: 'Rapprochez-vous pour déposer — ou laissez faire les porteurs.',
  transferBoth: 'Transférez le sac et la ville, heurtez le labo, ou laissez faire les porteurs.',
  transferBag: 'Transférez le sac, heurtez le labo, ou laissez faire les porteurs.',
  /** La rangée d'onglets du labo, pour un lecteur d'écran. */
  tabsLabel: 'Recherches',
  /** Le badge d'une recherche dont un prérequis manque. */
  locked: 'Verrouillée',
  /** L'état d'une ligne de la liste, recherche en cours. */
  running: 'En cours',
  launch: 'Lancer',
  /** « Lancer » quand une recherche tourne déjà : elle part à son tour. */
  enqueue: 'Mettre en file',
  /** Devant les bâtiments qu'une recherche fait entrer au menu de construction. */
  unlocks: 'Débloque :',
  /** Un bonus en pour cent, déjà formaté : « +50 % ». */
  percent: (value: string): string => `+${value} %`,
  zeroPercent: '0 %',
  /** L'effet chiffré : « Dégâts de l’arc : 1 → 1,5 ». */
  effect: (stat: string, before: string, after: string): string => `${stat} : ${before} → ${after}`,
  done: 'Terminée',
  runningLeft: (time: string): string => `En cours — encore ${time}`,
  collecting: 'En attente de son coût',
  duration: (time: string): string => `Durée : ${time}`,
  /** `list` : les prérequis qui manquent, déjà joints. */
  requires: (list: string): string => `Requiert : ${list}`,
  /** « 1 min 05 s » : `seconds` déjà sur deux chiffres. */
  minutes: (minutes: number, seconds: string): string => `${minutes} min ${seconds} s`,
  seconds: (seconds: number): string => `${seconds} s`,
  /** Une ligne de la liste : en file dans ce labo, ou menée par un autre. */
  queued: 'En file',
  taken: 'Menée par un autre labo',
  /** L'en-tête de la file : « File d’attente 1/3 ». */
  queueTitle: (count: number, max: number): string => `File d’attente ${count}/${max}`,
  /** Une recherche en file : son rang et le retrait. */
  dequeue: 'Retirer',
  /** « Terminée dans 4:05 » : le temps d'un compte à rebours, en mm:ss. */
  remaining: (time: string): string => `Reste ${time}`,
};
