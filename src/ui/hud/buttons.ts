/**
 * Pause, Réglages et « Inviter un ami » : les disques de la rangée des
 * contrôles, en haut à droite. `main.ts` les pose et y branche ses fenêtres.
 */

import { onLocale, t } from '../../i18n/locale.ts';
import { Disposer } from '../disposer.ts';
import { uiIcon } from '../icons.ts';
import { setTip } from '../tooltip.ts';
import { element } from './dom.ts';

export class ControlButtons {
  public readonly pause: HTMLButtonElement;
  /** L'engrenage : il ouvre le menu des réglages (`settingsPanel.ts`). */
  public readonly settings: HTMLButtonElement;
  /** « Inviter un ami », à portée de doigt sans passer par la pause (`main.ts` le pose s'il y a un serveur). */
  public readonly invite: HTMLButtonElement;

  private readonly disposer = new Disposer();

  public constructor() {
    // Pause et Réglages : les deux premiers disques de la rangée des contrôles, en haut à droite (`main.ts`).
    this.pause = element('button', 'hud-button hud-pause');
    this.pause.type = 'button';
    this.pause.append(uiIcon('pause'));

    this.settings = element('button', 'hud-button hud-settings');
    this.settings.type = 'button';
    this.settings.setAttribute('aria-haspopup', 'dialog');
    this.settings.append(uiIcon('settings'));
    this.disposer.add(onLocale(() => setTip(this.settings, t().settings.title)));

    this.invite = element('button', 'hud-button hud-invite');
    this.invite.type = 'button';
    this.invite.setAttribute('aria-haspopup', 'dialog');
    this.invite.append(uiIcon('invite'));
    this.disposer.add(onLocale(() => setTip(this.invite, t().party.invite)));
    this.disposer.add(onLocale(() => setTip(this.pause, t().hud.pause)));
  }

  public dispose(): void {
    this.disposer.dispose();
  }
}
