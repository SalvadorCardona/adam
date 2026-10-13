/**
 * L'écran de l'ami en jeu (`?play=CODE`) : il couvre la page tant que la
 * partie de l'hôte n'est pas arrivée — connexion, salle d'attente —, puis
 * s'efface ; il revient si l'hôte s'en va, si la session se ferme ou si la
 * connexion se perd. Rien n'y bloque l'ami : « Retour à l'écran titre » le
 * rend à sa propre partie, intacte — rien de celle de l'hôte n'est sauvegardé
 * chez lui.
 */

import { onLocale, t } from '../i18n/locale.ts';
import type { Messages } from '../i18n/messages.ts';

export type PlayFailure = keyof Messages['party']['play']['failed'];

export type PlayScreenState =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'waiting'; readonly host: string; readonly hostOnline: boolean }
  | { readonly kind: 'hostLeft'; readonly host: string }
  | { readonly kind: 'ended' }
  | { readonly kind: 'lost' }
  | { readonly kind: 'resync' }
  | { readonly kind: 'failed'; readonly reason: PlayFailure };

export class PlayScreen {
  public readonly root: HTMLElement;

  private readonly title: HTMLHeadingElement;
  private readonly status: HTMLParagraphElement;
  private readonly note: HTMLParagraphElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly backButton: HTMLButtonElement;
  private state: PlayScreenState | null = { kind: 'connecting' };
  private host = '';

  /** `onRetry` : rouvrir la page de jeu ; `onBack` : l'écran titre de l'ami. */
  public constructor(onRetry: () => void, onBack: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'overlay settings-screen join-screen play-screen';

    const panel = document.createElement('div');

    panel.className = 'panel overlay-panel settings-panel join-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    this.title = document.createElement('h2');
    this.title.className = 'overlay-title';
    this.title.id = 'play-title';
    panel.setAttribute('aria-labelledby', this.title.id);
    this.status = document.createElement('p');
    this.status.className = 'settings-note account-status';
    this.status.setAttribute('role', 'status');
    this.note = document.createElement('p');
    this.note.className = 'settings-note';
    this.retryButton = button('button-primary', onRetry);
    this.backButton = button('button-secondary', onBack);
    panel.append(this.title, this.status, this.note, this.retryButton, this.backButton);
    this.root.append(panel);
    onLocale(() => this.render());
    this.render();
  }

  public get open(): boolean {
    return this.state !== null;
  }

  /** `null` : la partie est là, l'écran s'efface. */
  public show(state: PlayScreenState | null): void {
    if (state && 'host' in state) this.host = state.host;
    this.state = state;
    this.render();
    if (state && !this.backButton.hidden) this.backButton.focus({ preventScroll: true });
  }

  private render(): void {
    const text = t().party.play;
    const state = this.state;

    this.root.hidden = state === null;
    if (!state) return;

    const failed = state.kind === 'failed' || state.kind === 'ended';

    this.title.textContent = text.title(this.host);
    this.status.textContent = statusText(state);
    this.status.dataset['tone'] = failed || state.kind === 'hostLeft' || state.kind === 'lost' ? 'offline' : 'info';
    this.note.textContent = state.kind === 'hostLeft' ? text.hostLeftNote : '';
    this.note.hidden = this.note.textContent === '';
    this.retryButton.hidden = !(state.kind === 'failed' && (state.reason === 'offline' || state.reason === 'desync' || state.reason === 'badImage'));
    this.retryButton.replaceChildren(text.retry);
    this.backButton.replaceChildren(text.backToTitle);
  }
}

function statusText(state: PlayScreenState): string {
  const text = t().party.play;

  switch (state.kind) {
    case 'connecting':
      return text.connecting;
    case 'waiting':
      return state.hostOnline ? text.waitingPaused(state.host) : text.waitingHost(state.host);
    case 'hostLeft':
      return text.hostLeft(state.host);
    case 'ended':
      return text.ended;
    case 'lost':
      return text.lost;
    case 'resync':
      return text.resync;
    case 'failed':
      return text.failed[state.reason];
  }
}

function button(className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');

  element.type = 'button';
  element.className = className;
  element.addEventListener('click', onClick);

  return element;
}
