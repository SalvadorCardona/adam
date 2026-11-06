/** Le compte, facultatif : inscription, connexion, déconnexion. Le jeu vouvoie le joueur. */

export const account = {
  /** Le bouton de l'écran titre et des Réglages, et le titre de la fenêtre. */
  title: 'Compte',
  /** Le bouton quand on est connecté : « Adam ». */
  signedInAs: (nickname: string): string => nickname,
  /** Le bouton hors ligne : le serveur est injoignable. */
  offlineButton: 'Compte · hors ligne',
  intro: 'Un compte est facultatif : sans lui, le jeu se joue comme avant, et vos parties restent sur cet appareil.',
  offline: 'Serveur injoignable. Le jeu reste jouable ; réessayez plus tard.',
  notConfigured: 'Les comptes ne sont pas disponibles dans cette version du jeu.',
  signIn: 'Se connecter',
  signUp: 'Créer un compte',
  signOut: 'Se déconnecter',
  switchToSignUp: 'Pas de compte ? Créer un compte',
  switchToSignIn: 'Déjà un compte ? Se connecter',
  nickname: 'Pseudo',
  nicknameHint: 'Affiché en jeu',
  email: 'Adresse e-mail',
  password: 'Mot de passe',
  passwordHint: (min: number): string => `${min} caractères au moins`,
  showPassword: 'Afficher le mot de passe',
  hidePassword: 'Masquer le mot de passe',
  working: 'Un instant…',
  signedIn: (nickname: string): string => `Connecté en tant que ${nickname}`,
  signedInEmail: (email: string): string => email,
  /** À la place de l'adresse : un invité n'a qu'un pseudo (`POST /auth/guest`). */
  guestProfile: 'Invité, sans compte : ce pseudo ne vaut que sur cet appareil.',
  welcome: (nickname: string): string => `Bienvenue, ${nickname} !`,
  signedOutDone: 'Vous êtes déconnecté.',
  /** Mot de passe oublié : le lien sous la connexion, puis le formulaire d'adresse. */
  forgotLink: 'Mot de passe oublié ?',
  forgotIntro: 'Entrez l’adresse de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe.',
  forgotSend: 'Envoyer le lien',
  /** Toujours le même message, que le compte existe ou non. */
  forgotSent: 'Si un compte existe pour cette adresse, un e-mail est parti. Son lien vaut 30 minutes.',
  backToSignIn: 'Retour à la connexion',
  /** La page ouverte par le lien de l'e-mail (`?reset=`). */
  resetIntro: 'Choisissez un nouveau mot de passe.',
  newPassword: 'Nouveau mot de passe',
  confirmPassword: 'Confirmez le mot de passe',
  resetSubmit: 'Changer le mot de passe',
  requestNewLink: 'Demander un nouveau lien',
  resetDone: (nickname: string): string => `Mot de passe changé. Bienvenue, ${nickname} !`,
  /** Pourquoi un champ est refusé. */
  field: {
    empty: 'À remplir.',
    tooShort: (min: number): string => `Trop court (${min} caractères au moins).`,
    tooLong: (max: number): string => `Trop long (${max} caractères au plus).`,
    badFormat: {
      nickname: 'Lettres, chiffres, espaces, tiret, point ou apostrophe seulement.',
      email: 'Cette adresse n’a pas l’air valide.',
      password: 'Mot de passe refusé.',
    },
    /** Les deux saisies du nouveau mot de passe diffèrent. */
    mismatch: 'Les deux mots de passe ne sont pas les mêmes.',
  },
  errors: {
    invalid: 'Vérifiez les champs signalés.',
    emailTaken: 'Cette adresse a déjà un compte.',
    badCredentials: 'Adresse ou mot de passe incorrect.',
    unauthorized: 'Session expirée : reconnectez-vous.',
    tooManyAttempts: (seconds: number): string =>
      seconds >= 90 ? `Trop d’essais. Réessayez dans ${Math.ceil(seconds / 60)} min.` : `Trop d’essais. Réessayez dans ${seconds} s.`,
    server: 'Le serveur a répondu de travers. Réessayez plus tard.',
    badToken: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.',
  },
};
