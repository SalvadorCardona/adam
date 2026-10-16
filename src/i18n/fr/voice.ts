/** Le vocal : parler à son ami pendant la partie. Le jeu vouvoie le joueur. */

export const voice = {
  /** Le bouton du HUD et de la pause, hors du vocal. */
  join: 'Rejoindre le vocal',
  leave: 'Quitter le vocal',
  title: 'Vocal',
  joining: 'Autorisation du micro…',
  micOn: 'Micro ouvert',
  micOff: 'Micro coupé',
  mute: 'Couper le micro',
  unmute: 'Rouvrir le micro',
  volume: 'Volume des autres',
  you: 'Vous',
  empty: 'Personne d’autre dans le vocal pour l’instant.',
  note: 'Le son passe directement entre vos navigateurs, jamais par notre serveur.',
  /** L'état d'un autre joueur dans la liste. */
  peer: { connecting: 'connexion…', connected: 'connecté', failed: 'connexion impossible', muted: 'micro coupé', speaking: 'parle' },
  /** Pour le bouton du HUD, sa phrase accessible. */
  button: { off: 'Rejoindre le vocal', on: 'Vocal', muted: 'Vocal — micro coupé' },
  /** Les toasts. */
  toast: {
    joined: 'Vous êtes dans le vocal',
    left: 'Vous avez quitté le vocal',
    muted: 'Micro coupé',
    unmuted: 'Micro ouvert',
    unsupported: 'Le vocal n’est pas disponible dans ce navigateur (il faut une page sécurisée).',
    denied: 'Micro refusé : autorisez-le dans les réglages du navigateur, puis réessayez.',
    noMic: 'Aucun micro trouvé : branchez-en un, puis réessayez.',
    micFailed: 'Le micro ne s’ouvre pas : une autre application l’utilise peut-être.',
    peer: (nickname: string): string => `Connexion vocale impossible avec ${nickname}.`,
  },
};
