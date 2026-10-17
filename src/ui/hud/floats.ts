/**
 * Ce qui monte au-dessus de la carte et s'efface : les gains de la tête
 * d'Adam, l'objet récolté qui file dans le sac, le butin d'un point d'intérêt
 * qui vole vers le sac ou la ville, « +N Prestige », « +N XP », l'objet
 * refusé, et le nom d'un bâtiment achevé qui monte de son toit.
 */

import { TILE_SIZE } from '../../core/grid.ts';
import type { ItemId } from '../../data/items.ts';
import type { Entity } from '../../sim/types.ts';
import { t } from '../../i18n/locale.ts';
import { COMBO_SHOWN } from '../harvestCombo.ts';
import { itemIcon, prestigeIcon } from '../icons.ts';
import type { HudContext } from './context.ts';
import { element, text } from './dom.ts';

/** Durée de vie d'un « +N Prestige », en ms (cf. `.hud-float-prestige` dans le CSS). */
const PRESTIGE_FLOAT_MS = 1600;

/** Le vol d'un objet trouvé vers le sac, en ms, et l'écart entre deux objets. */
const FIND_FLY_MS = 900;
const FLY_STAGGER_MS = 110;

/** Durée de vie d'un gain flottant, en ms (cf. `hud-float-up` dans le CSS). */
const FLOAT_MS = 1000;

/** Vol d'un objet récolté jusqu'au sac, en ms ; au plus `MAX_FLYERS` en l'air, la récolte en lâche quatre par demi-seconde. */
const FLY_MS = 550;
const MAX_FLYERS = 8;

/** Durée de vie du « Mairie bâtie ! » qui monte d'un bâtiment achevé, en ms (cf. `hud-built-up` dans le CSS). */
const BUILT_MS = 1800;

export class Floats {
  public readonly root: HTMLElement;
  /** Objets en vol vers le sac (`flyToBag`). */
  private flyers = 0;

  private readonly ctx: HudContext;
  /** Le bouton du sac et le bandeau de la ville : là où volent les gains. */
  private readonly bag: HTMLElement;
  private readonly town: HTMLElement;

  public constructor(ctx: HudContext, bag: HTMLElement, town: HTMLElement) {
    this.ctx = ctx;
    this.bag = bag;
    this.town = town;
    this.root = element('div', 'hud-floats');
  }

  /**
   * Le butin d'un point d'intérêt, objet par objet, qui s'envole de (x, y) — pixels monde — vers le
   * bouton du sac, qui rebondit à chaque arrivée. Sous `prefers-reduced-motion`, il monte sur place
   * comme un gain ordinaire.
   */
  public flyFindsToBag(items: readonly [ItemId, number][], worldX: number, worldY: number, to: 'bag' | 'town' = 'bag'): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const origin = this.ctx.project(worldX, worldY - 16);
    const field = this.root.getBoundingClientRect();
    const goal = to === 'bag' ? this.bag : this.town;
    const target = goal.getBoundingClientRect();
    const dx = target.left + target.width / 2 - field.left - origin.x;
    const dy = target.top + target.height / 2 - field.top - origin.y;

