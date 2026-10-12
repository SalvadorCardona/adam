/**
 * L'écran d'un onglet dépassé : un autre onglet a repris la partie, celui-ci
 * a cessé de sauvegarder. « Reprendre la main » préviendra `main.ts`, qui
 * réclame le verrou et recharge la page sur la dernière sauvegarde.
 *
 * Ouvert, il arrête l'horloge (`main.ts` lit `open`).
 */

import { onLocale, t } from '../i18n/locale.ts';

export class TabLockPanel {
  public readonly root: HTMLElement;

  public constructor(onTake: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'overlay settings-screen';
    this.root.hidden = true;

    const panel = document.createElement('div');
    const title = document.createElement('h2');
    const body = document.createElement('p');
    const take = document.createElement('button');

    panel.className = 'panel overlay-panel';
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-modal', 'true');
    title.className = 'overlay-title';
    title.id = 'tab-lock-title';
    panel.setAttribute('aria-labelledby', title.id);
    body.className = 'settings-note';
    take.type = 'button';
    take.className = 'button-primary';
    take.addEventListener('click', onTake);
    panel.append(title, body, take);
    this.root.append(panel);

    onLocale(() => {
      const text = t().screens.tabLock;

      title.textContent = text.title;
      body.textContent = text.body;
      take.textContent = text.take;
    });
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  public show(): void {
    this.root.hidden = false;
  }
}
