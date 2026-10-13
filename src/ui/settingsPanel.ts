/**
 * Le menu des réglages, derrière le bouton engrenage du HUD : la langue, les
 * sons, la musique et un volume pour chacun des deux, les pancartes des
 * bâtiments, le compteur de performances, la manette (son aide, sa vibration, sa zone morte). Rien qui touche à la partie — ce sont des préférences de
 * l'appareil, gardées hors de la sauvegarde.
 *
 * Ouvert, il arrête l'horloge (`main.ts` lit `open`) ; il se ferme par sa
 * croix, par un tap sur le voile autour, ou par Échap (`escape.ts`).
 *
 * Il ne décide de rien : il dit à `main.ts` la langue choisie, un volume
 * qui bouge, ou qu'il faut basculer le son, la musique ou les pancartes, et
 * `main.ts` lui renvoie l'état réel.
 */

import { LOCALES, messagesOf, onLocale, t, type Locale } from '../i18n/locale.ts';
import { NOTIFICATION_KINDS, type NotificationKind } from '../data/notifications.ts';
import { GAMEPAD } from '../input/gamepad.ts';
import { uiIcon } from './icons.ts';
import type { NotifyPermission } from './notifier.ts';

export interface SettingsActions {
  setLocale(locale: Locale): void;
  toggleSound(): void;
  toggleMusic(): void;
  toggleSigns(): void;
  /** Le compteur de FPS et de ticks, au bas du HUD. */
  togglePerf(): void;
  toggleHaptics(): void;
  toggleNotification(kind: NotificationKind): void;
  cycleNotificationLimit(): void;
  /** « Autoriser les notifications » : l'écran d'explication, puis la demande du navigateur. */
  askNotifications(): void;
  /** « Contrôles manette » : l'aide, par-dessus les réglages. */
  showPadHelp(): void;
  togglePadRumble(): void;
  /** La zone morte des sticks a bougé, en part de leur course. */
  setDeadZone(zone: number): void;
  /** Un curseur de volume a bougé : de 0 à 1, à chaque cran pendant qu'on le glisse. */
  setSfxVolume(volume: number): void;
  setMusicVolume(volume: number): void;
  /** Ouvert ou fermé : l'horloge s'arrête, le son de fenêtre joue. */
  onToggle(open: boolean): void;
}

/** Ce que la section Notifications montre : `main.ts` la lui redonne à chaque changement. */
export interface NotificationState {
  permission: NotifyPermission;
  kinds: Record<NotificationKind, boolean>;
  limit: number;
}

export class SettingsPanel {
  public readonly root: HTMLElement;

  private readonly panel: HTMLElement;
  private readonly head: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly languages = new Map<Locale, HTMLButtonElement>();
  private readonly soundButton: HTMLButtonElement;
  private readonly musicButton: HTMLButtonElement;
  private readonly signsButton: HTMLButtonElement;
  private readonly hapticsButton: HTMLButtonElement;
  private readonly perfButton: HTMLButtonElement;
  private readonly padLabel: HTMLHeadingElement;
  private readonly padHelpButton: HTMLButtonElement;
  private readonly padRumbleButton: HTMLButtonElement;
  private readonly deadZone: VolumeSlider;
  private padRumble = true;
  private readonly notifyLabel: HTMLHeadingElement;
  private readonly notifyKinds = new Map<NotificationKind, HTMLButtonElement>();
  private readonly notifyLimit: HTMLButtonElement;
  private readonly notifyAllow: HTMLButtonElement;
  private readonly notifyDenied: HTMLParagraphElement;
  private notifications: NotificationState | null = null;
  private readonly sfxVolume: VolumeSlider;
  private readonly musicVolume: VolumeSlider;
  private readonly actions: SettingsActions;
  private sound = true;
  private music = true;
  private signs = true;
  private haptics = true;
  private perf = false;

  public constructor(actions: SettingsActions) {
    this.actions = actions;
    this.root = document.createElement('div');
    this.root.className = 'overlay settings-screen';
    this.root.hidden = true;
    // Un tap sur le voile, hors du panneau, ferme le menu.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });

    this.panel = document.createElement('div');
    this.panel.className = 'panel overlay-panel settings-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');

    const head = document.createElement('div');
    const title = document.createElement('h2');

    this.head = head;
    head.className = 'settings-head';
    title.className = 'overlay-title';
    title.id = 'settings-title';
    this.panel.setAttribute('aria-labelledby', title.id);

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'building-panel-close';
    this.closeButton.append(uiIcon('close'));
    this.closeButton.addEventListener('click', () => this.close());
    head.append(title, this.closeButton);

    const languageLabel = document.createElement('h3');
    const languages = document.createElement('div');

