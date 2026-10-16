/**
 * Le vocal à l'écran : un seul bouton dans la rangée des contrôles (à la
 * place de « Inviter un ami » dès que l'ami est là — rien de plus à loger sur
 * un téléphone en portrait), une fenêtre sans voile, une rangée de pseudos.
 *
 * - Hors du vocal, le bouton **rejoint** : c'est ce clic, et lui seul, qui
 *   fait demander le micro au navigateur. Dans le vocal, il ouvre la fenêtre :
 *   micro coupé / ouvert, quitter, volume des autres, et chaque joueur.
 * - La fenêtre n'est pas modale (rien n'arrête l'horloge : la partie tourne
 *   pour l'autre) ; Échap la ferme.
 * - Les pseudos de la rangée s'allument quand leur propriétaire parle, la
 *   fenêtre fermée comme ouverte.
 * - Micro coupé / ouvert : aussi au clavier (V) et à la manette (L3),
 *   `toggleMic()`.
 *
 * Elle ne parle pas au réseau : elle lit un `VoiceChat` (`net/voice.ts`) qu'on
 * lui branche (`bind`) pour la durée d'une session à deux.
 */

import { onLocale, t } from '../i18n/locale.ts';
import type { VoiceChat, VoiceProblem, VoiceView } from '../net/voice.ts';
import { uiIcon } from './icons.ts';
import { setTip } from './tooltip.ts';

type ToastTone = 'info' | 'good' | 'bad';

/** Ce que le bouton de la pause doit montrer. */
export type VoiceMenuState = 'hidden' | 'off' | 'on';

export class VoicePanel {
  /** Le bouton du HUD. */
  public readonly button: HTMLButtonElement;
  public readonly root: HTMLElement;
  /** Les pseudos du vocal, sous la barre, qui s'allument. */
  public readonly strip: HTMLElement;

  private readonly notify: (message: string, tone: ToastTone) => void;
  private readonly onMenuState: (state: VoiceMenuState) => void;
  private readonly closeButton: HTMLButtonElement;
  private readonly title: HTMLHeadingElement;
  private readonly status: HTMLParagraphElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly leaveButton: HTMLButtonElement;
  private readonly volumeName: HTMLSpanElement;
  private readonly volumePercent: HTMLSpanElement;
  private readonly volume: HTMLInputElement;
  private readonly list: HTMLUListElement;
  private readonly note: HTMLParagraphElement;
  private chat: VoiceChat | null = null;
  private unsubscribe: (() => void)[] = [];
  private partner = false;
  private last: VoiceView | null = null;
  private joined = false;

  /** `onMenuState` : le bouton de la pause suit (caché, « Rejoindre », « Quitter »). */
  public constructor(notify: (message: string, tone: ToastTone) => void, onMenuState: (state: VoiceMenuState) => void) {
    this.notify = notify;
    this.onMenuState = onMenuState;

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'hud-button hud-voice';
    this.button.hidden = true;
    this.button.addEventListener('click', () => this.press());

    this.strip = document.createElement('ul');
    this.strip.className = 'voice-strip';
    this.strip.hidden = true;

    this.root = document.createElement('div');
    this.root.className = 'voice-panel panel';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-labelledby', 'voice-title');

    const head = document.createElement('div');

    head.className = 'voice-head';
    this.title = document.createElement('h2');
    this.title.className = 'voice-title';
    this.title.id = 'voice-title';
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'building-panel-close';
    this.closeButton.append(uiIcon('close'));
    this.closeButton.addEventListener('click', () => this.close());
    head.append(this.title, this.closeButton);

    this.status = document.createElement('p');
    this.status.className = 'voice-status';

    const actions = document.createElement('div');

    actions.className = 'voice-actions';
    this.muteButton = document.createElement('button');
    this.muteButton.type = 'button';
    this.muteButton.className = 'button-secondary voice-mute';
    this.muteButton.addEventListener('click', () => this.toggleMic());
    this.leaveButton = document.createElement('button');
    this.leaveButton.type = 'button';
    this.leaveButton.className = 'button-secondary voice-leave';
    this.leaveButton.addEventListener('click', () => this.leave());
    actions.append(this.muteButton, this.leaveButton);

    const slider = document.createElement('label');

    slider.className = 'settings-volume voice-volume';
    this.volumeName = document.createElement('span');
    this.volumeName.className = 'settings-volume-name';
    this.volumePercent = document.createElement('span');
    this.volumePercent.className = 'settings-volume-percent';
    this.volume = document.createElement('input');
    this.volume.type = 'range';
    this.volume.min = '0';
    this.volume.max = '100';
    this.volume.step = '5';
    this.volume.addEventListener('input', () => {
      this.showVolume();
      this.chat?.setVolume(Number(this.volume.value) / 100);
    });
    slider.append(this.volumeName, this.volumePercent, this.volume);

    this.list = document.createElement('ul');
    this.list.className = 'voice-list';

    this.note = document.createElement('p');
    this.note.className = 'voice-note';

    this.root.append(head, this.status, actions, slider, this.list, this.note);
    onLocale(() => {
      this.title.textContent = t().voice.title;
      this.volumeName.textContent = t().voice.volume;
      this.note.textContent = t().voice.note;
      this.closeButton.setAttribute('aria-label', t().common.close);
      this.leaveButton.replaceChildren(uiIcon('close', 22), t().voice.leave);
      if (this.last) this.render(this.last);
      else this.renderButton(null);
    });
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  /** Le vocal est-il disponible (une session à deux, son ami là) ? */
  public get available(): boolean {
    return this.chat !== null && (this.partner || (this.last?.status ?? 'off') !== 'off');
  }

  /** Branche (ou débranche, `null`) le vocal d'une session à deux. */
  public bind(chat: VoiceChat | null): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.close();
    this.chat = chat;
    this.last = null;
    this.joined = false;
    if (chat) {
      this.unsubscribe = [chat.subscribe((view) => this.render(view)), chat.onProblem((problem) => this.problem(problem))];
      this.render(chat.view);
    } else {
      this.render(null);
    }
  }

