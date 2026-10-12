/**
 * L'écran d'explication des notifications, montré avant la demande du
 * navigateur — jamais au premier lancement : `main.ts` l'ouvre après une
 * première recherche lancée, ou depuis les réglages. Le navigateur ne pose sa
 * question qu'une fois ; mieux vaut que le joueur sache pourquoi on la lui pose.
 *
 * Ouvert, il arrête l'horloge (`main.ts` lit `open`). Il ne décide de rien :
 * « Activer » et « Pas maintenant » préviennent `main.ts`, qui ferme l'écran.
 */

import { onLocale, t } from '../i18n/locale.ts';

export interface NotificationPromptActions {
  /** « Activer » : à lancer depuis ce geste, la demande du navigateur. */
  onAccept(): void;
  onLater(): void;
  /** Ouvert ou fermé : l'horloge s'arrête, le son de fenêtre joue. */
  onToggle(open: boolean): void;
}

export class NotificationPrompt {
  public readonly root: HTMLElement;

  private readonly actions: NotificationPromptActions;

  public constructor(actions: NotificationPromptActions) {
    this.actions = actions;
    this.root = document.createElement('div');
    this.root.className = 'overlay settings-screen';
    this.root.hidden = true;

    const panel = document.createElement('div');
    const title = document.createElement('h2');
    const intro = document.createElement('p');
    const points = document.createElement('ul');
    const note = document.createElement('p');
    const accept = document.createElement('button');
    const later = document.createElement('button');

    panel.className = 'panel overlay-panel notify-prompt';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    title.className = 'overlay-title';
    title.id = 'notify-prompt-title';
    panel.setAttribute('aria-labelledby', title.id);
    points.className = 'notify-points';
    intro.className = note.className = 'settings-note';
    accept.type = later.type = 'button';
    accept.className = 'button-primary';
    later.className = 'button-secondary';
    accept.addEventListener('click', () => {
      this.hide();
      actions.onAccept();
    });
    later.addEventListener('click', () => {
      this.hide();
      actions.onLater();
    });
    panel.append(title, intro, points, note, accept, later);
    this.root.append(panel);

    onLocale(() => {
      const text = t().notifications.prompt;

      title.textContent = text.title;
      intro.textContent = text.intro;
      points.replaceChildren(
        ...text.points.map((point) => {
          const item = document.createElement('li');

          item.textContent = point;
          return item;
        }),
      );
      note.textContent = text.note;
      accept.textContent = text.accept;
      later.textContent = text.later;
    });
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  public show(): void {
    if (this.open) return;
    this.root.hidden = false;
    this.actions.onToggle(true);
  }

  /** Échap vaut « Pas maintenant ». */
  public dismiss(): void {
    if (!this.open) return;
    this.hide();
    this.actions.onLater();
  }

  private hide(): void {
    this.root.hidden = true;
    this.actions.onToggle(false);
  }
}