    languageLabel.className = 'settings-label';
    languages.className = 'settings-languages';
    languages.setAttribute('role', 'radiogroup');
    for (const locale of LOCALES) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'button-secondary settings-language';
      button.setAttribute('role', 'radio');
      button.lang = locale;
      // Chaque langue se nomme dans la sienne : on retrouve la sienne même sans lire l'autre.
      button.textContent = messagesOf(locale).settings.languageName;
      button.addEventListener('click', () => actions.setLocale(locale));
      this.languages.set(locale, button);
      languages.append(button);
    }

    this.soundButton = document.createElement('button');
    this.soundButton.type = 'button';
    this.soundButton.className = 'button-secondary settings-toggle';
    this.soundButton.addEventListener('click', () => actions.toggleSound());

    this.musicButton = document.createElement('button');
    this.musicButton.type = 'button';
    this.musicButton.className = 'button-secondary settings-toggle';
    this.musicButton.addEventListener('click', () => actions.toggleMusic());

    this.signsButton = document.createElement('button');
    this.signsButton.type = 'button';
    this.signsButton.className = 'button-secondary settings-toggle';
    this.signsButton.addEventListener('click', () => actions.toggleSigns());

    this.hapticsButton = document.createElement('button');
    this.hapticsButton.type = 'button';
    this.hapticsButton.className = 'button-secondary settings-toggle';
    this.hapticsButton.addEventListener('click', () => actions.toggleHaptics());

    this.perfButton = document.createElement('button');
    this.perfButton.type = 'button';
    this.perfButton.className = 'button-secondary settings-toggle';
    this.perfButton.addEventListener('click', () => actions.togglePerf());

    // La manette : son aide, sa vibration, la zone morte de ses sticks.
    this.padLabel = document.createElement('h3');
    this.padLabel.className = 'settings-label';
    this.padHelpButton = document.createElement('button');
    this.padHelpButton.type = 'button';
    this.padHelpButton.className = 'button-secondary settings-toggle';
    this.padHelpButton.addEventListener('click', () => actions.showPadHelp());
    this.padRumbleButton = document.createElement('button');
    this.padRumbleButton.type = 'button';
    this.padRumbleButton.className = 'button-secondary settings-toggle';
    this.padRumbleButton.addEventListener('click', () => actions.togglePadRumble());

    const { min, max, step } = GAMEPAD.deadZoneRange;

    this.deadZone = new VolumeSlider((zone) => actions.setDeadZone(zone), { min: min * 100, max: max * 100, step: step * 100 });

    this.notifyLabel = document.createElement('h3');
    this.notifyLabel.className = 'settings-label';
    this.notifyAllow = document.createElement('button');
    this.notifyAllow.type = 'button';
    this.notifyAllow.className = 'button-secondary settings-toggle';
    this.notifyAllow.addEventListener('click', () => actions.askNotifications());
    this.notifyDenied = document.createElement('p');
    this.notifyDenied.className = 'settings-note';
    this.notifyLimit = document.createElement('button');
    this.notifyLimit.type = 'button';
    this.notifyLimit.className = 'button-secondary settings-toggle';
    this.notifyLimit.addEventListener('click', () => actions.cycleNotificationLimit());

    const notifyKinds: HTMLButtonElement[] = [];

    for (const kind of NOTIFICATION_KINDS) {
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'button-secondary settings-toggle';
      button.addEventListener('click', () => actions.toggleNotification(kind));
      this.notifyKinds.set(kind, button);
      notifyKinds.push(button);
    }

    this.sfxVolume = new VolumeSlider((volume) => actions.setSfxVolume(volume));
    this.musicVolume = new VolumeSlider((volume) => actions.setMusicVolume(volume));

    this.panel.append(
      head,
      languageLabel,
      languages,
      this.soundButton,
      this.sfxVolume.root,
      this.musicButton,
      this.musicVolume.root,
      this.signsButton,
      this.hapticsButton,
      this.perfButton,
      this.padLabel,
      this.padHelpButton,
      this.padRumbleButton,
      this.deadZone.root,
      this.notifyLabel,
      this.notifyAllow,
      this.notifyDenied,
      ...notifyKinds,
      this.notifyLimit,
    );
    this.root.append(this.panel);

    onLocale((current) => {
      const text = t().settings;

      title.textContent = text.title;
      languageLabel.textContent = text.language;
      this.closeButton.setAttribute('aria-label', t().common.close);
      for (const [locale, button] of this.languages) button.setAttribute('aria-checked', String(locale === current));
      this.setSound(this.sound);
      this.setMusic(this.music);
      this.setSigns(this.signs);
      this.setHaptics(this.haptics);
      this.setPerf(this.perf);
      this.padLabel.textContent = t().gamepad.heading;
      this.padHelpButton.replaceChildren(uiIcon('hint', 22), t().gamepad.helpTitle);
      this.setPadRumble(this.padRumble);
      this.deadZone.setName(t().gamepad.deadZone);
      this.renderNotifications();
      this.sfxVolume.setName(text.sfxVolume);
      this.musicVolume.setName(text.musicVolume);
    });
  }

  /** Le bouton « Compte » (`AccountPanel.button`), juste sous le titre. */
  public addAccountButton(button: HTMLButtonElement): void {
    this.head.after(button);
  }

  public get open(): boolean {
    return !this.root.hidden;
  }

  public show(): void {
    if (this.open) return;
    this.root.hidden = false;
    this.actions.onToggle(true);
    this.closeButton.focus();
  }

  public close(): void {
    if (!this.open) return;
    this.root.hidden = true;
    this.actions.onToggle(false);
  }

  public toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  /** Le libellé et l'icône suivent le réglage du moteur audio. */
  public setSound(on: boolean): void {
    this.sound = on;
    toggleLabel(this.soundButton, on, uiIcon(on ? 'soundOn' : 'soundOff', 22), t().settings.sound);
  }

  public setMusic(on: boolean): void {
    this.music = on;
    toggleLabel(this.musicButton, on, uiIcon(on ? 'musicOn' : 'musicOff', 22), t().settings.music);
    this.musicVolume.setEnabled(on);
  }

  /** Les curseurs suivent les volumes du moteur audio, de 0 à 1. */
  public setVolumes(sfx: number, music: number): void {
    this.sfxVolume.setValue(sfx);
    this.musicVolume.setValue(music);
  }

  public setSigns(on: boolean): void {
    this.signs = on;
    toggleLabel(this.signsButton, on, uiIcon(on ? 'signOn' : 'signOff', 22), t().settings.signs);
  }

  public setHaptics(on: boolean): void {
    this.haptics = on;
    toggleLabel(this.hapticsButton, on, uiIcon(on ? 'vibrateOn' : 'vibrateOff', 22), t().settings.haptics);
  }

  public setPerf(on: boolean): void {
    this.perf = on;
    toggleLabel(this.perfButton, on, uiIcon('hint', 22), t().settings.perf);
  }

  /** La vibration de la manette et la zone morte de ses sticks (en part de leur course). */
  public setGamepad(rumble: boolean, deadZone: number): void {
    this.setPadRumble(rumble);
    this.deadZone.setValue(deadZone);
  }

  private setPadRumble(on: boolean): void {
    this.padRumble = on;
    toggleLabel(this.padRumbleButton, on, uiIcon(on ? 'vibrateOn' : 'vibrateOff', 22), t().gamepad.rumble);
  }

  /** La section Notifications ; cachée tant que le navigateur n'en sait pas. */
  public setNotifications(state: NotificationState | null): void {
    this.notifications = state;
    this.renderNotifications();
  }

  private renderNotifications(): void {
    const state = this.notifications;
    const text = t().notifications;
    const supported = state !== null && state.permission !== 'unsupported';
    const granted = state?.permission === 'granted';

    this.notifyLabel.hidden = !supported;
    this.notifyLabel.textContent = text.heading;
    this.notifyAllow.hidden = state?.permission !== 'default';
    this.notifyAllow.replaceChildren(uiIcon('hint', 22), text.allow);
    this.notifyDenied.hidden = state?.permission !== 'denied';
    this.notifyDenied.textContent = text.denied;
    for (const [kind, button] of this.notifyKinds) {
      button.hidden = !granted;
      if (state) toggleLabel(button, state.kinds[kind], uiIcon('hint', 22), text.kinds[kind]);
    }
    this.notifyLimit.hidden = !granted;
    if (state) this.notifyLimit.replaceChildren(uiIcon('hint', 22), text.perDay(state.limit));
  }

  /** Un navigateur sans `navigator.vibrate` n'a que faire de l'interrupteur. */
  public hideHaptics(): void {
    this.hapticsButton.hidden = true;
  }
}

