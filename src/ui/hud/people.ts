/**
 * La population de la ville, dans sa bulle : au travail, inactifs, au repos,
 * enfants, logés, bonheur, et l'armée. Les inactifs sont un bouton, en
 * corail dès qu'il y en a un : un tap centre la caméra sur l'un d'eux, le
 * tap suivant sur le suivant.
 */

import { COMPANIONS, COMPANION_CLASSES } from '../../data/companions.ts';
import { moodOf } from '../../sim/housing.ts';
import type { MobileId } from '../../sim/types.ts';
import { onLocale, t } from '../../i18n/locale.ts';
import { Disposer } from '../disposer.ts';
import { uiIcon } from '../icons.ts';
import { setTip } from '../tooltip.ts';
import type { HudContext } from './context.ts';
import { element, text } from './dom.ts';

/** Le temps où la flèche de l'aube reste à côté du Bonheur de la ville, en ms. */
const MOOD_TREND_MS = 6000;

export class People {
  public readonly root: HTMLElement;

  private last = '';
  /** Le sens où l'aube a fait bouger le Bonheur de la ville, et jusqu'à quand la flèche le montre. */
  private moodTrend: { up: boolean; until: number } | null = null;
  /** Rang, dans `World.idleWorkers()`, du prochain inactif que montre un tap sur leur compteur. */
  private idleCursor = 0;

  private readonly ctx: HudContext;
  private readonly showPerson: (id: MobileId) => void;
  private readonly disposer = new Disposer();

  public constructor(ctx: HudContext, showPerson: (id: MobileId) => void) {
    this.ctx = ctx;
    this.showPerson = showPerson;
    this.root = element('div', 'panel hud-people');
    this.root.hidden = true;
    // Les libellés se réécrivent dans la nouvelle langue.
    this.disposer.add(onLocale(() => {
      this.last = '';
    }));
  }

  /** L'aube a fait bouger le Bonheur de la ville : la flèche le montre un moment. */
  public moodChanged(from: number, to: number): void {
    this.moodTrend = to === from ? null : { up: to > from, until: performance.now() + MOOD_TREND_MS };
  }

  public update(): void {
    const { world } = this.ctx;
    const { working, idle, resting, children } = world.census();
    const { housed, population } = world.housing();
    const mood = world.happiness();

    if (this.moodTrend && performance.now() >= this.moodTrend.until) this.moodTrend = null;
    const trend = this.moodTrend ? (this.moodTrend.up ? 'up' : 'down') : '';
    const troop = world.companions();
    const training = world.companionCount() - troop.length;
    const troopHp = troop.reduce((sum, companion) => sum + companion.hp, 0);
    const troopMax = troop.reduce((sum, companion) => sum + COMPANION_CLASSES[companion.role].hp, 0);
    const key = `${working}:${idle}:${resting}:${children}:${housed}/${population}:${mood.total}:${mood.unhappy}:${trend}:${troop.length}/${training}/${troopHp}/${troopMax}`;

    if (key === this.last) return;
    const label = t().hud.people;

    this.last = key;

    const count = (icon: 'toil' | 'child' | 'moon', value: number, label: string): HTMLElement => {
      const node = text('hud-people-count', String(value));

      node.prepend(uiIcon(icon, 18));
      setTip(node, label);
      return node;
    };
    const lazy = text('hud-people-count hud-people-idle', String(idle), 'button');

    lazy.setAttribute('type', 'button');
    lazy.dataset['alert'] = String(idle > 0);
    lazy.prepend(uiIcon('idle', 18));
    setTip(lazy, label.idle(idle));
    lazy.addEventListener('click', () => this.focusIdle());

    // L'Habitation, logés / habitants : en corail dès que quelqu'un dort dehors.
    const housing = text('hud-people-count hud-people-housing', `${housed}/${population}`);

    housing.dataset['alert'] = String(housed < population);
    housing.prepend(uiIcon('home', 18));
    setTip(housing, label.housing(housed, population));

    // Le Bonheur de la ville, à côté : la note moyenne sur 100, la même jauge que la fiche d'un habitant ; en corail quand l'habitant moyen est malheureux.
    // L'aube qui le fait bouger y pose une flèche, le temps de la voir.
    const happiness = text('hud-people-count hud-people-happiness', String(mood.average));

    happiness.dataset['alert'] = String(population > 0 && moodOf(mood.average) === 'unhappy');
    happiness.prepend(uiIcon('townMood', 18));
    if (trend) {
      happiness.dataset['trend'] = trend;
      happiness.append(uiIcon(trend === 'up' ? 'trendUp' : 'trendDown', 14));
    }
    setTip(happiness, label.happiness(mood.total, mood.average, mood.unhappy));

    // L'armée : compagnons / plafond, et une jauge de leur santé réunie — en corail dès qu'ils sont à moins du tiers.
    const army = text('hud-people-count hud-people-army', `${troop.length}/${COMPANIONS.max}`);
    const health = document.createElement('span');
    const fill = document.createElement('span');

    health.className = 'hud-army-bar';
    fill.className = 'hud-army-fill';
    fill.style.width = `${troopMax > 0 ? Math.round((troopHp / troopMax) * 100) : 0}%`;
    health.append(fill);
    army.dataset['alert'] = String(troopMax > 0 && troopHp / troopMax < 1 / 3);
    army.prepend(uiIcon('army', 18));
    army.append(health);
    setTip(army, t().hud.army.label(troop.length, COMPANIONS.max, troopHp, troopMax, training));

    const hasArmy = troop.length + training > 0;

    this.root.hidden = working + idle + resting + children === 0 && !hasArmy;
    this.root.setAttribute('aria-label', label.summary(working, idle, resting));
    this.root.replaceChildren(
      count('toil', working, label.working(working)),
      lazy,
      ...(resting > 0 ? [count('moon', resting, label.resting(resting))] : []),
      count('child', children, label.children(children)),
      housing,
      happiness,
      ...(hasArmy ? [army] : []),
    );
  }

  /** Centre la caméra sur un ouvrier qui glande — au tap suivant, sur le suivant — et dit qui il est. */
  private focusIdle(): void {
    const idle = this.ctx.world.idleWorkers();

    if (idle.length === 0) return;

    const worker = idle[this.idleCursor % idle.length]!;

    this.idleCursor = (this.idleCursor + 1) % idle.length;
    this.ctx.focus(worker.x, worker.y);
    this.showPerson(worker.id);
  }

  public dispose(): void {
    this.disposer.dispose();
  }
}
