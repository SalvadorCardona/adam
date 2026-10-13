/** Héberger une partie et inviter un ami (fenêtre « Inviter un ami »), ou rejoindre celle d'un autre. Le jeu vouvoie le joueur. */

/** Le temps qu'il reste, en mots : « 42 min », « 1 min », « moins d'une minute ». */
const remaining = (ms: number): string => {
  const minutes = Math.ceil(ms / 60_000);

  return ms <= 0 ? 'expirée' : minutes <= 1 ? 'moins d’une minute' : `${minutes} min`;
};

export const party = {
  /** Le bouton de la pause. */
  invite: 'Inviter un ami',
  title: 'Inviter un ami',
  joinTitle: 'Rejoindre la partie',
  intro: 'Partagez ce lien ou ce QR code : votre ami arrive dans la salle d’attente.',
  offline: 'Serveur injoignable. Le jeu reste jouable ; réessayez plus tard.',
  notConfigured: 'Les parties à plusieurs ne sont pas disponibles dans cette version du jeu.',
  signInFirst: 'Connectez-vous pour héberger votre partie et inviter un ami.',
  signInButton: 'Se connecter ou créer un compte',
  creating: 'Création de l’invitation…',
  retry: 'Réessayer',
  newInvite: 'Nouvelle invitation',
  close: 'Fermer',
  qrAlt: 'QR code de l’invitation',
  linkLabel: 'Lien d’invitation',
  codeLabel: 'Code',
  share: 'Partager',
  copy: 'Copier le lien',
  copied: 'Lien copié !',
  copyFailed: 'Copie impossible : sélectionnez le lien et copiez-le.',
  shareTitle: 'Rejoins ma partie de Mobile Factory',
  shareText: (host: string): string => `${host} t’invite à jouer à Mobile Factory.`,
  validFor: (ms: number): string => `Valable encore ${remaining(ms)}`,
  room: 'Salle d’attente',
  waitingForFriend: 'En attente d’un ami…',
  hostLine: (name: string): string => `${name} (hôte)`,
  joined: (name: string): string => `${name} a rejoint la partie`,
  closeSession: 'Fermer la session',
  sessionClosed: 'La session est fermée : le lien ne fonctionne plus.',
  ended: {
    expired: 'L’invitation a expiré.',
    closed: 'La session est fermée.',
  },
  /** L'écran de l'ami qui ouvre le lien. */
  join: {
    title: (host: string): string => `Rejoindre la partie de ${host}`,
    loading: 'Recherche de la partie…',
    signInFirst: 'Connectez-vous ou créez un compte pour rejoindre cette partie ; vous reviendrez ici ensuite.',
    signInButton: 'Se connecter ou créer un compte',
    button: 'Rejoindre',
    joining: 'Un instant…',
    waiting: (host: string): string => `Vous êtes dans la salle d’attente de ${host}. La partie commencera bientôt.`,
    own: 'C’est votre propre invitation : partagez-la depuis la pause, « Inviter un ami ».',
    leave: 'Quitter la salle',
    backToTitle: 'Retour à l’écran titre',
    offline: 'Serveur injoignable. Réessayez plus tard.',
    errors: {
      notFound: 'Ce lien d’invitation n’est pas valide.',
      expired: 'Ce lien a expiré. Demandez-en un nouveau à votre ami.',
      closed: 'Votre ami a fermé la session. Demandez-lui un nouveau lien.',
      full: 'Cette partie est déjà complète.',
      server: 'Le serveur a répondu de travers. Réessayez plus tard.',
      tooManyAttempts: (seconds: number): string => `Trop d’essais. Réessayez dans ${seconds} s.`,
      unauthorized: 'Session expirée : reconnectez-vous.',
      forbidden: 'Ce lien ne vous permet pas de rejoindre cette partie.',
    },
  },
  errors: {
    server: 'Le serveur a répondu de travers. Réessayez plus tard.',
    unauthorized: 'Session expirée : reconnectez-vous.',
    tooManyAttempts: (seconds: number): string => `Trop d’essais. Réessayez dans ${seconds} s.`,
  },
};
