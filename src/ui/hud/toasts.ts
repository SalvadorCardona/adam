/**
 * Les bulles empilées des événements, en bas de l'écran : un message et son
 * ton, parfois un bouton ; le toast d'un succès, plus large ; ce qu'une
 * récompense a laissé à la mairie.
 */

import type { ItemId } from '../../data/items.ts';
import { t } from '../../i18n/locale.ts';
import { uiIcon } from '../icons.ts';
import { element } from './dom.ts';

/** Durée d'affichage d'une bulle, et combien peuvent s'empiler. */
const TOAST_MS = 2600;
const MAX_TOASTS = 3;

export type ToastTone = 'info' | 'good' | 'bad';

/** La main sur une bulle affichée : réécrire son texte et relancer son temps. */
export interface ToastHandle {
  /** Faux si la bulle est déjà partie. */
  update: (message: string) => boolean;
}

export class Toasts {
  public readonly root: HTMLElement;

  public constructor() {
    this.root = element('div', 'hud-toasts');
    this.root.setAttribute('aria-live', 'polite');
  }

  /** Une bulle empilée ; la plus ancienne part quand il y en a trop. */
  /**
   * Une bulle qui monte puis s'en va. `action` : un bouton dans la bulle —
   * « Essayer » sur une pièce de garde-robe trouvée — qui la ferme en servant.
   */
  public notify(message: string, tone: ToastTone = 'info', action?: { label: string; run: () => void }): ToastHandle | null {
    // Deux fois le même message d'affilée : on relance la bulle au lieu d'en empiler une deuxième.
    const last = this.root.lastElementChild as HTMLElement | null;

    if (last?.textContent === message && last.dataset['leaving'] !== 'true') {
      last.style.animation = 'none';
      void last.offsetWidth;
      last.style.animation = '';
      return null;
    }

    const toast = element('div', 'hud-toast');
    const text = document.createTextNode(message);

    toast.append(text);
    toast.dataset['tone'] = tone;
    if (action) {
      const button = element('button', 'hud-toast-action');

      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        toast.remove();
        action.run();
      });
      toast.append(button);
    }
    this.root.append(toast);

    while (this.root.childElementCount > MAX_TOASTS) this.root.firstElementChild?.remove();

    let leave = 0;
    const schedule = (): void => {
      window.clearTimeout(leave);
      leave = window.setTimeout(() => {
        toast.dataset['leaving'] = 'true';
        window.setTimeout(() => toast.remove(), 240);
      }, TOAST_MS);
    };

    schedule();
    return {
      update: (next) => {
        if (!toast.isConnected || toast.dataset['leaving'] === 'true') return false;
        text.data = next;
        toast.style.animation = 'none';
        void toast.offsetWidth;
        toast.style.animation = '';
        schedule();
        return true;
      },
    };
  }

  /**
   * Un succès obtenu : une bulle jaune plus large que les autres, le trophée
   * qui rebondit et un reflet qui la traverse. Elle reste un peu plus longtemps.
   */
  public notifyAchievement(title: string, label: string, reward: string | null): void {
    const toast = element('div', 'hud-toast hud-toast-achievement');
    const text = element('div', 'hud-toast-text');
    const kicker = element('span', 'hud-toast-kicker');
    const name = element('strong', 'hud-toast-name');

    toast.dataset['tone'] = 'trophy';
    kicker.textContent = title;
    name.textContent = label;
    text.append(kicker, name);
    if (reward) text.append(Object.assign(element('span', 'hud-toast-reward'), { textContent: reward }));
    toast.append(uiIcon('trophy', 34), text);
    this.root.append(toast);

    while (this.root.childElementCount > MAX_TOASTS) this.root.firstElementChild?.remove();

    window.setTimeout(() => {
      toast.dataset['leaving'] = 'true';
      window.setTimeout(() => toast.remove(), 240);
    }, TOAST_MS * 1.5);
  }

  /** Ce qu'une récompense n'a pas pu mettre dans le sac attend à la mairie : le joueur le sait. */
  public notifyStored(stored: Partial<Record<ItemId, number>>): void {
    const kept = (Object.entries(stored) as [ItemId, number][]).filter(([, amount]) => amount > 0);

    if (kept.length === 0) return;

    const list = kept.map(([item, amount]) => t().hud.toast.storedItem(amount, t().items[item])).join(', ');

    this.notify(t().hud.toast.storedAtHall(list), 'info');
  }

  /** Rien de branché hors de la pile : ses bulles partent avec elle. */
  public dispose(): void {}
}
