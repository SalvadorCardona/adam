/**
 * L'horloge : le cadran (`World.dayDial`) et « J2 » d'un coup d'œil, le
 * détail en toutes lettres au tap et pour les lecteurs d'écran. Cachée tant
 * que la mairie est en chantier — le cycle n'a pas commencé.
 */

import { dayDialSvg } from '../../art/ui.ts';
import { DIAL_ARCS } from '../../sim/dayNight.ts';
import { TICKS_PER_SECOND } from '../../sim/world.ts';
import { onLocale, t } from '../../i18n/locale.ts';
import { Disposer } from '../disposer.ts';
import { dayDialUrl } from '../icons.ts';
import { setTip } from '../tooltip.ts';
import type { HudContext } from './context.ts';
import { clock, element, text } from './dom.ts';

/** Le détail de l'horloge (« Jour 2 · nuit dans 1:31 ») reste affiché ce temps-là après un tap. */
const CLOCK_TIP_TICKS = 4 * TICKS_PER_SECOND;

/** Le cadran de l'horloge à l'écran, en pixels CSS : il déborde à peine de la ligne de 24 px. */
const CLOCK_SIZE = 28;

/** Crans de l'aiguille sur un tour : le cadran ne se redessine qu'en changeant de cran. */
const DIAL_STEPS = 240;

export class DayClock {
  public readonly root: HTMLButtonElement;

  private readonly dial: HTMLImageElement;
  private readonly day: HTMLElement;
  private readonly tip: HTMLElement;
  private last = '';
  private tipUntil = 0;

  private readonly ctx: HudContext;
  private readonly disposer = new Disposer();

  /** `refresh` : ce que le tap remet à jour — l'horloge et les capsules qui la suivent. */
  public constructor(ctx: HudContext, refresh: () => void) {
    this.ctx = ctx;
    // L'horloge : un tap dit l'heure en toutes lettres, sans déplier la quête.
    this.root = element('button', 'hud-clock');
    this.root.type = 'button';
    this.root.hidden = true;
    this.dial = element('img', 'hud-clock-dial');
    this.dial.width = this.dial.height = CLOCK_SIZE;
    this.dial.alt = '';
    this.dial.draggable = false;
    this.day = text('hud-clock-day', '');
    this.tip = text('hud-clock-tip', '');
    this.tip.setAttribute('aria-hidden', 'true');
    this.root.append(this.dial, this.day, this.tip);
    this.root.addEventListener('click', () => {
      this.tipUntil = this.ctx.world.tickCount < this.tipUntil ? 0 : this.ctx.world.tickCount + CLOCK_TIP_TICKS;
      refresh();
    });
    this.disposer.add(onLocale(() => {
      this.last = '';
    }));
  }

  public update(): void {
    const { world } = this.ctx;
    const dial = world.dayDial();
    const dayClock = this.root;

    if (dayClock.hidden !== !dial) dayClock.hidden = !dial;
    if (!dial) return;

    const left = clock(Math.ceil(dial.left / TICKS_PER_SECOND));
    const detail = dial.night ? t().hud.clock.night(dial.day, left) : t().hud.clock.day(dial.day, left);
    const tip = world.tickCount < this.tipUntil;
    const step = Math.round(dial.progress * DIAL_STEPS) % DIAL_STEPS;
    const key = `${step}:${dial.night}:${dial.warning}:${detail}:${tip}`;

    if (key === this.last) return;

    const [lastStep, lastNight, lastWarning] = this.last.split(':');

    this.last = key;
    if (String(step) !== lastStep || String(dial.night) !== lastNight || String(dial.warning) !== lastWarning) {
      this.dial.src = dayDialUrl(dayDialSvg(DIAL_ARCS, step / DIAL_STEPS, dial.night, dial.warning));
    }
    this.day.textContent = t().hud.clock.short(dial.day);
    this.tip.textContent = detail;
    dayClock.dataset['phase'] = dial.phase;
    dayClock.dataset['warning'] = String(dial.warning);
    dayClock.dataset['tip'] = String(tip);
    setTip(dayClock, detail);
  }

  public dispose(): void {
    this.disposer.dispose();
  }
}
