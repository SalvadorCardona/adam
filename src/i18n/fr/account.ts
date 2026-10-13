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
  welcome: (nickname: string): string => `Bienvenue, ${nickname} !`,
  signedOutDone: 'Vous êtes déconnecté.',
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
  },
  errors: {
    invalid: 'Vérifiez les champs signalés.',
    emailTaken: 'Cette adresse a déjà un compte.',
    badCredentials: 'Adresse ou mot de passe incorrect.',
    unauthorized: 'Session expirée : reconnectez-vous.',
    tooManyAttempts: (seconds: number): string =>
      seconds >= 90 ? `Trop d’essais. Réessayez dans ${Math.ceil(seconds / 60)} min.` : `Trop d’essais. Réessayez dans ${seconds} s.`,
    server: 'Le serveur a répondu de travers. Réessayez plus tard.',
  },
};