/** Un curseur de volume, son nom au-dessus et son pourcentage à droite. */
class VolumeSlider {
  public readonly root: HTMLLabelElement;

  private readonly name: HTMLSpanElement;
  private readonly percent: HTMLSpanElement;
  private readonly input: HTMLInputElement;

  /** `range` : bornes et pas du curseur, en pour cent (un volume va de 0 à 100). */
  public constructor(onChange: (volume: number) => void, range = { min: 0, max: 100, step: 5 }) {
    this.root = document.createElement('label');
    this.root.className = 'settings-volume';
    this.name = document.createElement('span');
    this.name.className = 'settings-volume-name';
    this.percent = document.createElement('span');
    this.percent.className = 'settings-volume-percent';
    this.input = document.createElement('input');
    this.input.type = 'range';
    this.input.min = String(range.min);
    this.input.max = String(range.max);
    this.input.step = String(range.step);
    this.input.addEventListener('input', () => {
      this.showPercent();
      onChange(Number(this.input.value) / 100);
    });
    this.root.append(this.name, this.percent, this.input);
  }

  public setName(name: string): void {
    this.name.textContent = name;
  }

  public setValue(volume: number): void {
    this.input.value = String(Math.round(volume * 100));
    this.showPercent();
  }

  /** Musique coupée : son curseur s'estompe, mais reste réglable. */
  public setEnabled(on: boolean): void {
    this.root.classList.toggle('settings-volume-off', !on);
  }

  private showPercent(): void {
    this.percent.textContent = `${this.input.value} %`;
    this.input.setAttribute('aria-valuetext', `${this.input.value} %`);
  }
}

/** « Musique : oui » : l'icône, le nom du réglage, son état ; `aria-pressed` pour les lecteurs d'écran. */
function toggleLabel(button: HTMLButtonElement, on: boolean, icon: HTMLElement, name: string): void {
  button.replaceChildren(icon, t().settings.toggle(name, on));
  button.setAttribute('aria-pressed', String(on));
}