    for (const [index, [item, amount]] of items.entries()) {
      if (reduced) {
        this.float(item, amount);
        continue;
      }

      const flier = element('span', 'hud-fly');
      const delay = index * FLY_STAGGER_MS;

      flier.style.left = `${Math.round(origin.x)}px`;
      flier.style.top = `${Math.round(origin.y)}px`;
      flier.append(itemIcon(item, 22), `${amount}`);
      this.root.append(flier);

      const flight = flier.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0, offset: 0 },
          { transform: 'translate(-50%, calc(-50% - 26px)) scale(1.25)', opacity: 1, offset: 0.25 },
          { transform: `translate(calc(-50% + ${Math.round(dx)}px), calc(-50% + ${Math.round(dy)}px)) scale(0.55)`, opacity: 1, offset: 0.95 },
          { transform: `translate(calc(-50% + ${Math.round(dx)}px), calc(-50% + ${Math.round(dy)}px)) scale(0.3)`, opacity: 0, offset: 1 },
        ],
        { duration: FIND_FLY_MS, delay, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'backwards' },
      );

      flight.onfinish = () => {
        flier.remove();
        if (to === 'town') {
          goal.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 240, easing: 'ease-out' });
          return;
        }
        this.bag.dataset['bump'] = 'true';
        window.setTimeout(() => delete this.bag.dataset['bump'], 260);
      };
    }
  }

  /** Une icône et un delta qui montent de la tête d'Adam et s'effacent. */
  public float(item: ItemId, delta: number, streak = 0): void {
    const { player } = this.ctx.world;
    const { x, y } = this.ctx.project(player.x, player.y - 44);
    const floater = element('span', 'hud-float');

    floater.dataset['out'] = String(delta < 0);
    floater.style.left = `${Math.round(x + (Math.random() - 0.5) * 18)}px`;
    floater.style.top = `${Math.round(y)}px`;
    floater.append(`${delta > 0 ? '+' : '−'}${Math.abs(delta)}`, itemIcon(item, 18));
    // Le combo de récolte : le chiffre grossit avec la série, qui s'écrit au bout.
    if (streak >= COMBO_SHOWN) {
      floater.dataset['combo'] = 'true';
      floater.style.setProperty('--combo', String(Math.min(1.5, 1 + (streak - COMBO_SHOWN) * 0.05)));
      floater.append(text('hud-float-combo', `×${streak}`));
    }
    this.root.append(floater);
    window.setTimeout(() => floater.remove(), FLOAT_MS);
  }

  /**
   * L'objet récolté part de la tête d'Adam et file dans le bouton du sac, qui
   * fait « pop » à l'arrivée. Animation du navigateur, sur `transform` et
   * `opacity` seulement ; au plus `MAX_FLYERS` à la fois, et rien sous
   * `prefers-reduced-motion`.
   */
  public flyToBag(item: ItemId): void {
    if (this.flyers >= MAX_FLYERS || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const { player } = this.ctx.world;
    const start = this.ctx.project(player.x, player.y - 44);
    const home = this.root.getBoundingClientRect();
    const target = this.bag.getBoundingClientRect();
    const flyer = element('span', 'hud-flyer');

    flyer.append(itemIcon(item, 20));
    flyer.style.left = `${Math.round(start.x)}px`;
    flyer.style.top = `${Math.round(start.y)}px`;
    this.root.append(flyer);
    this.flyers += 1;

    const dx = target.left + target.width / 2 - home.left - start.x;
    const dy = target.top + target.height / 2 - home.top - start.y;
    const flight = flyer.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.round(dx)}px), calc(-50% + ${Math.round(dy)}px)) scale(0.5)`, opacity: 0.9 },
      ],
      { duration: FLY_MS, easing: 'cubic-bezier(0.5, 0, 0.8, 0.4)', fill: 'forwards' },
    );

    flight.onfinish = () => {
      flyer.remove();
      this.flyers -= 1;
      this.bag.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.4 }, { transform: 'scale(1)' }],
        { duration: 220, easing: 'ease-out' },
      );
    };
  }

  /** « +N Prestige » qui monte du bâtiment achevé ou de l'ennemi vaincu, en `x`, `y` pixels monde. */
  public floatPrestige(amount: number, worldX: number, worldY: number): void {
    const { x, y } = this.ctx.project(worldX, worldY - 28);
    const floater = element('span', 'hud-float hud-float-prestige');

    floater.style.left = `${Math.round(x)}px`;
    floater.style.top = `${Math.round(y)}px`;
    floater.append(t().hud.float.prestige(amount), prestigeIcon(18));
    this.root.append(floater);
    window.setTimeout(() => floater.remove(), PRESTIGE_FLOAT_MS);
  }

  /** « +N XP » qui monte de l'ennemi abattu. */
  public floatXp(amount: number, worldX: number, worldY: number): void {
    const { x, y } = this.ctx.project(worldX, worldY - 20);
    const floater = element('span', 'hud-float hud-float-prestige hud-float-xp');

    floater.style.left = `${Math.round(x)}px`;
    floater.style.top = `${Math.round(y)}px`;
    floater.append(t().hud.float.xp(amount));
    this.root.append(floater);
    window.setTimeout(() => floater.remove(), PRESTIGE_FLOAT_MS);
  }

  /** L'icône de l'objet refusé, qui tressaute au-dessus d'Adam : il n'en prend plus. */
  public refused(item: ItemId): void {
    const { player } = this.ctx.world;
    const { x, y } = this.ctx.project(player.x, player.y - 44);
    const floater = element('span', 'hud-float');

    floater.dataset['refused'] = 'true';
    floater.style.left = `${Math.round(x)}px`;
    floater.style.top = `${Math.round(y)}px`;
    floater.append(itemIcon(item, 18), t().hud.float.enough);
    this.root.append(floater);
    window.setTimeout(() => floater.remove(), FLOAT_MS);
  }

  /** « Mairie bâtie ! » qui monte du toit d'un bâtiment achevé et s'efface. */
  public celebrate(entity: Pick<Entity, 'tx' | 'ty' | 'width' | 'height'>, message: string): void {
    const { x, y } = this.ctx.project((entity.tx + entity.width / 2) * TILE_SIZE, (entity.ty - 1) * TILE_SIZE);
    const floater = element('span', 'hud-built');

    floater.style.left = `${Math.round(x)}px`;
    floater.style.top = `${Math.round(y)}px`;
    floater.textContent = message;
    this.root.append(floater);
    window.setTimeout(() => floater.remove(), BUILT_MS);
  }

  /** Rien de branché hors du calque : ses gains partent avec lui. */
  public dispose(): void {}
}
