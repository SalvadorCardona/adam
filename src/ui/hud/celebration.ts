/**
 * La célébration : l'objectif réussi fait rebondir la case de la barre en
 * menthe ; le chapitre fini, un bandeau qui dit ce qu'il rapporte, et une
 * pluie de feuilles. Une fenêtre ouverte, le bandeau se range sous la barre.
 */

import type { ObjectiveId } from '../../data/objectives.ts';
import type { UiIcon } from '../../art/ui.ts';
import { t } from '../../i18n/locale.ts';
import { uiIcon } from '../icons.ts';
import { element, text } from './dom.ts';
import type { Toasts } from './toasts.ts';

/** Largeur du bandeau d'objectif réussi rangé sous la barre, en px. */
const CELEBRATION_WIDTH = 380;

/** Durée du bandeau d'objectif réussi, en ms (cf. `celebration-in` dans le CSS). */
const CELEBRATION_MS = 4200;
/** Le rebond menthe de la case de la barre, pour un objectif réussi en cours de chapitre. */
const OBJECTIVE_DONE_MS = 1800;
/** Rangé sous la quête quand une fenêtre est ouverte, le bandeau en garde ce jeu. */
const CELEBRATION_GAP = 8;

/** Feuilles de la pluie de confettis, et combien il en tombe. */
const CONFETTI: readonly UiIcon[] = ['leafMint', 'leafMint', 'leafYellow', 'petal'];
const CONFETTI_COUNT = 36;
const CONFETTI_MS = 3200;

/** La mise en page du haut, en cache dans `Hud` : la barre et le bas de `.hud-top`. */
export interface TopLayout {
  bar: DOMRect | null;
  topRowBottom: number;
}

export class Celebration {
  public readonly root: HTMLElement;
  /** Les confettis : ils tombent derrière les cartes du HUD et les fenêtres. */
  public readonly confetti: HTMLElement;

  private objectiveDoneTimer = 0;
  private timer = 0;
  /** Le bandeau rangé sous la barre (une fenêtre ouverte) ; sa hauteur, donnée par le `ResizeObserver`. */
  private docked = false;
  private height = 0;

  /** La racine du HUD : on y cherche une fenêtre ouverte, et on y écrit la place du bandeau. */
  private readonly hud: HTMLElement;
  /** L'objectif de la barre, qui rebondit. */
  private readonly objective: HTMLElement;
  private readonly toasts: Toasts;
  private readonly layout: () => TopLayout;

  public constructor(hud: HTMLElement, objective: HTMLElement, toasts: Toasts, layout: () => TopLayout) {
    this.hud = hud;
    this.objective = objective;
    this.toasts = toasts;
    this.layout = layout;
    this.root = element('div', 'hud-celebration');
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    this.confetti = element('div', 'hud-confetti');
  }

  /** Un objectif réussi, le chapitre continue : la case de la barre rebondit en menthe, un toast dit ce qu'il rapporte. */
  public objectiveDone(id: ObjectiveId): void {
    const words = t().objectives[id];

    this.toasts.notify(t().hud.toast.objectiveDone(words.title, words.celebration), 'good');
    this.objective.dataset['done'] = 'true';
    window.clearTimeout(this.objectiveDoneTimer);
    this.objectiveDoneTimer = window.setTimeout(() => {
      if (this.root.hidden) delete this.objective.dataset['done'];
    }, OBJECTIVE_DONE_MS);
  }

  /** Un chapitre fini : un bandeau qui dit ce qu'il rapporte, et des feuilles qui pleuvent. */
  public chapterDone(index: number): void {
    const words = t().chapters[index];

    if (!words) return;

    const title = text('hud-celebration-title', words.banner || t().hud.chapterDone);
    const celebration = this.root;

    title.prepend(uiIcon('goal', 28));
    celebration.replaceChildren(
      title,
      text('hud-celebration-goal', words.title),
      text('hud-celebration-text', words.celebration),
    );
    celebration.hidden = false;
    this.objective.dataset['done'] = 'true';
    celebration.style.animation = 'none';
    void celebration.offsetWidth;
    celebration.style.animation = '';

    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      celebration.hidden = true;
      delete this.objective.dataset['done'];
    }, CELEBRATION_MS);

    this.rainLeaves();
  }

  /** Des feuilles, des pétales : la pluie de confettis, en CSS. Chacune part au bout de sa chute. */
  public rainLeaves(): void {
    for (let i = 0; i < CONFETTI_COUNT; i += 1) {
      const leaf = uiIcon(CONFETTI[i % CONFETTI.length]!, 18 + Math.round(Math.random() * 12));

      leaf.classList.add('hud-leaf');
      leaf.style.left = `${Math.round(Math.random() * 100)}%`;
      leaf.style.setProperty('--delay', `${Math.round(Math.random() * 900)}ms`);
      leaf.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 120)}px`);
      leaf.style.setProperty('--spin', `${Math.round((Math.random() - 0.5) * 900)}deg`);
      this.confetti.append(leaf);
      window.setTimeout(() => leaf.remove(), CONFETTI_MS + 1000);
    }
  }

  /** La hauteur du bandeau a changé (`ResizeObserver`) : rangé, il reprend sa place. */
  public resized(height: number): void {
    this.height = height;
    this.redock();
  }

  /** La mise en page a été relue : rangé, le bandeau reprend sa place. */
  public redock(): void {
    if (this.docked) this.dock();
  }

  /**
   * Une fenêtre ouverte (bâtiment ou sac) : le bandeau ne se pose pas dessus.
   * Il se range sous la barre, à sa largeur, et la fenêtre se tasse sous lui
   * (`--celebration-bottom`, cf. le CSS) — jamais deux cartes l'une sur l'autre.
   * Rien ne se relit ici : la place se refait à l'ouverture ou à la fermeture
   * d'une fenêtre, et quand la mise en page change (`measureLayout`).
   */
  public place(): void {
    const docked = !this.root.hidden && this.hud.querySelector('.building-panel:not([hidden])') !== null;

    if (docked === this.docked) return;
    this.docked = docked;
    this.dock();
  }

  /** Écrit la place du bandeau d'après la mise en page en cache : sous `.hud-top`, centré sur la barre. */
  private dock(): void {
    const { bar, topRowBottom } = this.layout();
    const celebration = this.root;

    if (!this.docked || !bar) {
      if (this.hud.dataset['celebration'] !== 'docked') return;
      delete this.hud.dataset['celebration'];
      celebration.style.removeProperty('top');
      celebration.style.removeProperty('left');
      celebration.style.removeProperty('width');
      return;
    }

    // Sur un téléphone, le Prestige, la ville et l'horloge font une rangée sous la barre.
    const top = Math.round(topRowBottom + CELEBRATION_GAP);

    this.hud.dataset['celebration'] = 'docked';
    celebration.style.top = `${top}px`;
    celebration.style.left = `${Math.round(bar.left + bar.width / 2)}px`;
    celebration.style.width = `${Math.round(Math.min(bar.width, CELEBRATION_WIDTH))}px`;
    this.hud.style.setProperty('--celebration-bottom', `${top + Math.round(this.height)}px`);
  }

  public dispose(): void {
    window.clearTimeout(this.objectiveDoneTimer);
    window.clearTimeout(this.timer);
  }
}
