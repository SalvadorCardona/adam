/** Section `collection` du dictionnaire français : l'écran Collection et le toast d'un succès. */

export const collection = {
  title: 'Collection',
  /** Le bouton de l'écran titre et de la pause. */
  button: (done: number, total: number): string => `Collection · ${done}/${total}`,
  buttonLabel: 'Ouvrir la collection',
  back: 'Retour',
  close: 'Fermer',
  /** « 12 succès sur 30 ». */
  summary: (done: number, total: number): string => `${done} succès sur ${total}`,
  tabs: {
    achievements: 'Succès',
    skins: 'Skins',
    rares: 'Bâtiments rares',
  },
  tiers: {
    first: 'Premiers pas',
    progress: 'Progression',
    challenge: 'Défis',
    secret: 'Secrets',
  },
  /** Un succès caché : on ne dit rien de lui. */
  hiddenLabel: 'Succès secret',
  hiddenHint: 'À vous de le découvrir.',
  /** `done` et `goal` : l'avancement affiché sous un succès pas encore obtenu. */
  progress: (done: number, goal: number): string => `${done}/${goal}`,
  /** La récompense d'un succès : « Skin : Casquette ». */
  reward: {
    skin: (name: string): string => `Skin : ${name}`,
    trophy: (name: string): string => `Trophée : ${name}`,
  },
  skinsIntro: 'Des pièces d’Adam gagnées en succès : elles l’attendent dans le placard de chaque colonie.',
  trophyKinds: {
    decoration: 'Décoration',
    variant: 'Variante de bâtiment',
  },
  trophiesTitle: 'Trophées',
  raresIntro: 'Bâtissez chacun de ces bâtiments une fois, dans n’importe quelle colonie, pour le trouver.',
  found: 'Trouvé',
  notFound: 'Pas encore trouvé',
  empty: 'Rien pour l’instant.',
  /** Le toast d'un succès obtenu. */
  unlocked: 'Succès obtenu !',
};
