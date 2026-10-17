/**
 * Les gestes de la nuit : la Volée d'Adam (bouton du groupe `.hud-actions`,
 * recharge en anneau), la capsule du combo de nuit, et « Passer la nuit »,
 * qui hâte l'aube par nuit calme (`HASTEN`).
 */

import { COMBO } from '../../data/skills.ts';
import { TICKS_PER_SECOND } from '../../sim/world.ts';
import { locale, t } from '../../i18n/locale.ts';
import { uiIcon } from '../icons.ts';
import { setTip } from '../tooltip.ts';
import type { HudContext } from './context.ts';
import { clock, element, text } from './dom.ts';

export class NightControls {
  /** « Passer la nuit » : visible par nuit calme, il hâte l'aube (`HASTEN`). */
  public readonly hastenButton: HTMLButtonElement;
  /** La Volée d'Adam : un bouton du groupe `.hud-actions` (`main.ts`), recharge en anneau ; visible du crépuscule à l'aube. */
  public readonly skillButton: HTMLButtonElement;
  /** Le combo de nuit, à côté de la capsule de vague. */
  public readonly comboChip: HTMLElement;
  /** Le joueur a demandé de hâter l'aube ; `main.ts` le lit à chaque image. */
  public hastening = false;

  private hastenKey = '';
  private skillKey = '';
  private comboKey = '';

  private readonly ctx: HudContext;

  public constructor(ctx: HudContext) {
    this.ctx = ctx;
    this.hastenButton = element('button', 'panel hud-wave hud-hasten');
    this.hastenButton.type = 'button';
    this.hastenButton.hidden = true;
    this.hastenButton.addEventListener('click', () => {
      this.hastening = !this.hastening;
      this.updateHasten();
    });
    this.skillButton = element('button', 'hud-skill');
    this.skillButton.type = 'button';
    this.skillButton.hidden = true;
    this.skillButton.setAttribute('aria-keyshortcuts', 'Space');
    this.skillButton.addEventListener('click', () => this.ctx.world.push({ type: 'castSkill', dx: 0, dy: 0 }));
    this.comboChip = element('div', 'panel hud-wave hud-combo');
    this.comboChip.hidden = true;
    this.comboChip.setAttribute('role', 'status');
  }

  /**
   * « Passer la nuit » : le bouton n'existe que par nuit calme ; actif, il dit
   * le temps jusqu'à l'aube. Un mutant qui reparaît, l'aube, la défaite : le
   * bouton disparaît et le temps reprend son pas.
   */
  public updateHasten(): void {
    const { world } = this.ctx;
    const calm = world.calmNight();

    if (!calm) this.hastening = false;
    if (this.hastenButton.hidden !== !calm) this.hastenButton.hidden = !calm;
    if (!calm) return;

    const dial = world.dayDial();
    const words = t().hud.hasten;
    const label = this.hastening && dial ? words.active(clock(Math.ceil(dial.left / TICKS_PER_SECOND))) : words.idle;
    const key = `${locale()}|${label}`;

    if (key === this.hastenKey) return;
    this.hastenKey = key;
    this.hastenButton.dataset['active'] = String(this.hastening);
    this.hastenButton.setAttribute('aria-pressed', String(this.hastening));
    this.hastenButton.replaceChildren(uiIcon('hasten', 18), text('hud-wave-text', label));
    setTip(this.hastenButton, label);
  }

  /**
   * La Volée : visible du crépuscule à l'aube (ou tant qu'un mutant rôde), un
   * anneau de recharge qui se vide ; le combo de nuit dans sa capsule. Le DOM
   * n'est refait que si la clé change.
   */
  public updateSkill(): void {
    const { world } = this.ctx;
    const on = world.skillOn();
    const skill = world.skill();

    if (this.skillButton.hidden !== !on) this.skillButton.hidden = !on;
    if (on) {
      const seconds = Math.ceil(skill.left / TICKS_PER_SECOND);
      const key = `${seconds}|${skill.ready}|${locale()}`;

      this.skillButton.style.setProperty('--charge', `${Math.round((1 - skill.left / skill.total) * 100)}%`);
      if (key !== this.skillKey) {
        this.skillKey = key;
        this.skillButton.dataset['ready'] = String(skill.ready);
        this.skillButton.replaceChildren(uiIcon('volley', 28), ...(skill.ready ? [] : [text('hud-skill-left', String(seconds))]));
        const label = skill.ready ? t().hud.skill.ready(t().menu.keys.space) : t().hud.skill.cooling(seconds);

        setTip(this.skillButton, label);
        this.skillButton.setAttribute('aria-label', label);
      }
    }

    const combo = world.combo();

    if (this.comboChip.hidden !== !combo) this.comboChip.hidden = !combo;
    if (!combo) return;

    const multiplier = String(combo.multiplier);
    const key = `${combo.count}|${multiplier}|${locale()}`;

    this.comboChip.style.setProperty('--fill', `${Math.round((combo.ticksLeft / COMBO.windowTicks) * 100)}%`);
    if (key === this.comboKey) return;
    this.comboKey = key;
    this.comboChip.dataset['hot'] = String(combo.multiplier > 1);
    this.comboChip.replaceChildren(uiIcon('volley', 18), text('hud-wave-text', t().hud.skill.combo(combo.count, multiplier)));
    setTip(this.comboChip, t().hud.skill.comboTip);
  }

  /** Rien de branché hors des boutons. */
  public dispose(): void {}
}
