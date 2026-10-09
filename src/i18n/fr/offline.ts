/** Section `offline` du dictionnaire français : le récap « Pendant votre absence ». */

/** Une durée en heures et minutes : « 1 h 05 », « 12 min ». */
const duration = (minutes: number): string =>
  minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;

export const offline = {
  title: 'Pendant votre absence',
  /** L'absence, en minutes. */
  away: (minutes: number): string => `Absence : ${duration(minutes)}`,
  /** Le plafond, en minutes : ce qui a été rattrapé quand l'absence le dépassait. */
  capped: (minutes: number): string => `La ville n’a rattrapé que ${duration(minutes)} : c’est le plafond.`,
  gained: 'Produit',
  spent: 'Consommé',
  research: 'Recherches terminées',
  births: (n: number): string => (n > 1 ? `${n} enfants sont nés` : 'Un enfant est né'),
  alertsTitle: 'À surveiller',
  nothing: 'La ville a somnolé : rien n’a bougé.',
  alerts: {
    hunger: 'Des habitants ont faim : la nourriture a manqué.',
    thirst: 'Des habitants ont soif : l’eau a manqué.',
    lowFood: 'Nourriture basse en ville.',
    lowWater: 'Eau basse en ville.',
    nurseryHungry: 'La nurserie attend de la nourriture.',
    storeFull: 'Des coffres sont pleins : personne pour les vider.',
  },
  collect: 'Récupérer',
};
