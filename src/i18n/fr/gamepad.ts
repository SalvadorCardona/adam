/** La manette : la section des Réglages, l'aide « Contrôles manette », les bulles de branchement. */

export const gamepad = {
  /** La section des Réglages. */
  heading: 'Manette',
  /** Le bouton qui ouvre l'aide, et son titre. */
  helpTitle: 'Contrôles manette',
  rumble: 'Vibrations de la manette',
  deadZone: 'Zone morte des sticks',
  /** Les deux familles de l'aide. */
  kinds: { playstation: 'PlayStation', xbox: 'Xbox · Steam Deck' },
  detected: (name: string): string => `Manette détectée : ${name}`,
  none: 'Aucune manette détectée — branchez-la, puis appuyez sur un bouton.',
  /** Les bulles du branchement à chaud. */
  connected: (kind: string): string => `Manette ${kind} connectée`,
  disconnected: 'Manette débranchée — partie en pause',
  /** Ce que fait chaque bouton, dans l'aide. */
  actions: {
    move: 'Marcher',
    cursor: 'Déplacer le curseur',
    click: 'Cliquer (tenir pour glisser)',
    navigate: 'Passer d’un bouton à l’autre',
    back: 'Retour, fermer, annuler',
    bag: 'Sac : inventaire et habillement',
    build: 'Bâtir',
    zoomStep: 'Zoom arrière, avant',
    zoom: 'Zoom continu',
    recenter: 'Revenir sur Adam',
    pause: 'Pause',
    map: 'Carte du monde',
  },
};
