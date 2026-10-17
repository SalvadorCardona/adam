/**
 * Ce que la nuit montre autour de la vague : la capsule « Vague dans 2:30 »
 * (`World.waveForecast`), le compteur abattus/sortis à côté d'elle, le bord
 * de l'écran qui pulse du côté de la base de tête, et la vignette corail de
 * la mairie en danger.
 */

import { NIGHT_STAKES } from '../../data/dayNight.ts';
import { hallDanger } from '../../render/hallDanger.ts';
import { reducedMotion } from '../../render/motion.ts';
import type { Compass } from '../../sim/enemies.ts';
import { TICKS_PER_SECOND } from '../../sim/world.ts';
import { locale, t } from '../../i18n/locale.ts';
import { uiIcon } from '../icons.ts';
import { setTip } from '../tooltip.ts';
import type { HudContext } from './context.ts';
import { clock, element, text } from './dom.ts';

/** Où le bord pulse, en % de l'écran, pour chaque point de la boussole : du côté de la base de tête. */
const EDGE_SPOTS: Readonly<Record<Compass, readonly [number, number]>> = {
  east: [100, 50],
  southEast: [100, 100],
  south: [50, 100],
  southWest: [0, 100],
  west: [0, 50],
  northWest: [0, 0],
  north: [50, 0],
  northEast: [100, 0],
};

export class WaveWatch {
  /** « Vague dans 2:30 » : l'annonce de la prochaine vague (`World.waveForecast`). */
  public readonly soon: HTMLButtonElement;
  /** Les mutants abattus sur les mutants sortis cette nuit, à côté de la capsule de vague. */
  public readonly tally: HTMLElement;
  /** Le bord de l'écran qui pulse en corail du côté de la base de tête, puis la vignette de la mairie en danger. */
  public readonly edge: HTMLElement;
  public readonly vignette: HTMLElement;

  private edgeTimer = 0;
  private sent = 0;
  private downed = 0;
  private lastDanger = -1;
  private lastWave = '';
  private origin: { x: number; y: number } | null = null;

  private readonly ctx: HudContext;

  public constructor(ctx: HudContext) {
    this.ctx = ctx;
    this.soon = element('button', 'panel hud-wave');
    this.soon.type = 'button';
    this.soon.hidden = true;
    this.soon.addEventListener('click', () => {
      if (this.origin) this.ctx.focus(this.origin.x, this.origin.y);
    });
    this.tally = element('div', 'panel hud-wave hud-tally');
    this.tally.hidden = true;
    this.edge = element('div', 'hud-edge');
    this.vignette = element('div', 'hud-vignette');
  }

  /** La capsule de la vague, puis la vignette de la mairie. */
  public update(): void {
    this.updateWave();
    this.updateVignette();
  }

  /** Une vague sort : la première de la nuit remet le compteur à zéro, et le bord pulse de son côté. */
  public started(wave: number, count: number, from: Compass): void {
    if (wave === 1) {
      this.sent = 0;
      this.downed = 0;
    }
    this.sent += count;
    this.updateTally();
    this.pulseEdge(from);
  }

  /** Un mutant abattu ou assommé. */
  public downedOne(): void {
    if (this.sent === 0) return;
    this.downed += 1;
    // Les larves de la Reine ne sont pas annoncées : le compteur ne reste jamais en retard.
    this.sent = Math.max(this.sent, this.downed);
    this.updateTally();
  }

  /** L'aube : le compteur s'en va. */
  public dawn(): void {
    this.sent = 0;
    this.downed = 0;
    this.updateTally();
  }

  /**
   * L'annonce de la vague, à droite de l'horloge : « Vague dans 2:30 » et son
   * effectif, toute la fenêtre `WAVE_WARNING.leadTicks` ; en corail et qui bat
   * sous `urgentTicks`. Le détail — d'où, combien de bases, un chef — au tap
   * long et pour les lecteurs d'écran ; un tap montre la base de tête.
   */
  private updateWave(): void {
    const forecast = this.ctx.world.waveForecast();
    const seconds = forecast ? Math.ceil(forecast.ticks / TICKS_PER_SECOND) : 0;
    const key = forecast ? `${seconds}:${forecast.count}:${forecast.boss}:${forecast.queen}:${forecast.urgent}:${forecast.from}:${locale()}` : '';
    const soon = this.soon;

    this.origin = forecast && { x: forecast.x, y: forecast.y };
    if (key === this.lastWave) return;
    this.lastWave = key;
    soon.hidden = forecast === null;
    if (!forecast) return;

    const words = t().hud.wave;
    const time = clock(seconds);
    const label = words.soon(time, forecast.count, forecast.bases, t().hud.from[forecast.from], forecast.queen ? 'queen' : forecast.boss ? 'boss' : null);

    soon.dataset['urgent'] = String(forecast.urgent);
    soon.setAttribute('aria-label', label);
    setTip(soon, label);
    soon.replaceChildren(
      uiIcon(forecast.boss || forecast.queen ? 'shield' : 'mutant', 18),
      text('hud-wave-text', words.soonShort(time)),
      text('hud-wave-count', `×${forecast.count}`),
    );
  }

  private updateTally(): void {
    this.tally.hidden = this.sent === 0;
    if (this.sent === 0) return;

    const label = t().hud.wave.tally(this.downed, this.sent);

    this.tally.setAttribute('aria-label', label);
    setTip(this.tally, label);
    this.tally.replaceChildren(uiIcon('mutant', 18), text('hud-wave-text', `${this.downed}/${this.sent}`));
  }

  /** Le bord de l'écran pulse en corail du côté d'où la vague arrive, `edgePulseMs`. */
  private pulseEdge(from: Compass): void {
    if (reducedMotion()) return;

    const [x, y] = EDGE_SPOTS[from];

    this.edge.style.setProperty('--edge-x', `${x}%`);
    this.edge.style.setProperty('--edge-y', `${y}%`);
    this.edge.dataset['on'] = 'true';
    window.clearTimeout(this.edgeTimer);
    this.edgeTimer = window.setTimeout(() => {
      this.edge.dataset['on'] = 'false';
    }, NIGHT_STAKES.edgePulseMs);
  }

  /** La mairie sous la moitié de ses PV : la vignette corail bat, d'autant plus vite que les PV baissent. */
  private updateVignette(): void {
    const danger = Math.round(hallDanger(this.ctx.world) * 20) / 20;

    if (danger === this.lastDanger) return;
    this.lastDanger = danger;
    this.vignette.dataset['on'] = String(danger > 0);
    this.vignette.style.setProperty('--hall-danger', String(danger));
    this.vignette.style.setProperty('--beat', `${(NIGHT_STAKES.beatSlowS - (NIGHT_STAKES.beatSlowS - NIGHT_STAKES.beatFastS) * danger).toFixed(2)}s`);
  }

  public dispose(): void {
    window.clearTimeout(this.edgeTimer);
  }
}
