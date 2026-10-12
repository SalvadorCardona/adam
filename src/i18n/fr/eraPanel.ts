/**
 * Section `eraPanel` du dictionnaire français : le panneau des ères
 * (`ui/eraPanel.ts`), ouvert depuis la mairie, et l'écran du passage.
 */

/** Le pluriel français : 0 et 1 au singulier. */
const s = (count: number): string => (count > 1 ? 's' : '');

export const eraPanel = {
  /** Le bouton de la fenêtre de la mairie : « Ères · Campement ». */
  open: (era: string): string => `Ères · ${era}`,
  title: 'Les ères de la colonie',
  close: 'Fermer',
  /** La frise des quatre ères. */
  timeline: 'Progression des ères',
  current: 'Ère actuelle',
  next: (era: string): string => `Prochaine ère : ${era}`,
  last: 'La colonie est à sa dernière ère : la cité gronde, tenez-la debout.',
  conditions: 'Pour y passer',
  objectives: 'Objectifs réussis',
  population: 'Habitants',
  /** Une recherche clé : « Recherche : Fonderie ». */
  research: (name: string): string => `Recherche : ${name}`,
  /** L'investissement : payé au passage, le sac d'abord, puis la ville. */
  invest: 'À investir au passage (sac, puis ville)',
  brings: 'Ce qu’elle apporte',
  resource: (item: string): string => `Nouvelle ressource : ${item}`,
  buildings: 'Au menu « Bâtir »',
  /** Les régions de l'anneau que l'ère ouvre (`REGION_RINGS[].era`). */
  regions: (count: number): string => `${count} région${s(count)} à conquérir : leurs gardiens se montrent`,
  /** L'onglet de recherches qu'ouvre l'ère : « Onglet « Bourg » au labo : 2 recherches ». */
  researchTab: (era: string, count: number): string => `Onglet « ${era} » au labo : ${count} recherche${s(count)}`,
  threat: 'Nouvelle menace',
  /** Le bouton du passage. */
  advance: (era: string): string => `Passer à l’ère : ${era}`,
  /** Sous le bouton, tant que tout n'est pas réuni. */
  missing: (count: number): string => `Encore ${count} condition${s(count)} à remplir`,
  ready: 'Tout est réuni : à vous de lancer le passage !',
  rejected: 'Il manque encore des conditions pour changer d’ère.',
  /** L'écran du passage. */
  reached: 'Nouvelle ère !',
  onward: 'En avant !',
};
