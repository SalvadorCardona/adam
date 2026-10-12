/**
 * Ce qui sert partout : les boutons de toutes les fenêtres, les nombres, le
 * pluriel. Le jeu vouvoie le joueur ; Ève, dans `content.eve`, tutoie Adam.
 */

const NUMBER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export const common = {
  close: 'Fermer',
  cancel: 'Annuler',
  /** Un nombre lisible : virgule décimale, espace fine entre les milliers. */
  number: (value: number): string => NUMBER.format(value),
  /** « s » au pluriel : en français, 0 et 1 sont au singulier. */
  plural: (count: number): string => (count > 1 ? 's' : ''),
  /** Le titre de l'onglet. */
  pageTitle: 'Mobile Factory — après la fin du monde',
};

export const settings = {
  /** Le bouton engrenage du HUD, et le titre du menu. */
  title: 'Réglages',
  language: 'Langue',
  sound: 'Sons',
  music: 'Musique',
  /** Les pancartes des bâtiments, sur la carte. */
  signs: 'Pancartes',
  /** La vibration du téléphone aux moments clés. */
  haptics: 'Vibrations',
  /** Les curseurs de volume, sous chaque interrupteur. */
  sfxVolume: 'Volume des bruitages',
  musicVolume: 'Volume de la musique',
  /** Un interrupteur : « Musique : oui ». */
  toggle: (name: string, on: boolean): string => `${name} : ${on ? 'oui' : 'non'}`,
  /** Le nom de chaque langue, écrit dans la langue elle-même : c'est ainsi qu'on la reconnaît. */
  languageName: 'Français',
};
