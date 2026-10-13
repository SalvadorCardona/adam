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
    waiting: (host: string): string => `Vous êtes dans la salle d’attente de ${host}. La partie s’ouvre…`,
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
  /** Jouer à deux : l'écran de l'ami en jeu, et les toasts de l'hôte. */
  play: {
    title: (host: string): string => (host === '' ? 'Partie à deux' : `La partie de ${host}`),
    connecting: 'Connexion à la partie…',
    waitingHost: (host: string): string => `En attente de ${host}… La partie s’ouvrira dès son retour.`,
    waitingPaused: (host: string): string => `${host} est là : la partie démarre dès qu’il reprend le jeu.`,
    hostLeft: (host: string): string => `${host} a quitté la partie.`,
    hostLeftNote: 'Vous reviendrez dans sa partie s’il revient pendant que cette fenêtre est ouverte.',
    ended: 'L’hôte a fermé la session. La partie à deux est finie.',
    lost: 'Connexion perdue. Reconnexion…',
    resync: 'Recalage sur la partie de l’hôte…',
    failed: {
      unauthorized: 'Session expirée : reconnectez-vous, puis rouvrez le lien d’invitation.',
      notFound: 'Cette partie n’existe pas.',
      closed: 'L’hôte a fermé la session.',
      forbidden: 'Vous n’êtes pas dans la salle de cette partie : rouvrez le lien d’invitation.',
      replaced: 'Vous jouez à cette partie dans une autre fenêtre.',
      badMessage: 'Le serveur n’a pas compris la demande.',
      notInRoom: 'Le serveur n’a pas compris la demande.',
      badImage: 'La partie de l’hôte n’a pas pu être lue.',
      version: 'Votre jeu et celui de l’hôte ne sont pas de la même version : rechargez la page, et demandez-lui d’en faire autant.',
      desync: 'Votre partie et celle de l’hôte ne s’accordent plus. Rechargez la page tous les deux.',
      offline: 'Serveur injoignable. Réessayez plus tard.',
      signedOut: 'Connectez-vous pour jouer avec votre ami, puis rouvrez le lien d’invitation.',
    },
    retry: 'Réessayer',
    backToTitle: 'Retour à l’écran titre',
    /** Les toasts, chez l'un et chez l'autre. */
    partnerJoined: (name: string): string => `${name} a rejoint la partie`,
    partnerLeft: (name: string): string => `${name} a quitté la partie`,
    sessionEnded: 'Session fermée : vous jouez de nouveau seul.',
  },
};
