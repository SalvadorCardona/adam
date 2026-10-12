/**
 * Les écrans plein cadre (titre, pause, question avant de recommencer,
 * jardin des souvenirs), la ligne de la carte, le bandeau de la partie de
 * test, les boutons de zoom, la carte du monde.
 */

export const screens = {
  title: {
    kicker: 'Après la fin du monde',
    play: 'Jouer',
    resume: 'Continuer',
    newGame: 'Nouvelle partie',
    /** Le bouton du jardin, avec ses graines. */
    garden: (seeds: number): string => `Jardin · ${seeds}`,
    gardenLabel: 'Jardin des souvenirs',
    record: (nights: number): string =>
      `Record après le Signal : ${nights} nuit${nights > 1 ? 's' : ''} tenue${nights > 1 ? 's' : ''}`,
    controls: {
      move: 'Glissez le pouce pour marcher (ZQSD / flèches sur PC)',
      harvest: 'Passez près des arbres et des rochers pour récolter',
      deliver: 'Foncez dans un chantier pour le livrer',
    },
    /** Ce que l'écran titre dit, discrètement, d'une sauvegarde qu'il n'a pas pu reprendre. */
    oldSave: 'Ancienne sauvegarde d’une autre version : nouvelle partie.',
    corruptSave: 'Sauvegarde illisible : nouvelle partie.',
    /** Un lien vers une autre carte que celle de la sauvegarde. */
    linkedMap: (seed: string): string => `Le lien mène à la carte n° ${seed} : « Nouvelle partie » pour la jouer.`,
  },
  pause: {
    title: 'Pause',
    text: 'Les mutants attendent, eux aussi.',
    resume: 'Reprendre',
    restart: 'Recommencer',
  },
  confirmRestart: {
    title: 'Recommencer ?',
    text: 'Ta colonie sera perdue : la mairie, le sac, les enfants, tout.',
    confirm: 'Recommencer',
  },
  garden: {
    title: 'Jardin des souvenirs',
    text: 'Chaque colonie tombée laisse des graines. Plantées ici, elles aident toutes les colonies suivantes.',
    back: 'Retour',
    seeds: (seeds: number): string => `${seeds} graine${seeds > 1 ? 's' : ''}`,
    planted: 'Planté',
    plant: (perk: string, cost: number): string => `Planter ${perk} pour ${cost} graines`,
    pure: 'Partie pure — sans bonus, pour les défis',
  },
  seed: {
    /** `seed` : déjà mis en forme, milliers séparés. */
    map: (seed: string): string => `Carte n° ${seed}`,
    share: 'Partager cette carte',
    copied: 'Lien copié !',
    copyFailed: 'Copie impossible',
  },
  test: {
    banner: (scenario: string): string => `Partie de test · ${scenario}`,
  },
  /** La carte du monde : son bouton (raccourci M), son titre, sa croix et le geste à faire. */
  worldMap: {
    open: 'Carte du monde (M)',
    title: 'Carte du monde',
    close: 'Fermer la carte (Échap)',
    hint: 'Glissez pour parcourir · touchez pour y aller',
    /** La légende des régions (`data/regions.ts`). */
    regions: { conquered: 'Conquise', open: 'À conquérir', locked: 'Verrouillée' },
  },
  zoom: {
    zoomIn: 'Zoomer',
    recenter: 'Revenir sur Adam',
    zoomOut: 'Dézoomer',
  },
  /** Le nom de la carte Route, pour l'image de sa vignette. */
  road: 'Route',
};
