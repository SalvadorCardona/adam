/** Section `notifications` du dictionnaire français : les réglages, l'écran d'explication et les notifications elles-mêmes. */

export const notifications = {
  /** Le titre de la section des réglages. */
  heading: 'Notifications',
  /** Un type de notification, dans les réglages. */
  kinds: {
    research: 'Recherche terminée',
    child: 'Enfant né',
    supplies: 'Vivres bas',
    attack: 'Vague annoncée',
  },
  /** Le plafond du jour, un bouton qui fait défiler les valeurs. */
  perDay: (limit: number): string => `Au plus ${limit} par jour`,
  /** Le navigateur a refusé : seul lui peut revenir dessus. */
  denied: 'Bloquées par le navigateur : réactivez-les dans ses réglages.',
  /** Le bouton qui rouvre l'écran d'explication, tant que le navigateur n'a pas tranché. */
  allow: 'Autoriser les notifications',
  /** L'écran d'explication, avant la demande du navigateur. */
  prompt: {
    title: 'Être prévenu ?',
    intro: 'Ève vous fait signe quand il se passe quelque chose, pendant que le jeu est ouvert dans une fenêtre en retrait :',
    points: ['une recherche est finie', 'un enfant est né', 'la ville manque de vivres', 'une vague approche'],
    note: 'Quelques-unes par jour au plus, et tout se règle dans les Réglages. Le navigateur va vous demander son accord.',
    accept: 'Activer',
    later: 'Pas maintenant',
  },
  /** Les notifications elles-mêmes : courtes, dans le ton du jeu. */
  research: {
    title: 'Recherche terminée',
    body: (name: string): string => `« ${name} » est prête. Ève vous attend au labo !`,
  },
  child: {
    title: 'Un enfant est né',
    body: (name: string): string => `${name} vient d'arriver à la nurserie. Bienvenue !`,
  },
  supplies: {
    foodTitle: 'Le garde-manger se vide',
    waterTitle: 'Les gourdes se vident',
    /** `minutes` : le temps que le stock tient ; 0 quand il est déjà à sec. */
    body: (minutes: number): string => (minutes <= 0 ? 'Il n’y a plus de quoi servir tout le monde.' : `Il en reste pour ${minutes} min environ.`),
  },
  attack: {
    title: 'Une vague approche',
    body: (night: number, count: number): string => `Nuit ${night} : ${count} mutants en route. Rentrez vite !`,
  },
};
