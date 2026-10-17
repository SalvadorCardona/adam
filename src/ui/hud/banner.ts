/**
 * Le bandeau des vagues : « Nuit 4 — 2 mutants arrivent par l'est ! »
 * (« Renforts » pour les vagues suivantes de la nuit) trois secondes avant,
 * avec une flèche tournée vers leur point d'apparition, puis « Nuit 4 —
 * vague repoussée ! » quand le dernier tombe ; un gros mutant s'annonce à
 * part, la Reine a son compte à rebours. Dessous, le chiffre géant du compte
 * à rebours.
 */

import type { BuildingId } from '../../data/buildings.ts';
import type { Compass } from '../../sim/enemies.ts';
import { TICKS_PER_SECOND } from '../../sim/world.ts';
import { t } from '../../i18n/locale.ts';
import { uiIcon } from '../icons.ts';
import type { HudContext } from './context.ts';
import { element } from './dom.ts';

/** Le bandeau d'une vague reste le temps de l'annonce, et s'efface quand les flaques bouillonnent ; celui de la victoire, un peu moins. */
const BANNER_WAVE_MS = 4200;
export const BANNER_CLEARED_MS = 3200;

export class WaveBanner {
  public readonly root: HTMLElement;
  /** Le chiffre géant au centre. */
  public readonly countdown: HTMLElement;

  private readonly arrow: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  /** Le point monde que la flèche du bandeau montre ; `null` sans flèche. */
  private target: { x: number; y: number } | null = null;
  private timer = 0;
  /** La vague déjà annoncée (nuit et rang) : le bandeau ne repart pas à chaque seconde du compte à rebours. */
  private announced = '';

  private readonly ctx: HudContext;

  public constructor(ctx: HudContext) {
    this.ctx = ctx;
    this.countdown = element('div', 'hud-countdown');

    this.root = element('div', 'hud-banner');
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    this.arrow = element('div', 'hud-banner-arrow');
    this.arrow.append(uiIcon('direction', 26));

    const body = element('div', 'hud-banner-body');

    this.title = element('div', 'hud-banner-title');
    this.body = element('div', 'hud-banner-text');
    body.append(this.title, this.body);
    this.root.append(this.arrow, body);
  }

  /**
   * Le bandeau d'une vague, une seule fois par vague ; `boss` : un gros
   * mutant ou la Reine (`queen`) mène la charge. Il dit ce qu'elle vise : la
   * mairie, ou l'usine.
   */
  public announce(
    night: number,
    wave: number,
    count: number,
    bases: number,
    boss: boolean,
    queen: boolean,
    from: Compass,
    target: BuildingId,
    origin: { x: number; y: number },
  ): void {
    const key = `${night}:${wave}`;

    if (key === this.announced) return;
    this.announced = key;

    const text = t().hud.wave;
    const direction = t().hud.from[from];
    const aim = t().buildings[target].label;

    this.show(
      'wave',
      wave === 1 ? text.night(night) : text.reinforcements,
      queen ? text.queen(direction) : boss ? text.boss(direction, aim) : text.mutants(count, bases, direction, aim),
      origin,
      BANNER_WAVE_MS,
    );
  }

  /**
   * Le soir d'une nuit de Reine, le bandeau compte jusqu'à sa sortie, du
   * crépuscule à sa vague. Un autre bandeau (une vague, une victoire) passe
   * devant le temps de se lire ; le compte revient ensuite.
   */
  public updateQueen(): void {
    const { world } = this.ctx;
    const ticks = world.queenCountdown();
    const counting = this.root.dataset['tone'] === 'queen';

    if (ticks === null) {
      if (counting) this.root.hidden = true;
      return;
    }
    if (!this.root.hidden && !counting) return;

    const seconds = Math.ceil(ticks / TICKS_PER_SECOND);
    const text = t().hud.wave.queenIn(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    const title = t().hud.wave.queenNight(world.clock()!.cycle);

    if (this.root.hidden) {
      this.show('queen', title, text, null, Infinity);
    } else {
      // Le titre ne change qu'avec la langue.
      if (this.title.textContent !== title) this.title.textContent = title;
      if (this.body.textContent !== text) this.body.textContent = text;
    }
  }

  /** Le bandeau, au-dessus du compte à rebours ; sa flèche suit `target` tant qu'il est là. */
  public show(tone: 'wave' | 'cleared' | 'queen', title: string, body: string, target: { x: number; y: number } | null, ms: number): void {
    const banner = this.root;

    banner.dataset['tone'] = tone;
    this.title.textContent = title;
    this.body.textContent = body;
    this.target = target;
    this.arrow.hidden = target === null;
    banner.hidden = false;
    this.aim();

    // Relance l'animation d'entrée.
    banner.style.animation = 'none';
    void banner.offsetWidth;
    banner.style.animation = '';

    window.clearTimeout(this.timer);
    // `Infinity` : il reste jusqu'à ce qu'un autre le remplace (le compte à rebours de la Reine).
    if (!Number.isFinite(ms)) return;
    this.timer = window.setTimeout(() => {
      banner.hidden = true;
      this.target = null;
    }, ms);
  }

  /** À chaque frame, tant qu'il est là : la flèche suit la caméra. */
  public frame(): void {
    if (!this.root.hidden) this.aim();
  }

  /** Un chiffre géant au centre, qui frappe et s'efface — le rythme de l'alarme. */
  public showCountdown(label: string): void {
    this.countdown.textContent = label;
    this.countdown.style.animation = 'none';
    void this.countdown.offsetWidth;
    this.countdown.style.animation = '';
  }

  /** Tourne la flèche du bandeau d'Adam vers le point d'apparition, à l'écran. */
  private aim(): void {
    if (!this.target) return;

    const { player } = this.ctx.world;
    const from = this.ctx.project(player.x, player.y);
    const to = this.ctx.project(this.target.x, this.target.y);

    this.arrow.style.transform = `rotate(${Math.atan2(to.y - from.y, to.x - from.x).toFixed(3)}rad)`;
  }

  public dispose(): void {
    window.clearTimeout(this.timer);
  }
}
