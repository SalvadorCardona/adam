/**
 * L'alerte de nourriture ou d'eau, sous la population : la ville va en
 * manquer — « 3 min » de stock au rythme où il fond, ou plus rien —, en
 * corail. Elle disparaît quand le stock tient ; un tap montre qui a faim (ou
 * soif), puis le suivant.
 */

import type { NeedId } from '../../data/needs.ts';
import type { MobileId } from '../../sim/types.ts';
import { locale, t } from '../../i18n/locale.ts';
import { itemIcon } from '../icons.ts';
import type { HudContext } from './context.ts';
import { element, text } from './dom.ts';

export class HungerAlert {
  public readonly root: HTMLButtonElement;

  private last = '';
  /** Le besoin que dit l'alerte : son tap montre qui en manque. */
  private need: NeedId | undefined = undefined;
  private cursor = 0;

  private readonly ctx: HudContext;
  private readonly showPerson: (id: MobileId) => void;

  public constructor(ctx: HudContext, showPerson: (id: MobileId) => void) {
    this.ctx = ctx;
    this.showPerson = showPerson;
    this.root = element('button', 'panel hud-hunger');
    this.root.type = 'button';
    this.root.hidden = true;
    this.root.addEventListener('click', () => this.focusHungry());
  }

  public update(): void {
    const alert = this.ctx.world.needAlert();
    const key = alert ? `${alert.item}:${alert.minutes}:${alert.wanting}:${locale()}` : '';
    const hunger = this.root;

    if (key === this.last) return;
    this.last = key;
    this.need = alert?.need;
    hunger.hidden = alert === null;
    if (!alert) return;

    const words = t().hud.needAlert;
    const item = t().items[alert.item];
    const who = alert.wanting > 0 ? words.wanting[alert.need](alert.wanting) : '';
    const label = alert.minutes === 0 ? words.out(item, who) : words.soon(item, alert.minutes, who);

    hunger.title = label;
    hunger.setAttribute('aria-label', label);
    hunger.replaceChildren(itemIcon(alert.item, 18), text('hud-hunger-text', alert.minutes === 0 ? words.outShort : words.soonShort(alert.minutes)));
  }

  /** Centre la caméra sur un habitant qui a faim (ou soif) — au tap suivant, sur le suivant — et dit qui il est. */
  private focusHungry(): void {
    const hungry = this.ctx.world.wantingInhabitants(this.need);

    if (hungry.length === 0) return;

    const mobile = hungry[this.cursor % hungry.length]!;

    this.cursor = (this.cursor + 1) % hungry.length;
    this.ctx.focus(mobile.x, mobile.y);
    this.showPerson(mobile.id);
  }

  /** Rien de branché hors de la capsule. */
  public dispose(): void {}
}
