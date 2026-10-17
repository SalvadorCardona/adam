/**
 * Les capsules de ce qui attend un choix : la faveur de l'aube (les cartes,
 * puis le coup de pouce qui court) et le talent d'un niveau passé.
 */

import { BOONS } from '../../data/boons.ts';
import { TICKS_PER_SECOND } from '../../sim/world.ts';
import { locale, t } from '../../i18n/locale.ts';
import { itemIcon, uiIcon } from '../icons.ts';
import { setTip } from '../tooltip.ts';
import type { HudContext } from './context.ts';
import { clock, element, text } from './dom.ts';

export class Favors {
  /** La faveur de l'aube : la capsule qui l'attend, puis le coup de pouce qui court. */
  public readonly boonButton: HTMLButtonElement;
  public readonly talentButton: HTMLButtonElement;

  private boonKey = '';
  private talentKey = '';

  private readonly ctx: HudContext;
  /** Le niveau d'Adam, en tête du bandeau de la ville : sa pastille dit qu'un talent attend. */
  private readonly level: HTMLElement;

  public constructor(ctx: HudContext, level: HTMLElement, openBoon: () => void, openTalent: () => void) {
    this.ctx = ctx;
    this.level = level;
    this.boonButton = element('button', 'panel hud-wave hud-boon');
    this.boonButton.type = 'button';
    this.boonButton.hidden = true;
    this.boonButton.addEventListener('click', () => {
      if (this.ctx.world.boonOffer()) openBoon();
    });
    this.talentButton = element('button', 'panel hud-wave hud-boon hud-talent');
    this.talentButton.type = 'button';
    this.talentButton.hidden = true;
    this.talentButton.dataset['state'] = 'offer';
    this.talentButton.addEventListener('click', () => openTalent());
  }

  /**
   * La capsule de la faveur : « Faveur de l'aube » qui bat tant qu'une carte
   * attend ; puis l'icône du coup de pouce et le temps qui lui reste. Un colis
   * pris ne laisse rien : il est déjà en ville.
   */
  public updateBoon(): void {
    const offer = this.ctx.world.boonOffer();
    const active = this.ctx.world.activeBoon();
    const visible = offer !== null || active !== null;
    const button = this.boonButton;

    if (button.hidden !== !visible) button.hidden = !visible;
    if (!visible) return;

    const words = t().hud.boon;
    const seconds = active ? Math.ceil(active.left / TICKS_PER_SECOND) : 0;
    const key = offer ? `offer|${locale()}` : `active|${active!.id}|${locale()}|${seconds}`;

    if (key === this.boonKey) return;
    this.boonKey = key;
    button.dataset['state'] = offer ? 'offer' : 'active';
    if (offer) {
      button.replaceChildren(uiIcon('gift', 18), text('hud-wave-text', words.offer));
      setTip(button, words.offer);
      return;
    }

    const { icon } = BOONS[active!.id];
    const label = t().boons[active!.id];

    button.replaceChildren('item' in icon ? itemIcon(icon.item, 18) : uiIcon(icon.ui, 18), text('hud-wave-text', clock(seconds)));
    setTip(button, `${label.label} — ${label.description}`);
  }

  /** La capsule du talent : « Talent à choisir » qui bat tant qu'un niveau attend son talent. */
  public updateTalent(): void {
    const pending = this.ctx.world.talentOffer()?.pending ?? 0;
    const button = this.talentButton;

    if (button.hidden !== (pending === 0)) button.hidden = pending === 0;
    this.level.dataset['pending'] = String(pending > 0);
    if (pending === 0) return;

    const key = `${pending}|${locale()}`;

    if (key === this.talentKey) return;
    this.talentKey = key;

    const label = t().hud.talent.offer;

    button.replaceChildren(uiIcon('trophy', 18), text('hud-wave-text', pending > 1 ? `${label} ×${pending}` : label));
    setTip(button, label);
  }

  /** Rien de branché hors des capsules. */
  public dispose(): void {}
}
