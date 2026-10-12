/**
 * Ce que fait Échap : fermer ce qui est au premier plan, sinon basculer la pause.
 *
 * Le menu des réglages passe avant tout : ouvert, Échap le ferme ; puis
 * la fenêtre du sac, qui couvre l'écran (Échap la ferme, et annule
 * l'habillement en cours). Le voile
 * de la pause couvre le reste : en pause, Échap la lève, et ce qui était
 * ouvert derrière le reste. Hors pause, il ferme d'abord la carte du monde,
 * qui couvre tout l'écran, puis le menu de
 * construction, puis la fenêtre d'un bâtiment (celle du labo comprise) ou le
 * panneau des ressources — les deux ne sont jamais ouverts ensemble. Rien
 * d'ouvert : pause.
 *
 * Fonction pure, sans DOM : `main.ts` l'applique, les tests la lisent.
 */

/** Ce qui est ouvert à l'écran quand Échap tombe. */
export interface EscapeState {
  settingsOpen: boolean;
  /** La fenêtre du sac : l'inventaire et l'habillement d'Adam. */
  bagOpen: boolean;
  paused: boolean;
  mapOpen: boolean;
  menuOpen: boolean;
  panelOpen: boolean;
  /** Le panneau des ressources de la ville. */
  resourcesOpen: boolean;
}

export type EscapeAction = 'closeSettings' | 'closeBag' | 'resume' | 'closeMap' | 'closeMenu' | 'closePanel' | 'closeResources' | 'pause';

export function escapeAction(state: EscapeState): EscapeAction {
  if (state.settingsOpen) return 'closeSettings';
  if (state.bagOpen) return 'closeBag';
  if (state.paused) return 'resume';
  if (state.mapOpen) return 'closeMap';
  if (state.menuOpen) return 'closeMenu';
  if (state.panelOpen) return 'closePanel';
  if (state.resourcesOpen) return 'closeResources';
  return 'pause';
}