  /** L'ami est dans la partie : le bouton « Inviter » cède sa place à celui du vocal. */
  public setPartner(present: boolean): void {
    if (this.partner === present) return;
    this.partner = present;
    this.render(this.last);
  }

  /** Le bouton du HUD : rejoindre, ou ouvrir la fenêtre. */
  public press(): void {
    if (!this.chat) return;
    if (this.chat.view.status === 'off') void this.chat.join();
    else this.toggle();
  }

  /** La pause, elle : rejoindre ou quitter. */
  public toggleMembership(): void {
    if (!this.chat) return;
    if (this.chat.view.status === 'off') void this.chat.join();
    else this.leave();
  }

  /** Couper ou rouvrir le micro (V, L3) ; sans effet hors du vocal. */
  public toggleMic(): void {
    if (this.chat?.view.status !== 'on') return;
    this.chat.toggleMuted();
    this.notify(this.chat.view.muted ? t().voice.toast.muted : t().voice.toast.unmuted, 'info');
  }

  public toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  public show(): void {
    if (!this.chat || this.chat.view.status === 'off') return;
    this.root.hidden = false;
    this.muteButton.focus({ preventScroll: true });
  }

  public close(): void {
    this.root.hidden = true;
  }

  private leave(): void {
    this.chat?.leave();
    this.close();
  }

  private problem(problem: VoiceProblem): void {
    const toast = t().voice.toast;

    this.notify(
      problem.kind === 'peer'
        ? toast.peer(problem.nickname)
        : problem.kind === 'denied'
          ? toast.denied
          : problem.kind === 'noMic'
            ? toast.noMic
            : problem.kind === 'micFailed'
              ? toast.micFailed
              : toast.unsupported,
      'bad',
    );
  }

  private render(view: VoiceView | null): void {
    const was = this.last?.status ?? 'off';

    this.last = view;
    if (view && view.status === 'on' && !this.joined) {
      this.joined = true;
      this.notify(t().voice.toast.joined, 'good');
    } else if (view && view.status === 'off' && was === 'on') {
      this.joined = false;
      this.notify(t().voice.toast.left, 'info');
    }

    const available = this.available;

    this.button.hidden = !available;
    this.renderButton(view);
    this.strip.hidden = !(view && view.status === 'on');
    if (!view || view.status === 'off') this.close();
    this.onMenuState(!available ? 'hidden' : view && view.status !== 'off' ? 'on' : 'off');
    if (!view || view.status !== 'on') {
      this.strip.replaceChildren();
      return;
    }

    const names = t().voice;

    this.status.textContent = view.muted ? names.micOff : names.micOn;
    this.status.dataset['muted'] = String(view.muted);
    this.muteButton.replaceChildren(uiIcon(view.muted ? 'micOff' : 'mic', 22), view.muted ? names.unmute : names.mute);
    this.muteButton.setAttribute('aria-pressed', String(view.muted));
    if (Number(this.volume.value) !== Math.round(view.volume * 100)) this.volume.value = String(Math.round(view.volume * 100));
    this.showVolume();

    const members = [
      { key: 'me', name: names.you, muted: view.muted, speaking: view.speaking, state: 'connected' as const },
      ...view.peers.map((peer) => ({ key: String(peer.id), name: peer.nickname, muted: peer.muted, speaking: peer.speaking, state: peer.state })),
    ];

    this.list.replaceChildren(
      ...members.map((member) => {
        const row = document.createElement('li');
        const name = document.createElement('span');
        const detail = document.createElement('span');

        row.className = 'voice-member';
        row.dataset['speaking'] = String(member.speaking);
        row.dataset['state'] = member.state;
        name.className = 'voice-member-name';
        name.textContent = member.name;
        detail.className = 'voice-member-state';
        detail.textContent = member.muted
          ? names.peer.muted
          : member.state === 'connected'
            ? member.speaking
              ? names.peer.speaking
              : ''
            : names.peer[member.state];
        row.append(name, detail);

        return row;
      }),
    );
    if (view.peers.length === 0) {
      const empty = document.createElement('li');

      empty.className = 'voice-member voice-empty';
      empty.textContent = names.empty;
      this.list.append(empty);
    }
    this.strip.replaceChildren(
      ...members.map((member) => {
        const chip = document.createElement('li');

        chip.className = 'voice-chip';
        chip.dataset['speaking'] = String(member.speaking);
        chip.dataset['muted'] = String(member.muted);
        chip.dataset['state'] = member.state;
        chip.textContent = member.name;

        return chip;
      }),
    );
  }

  private renderButton(view: VoiceView | null): void {
    const status = view?.status ?? 'off';
    const names = t().voice.button;
    const label = status === 'off' ? names.off : view?.muted ? names.muted : names.on;

    this.button.dataset['voice'] = status === 'off' ? 'off' : view?.muted ? 'muted' : 'on';
    this.button.dataset['speaking'] = String(view?.peers.some((peer) => peer.speaking) ?? false);
    this.button.dataset['busy'] = String(status === 'joining');
    this.button.setAttribute('aria-haspopup', status === 'off' ? 'false' : 'dialog');
    this.button.replaceChildren(uiIcon(status !== 'off' && view?.muted ? 'micOff' : 'mic'));
    setTip(this.button, label);
  }

  private showVolume(): void {
    this.volumePercent.textContent = `${this.volume.value} %`;
    this.volume.setAttribute('aria-valuetext', `${this.volume.value} %`);
  }
}
