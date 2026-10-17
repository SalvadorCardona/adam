/** La capsule météo : l'annonce et son compte à rebours, puis le temps qu'il reste. */

import { WEATHER, WEATHER_CALENDAR } from '../../data/weather.ts';
import { TICKS_PER_SECOND } from '../../sim/world.ts';
import { onLocale, t } from '../../i18n/locale.ts';
import { Disposer } from '../disposer.ts';
import type { HudContext } from './context.ts';
import { clock, element } from './dom.ts';

export class WeatherChip {
  public readonly root: HTMLElement;

  private last = '';

  private readonly ctx: HudContext;
  private readonly disposer = new Disposer();

  public constructor(ctx: HudContext) {
    this.ctx = ctx;
    this.root = element('div', 'hud-weather');
    this.root.hidden = true;
    this.disposer.add(onLocale(() => {
      this.last = '';
    }));
  }

  public update(): void {
    const { world } = this.ctx;
    const spell = world.weather();
    const next = spell ? null : world.nextWeather();
    const coming = next && next.start - world.tickCount <= WEATHER_CALENDAR.announceTicks ? next : null;
    const shown = spell ?? coming;
    const weather = this.root;
    let label = '';

    if (shown) {
      const seconds = Math.ceil(((spell ? shown.end : shown.start) - world.tickCount) / TICKS_PER_SECOND);
      const name = t().weather[shown.id].label;

      label = spell ? `${name} · ${clock(seconds)}` : t().hud.weather.soon(name, seconds);
    }

    if (label === this.last) return;
    this.last = label;
    weather.hidden = !shown;
    if (!shown) return;

    weather.dataset['soon'] = String(!spell);
    weather.dataset['harsh'] = String(WEATHER[shown.id].harsh);
    weather.textContent = label;
  }

  public dispose(): void {
    this.disposer.dispose();
  }
}
