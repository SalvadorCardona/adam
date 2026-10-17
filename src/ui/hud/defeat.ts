/** L'écran de défaite : le bilan de la colonie tombée et les graines qu'elle laisse au jardin des souvenirs. */

import { seedsFor } from '../../data/perks.ts';
import { TICKS_PER_SECOND, type World } from '../../sim/world.ts';
import { onLocale, t } from '../../i18n/locale.ts';
import { Disposer } from '../disposer.ts';
import { uiIcon } from '../icons.ts';
import { mapUrl, seedLine } from '../seed.ts';
import { clock, element, text } from './dom.ts';

export class Defeat {
  public readonly root: HTMLElement;

  private readonly stats: HTMLElement;
  private readonly seeds: HTMLElement;

  private readonly world: World;
  private readonly disposer = new Disposer();

  public constructor(world: World) {
    this.world = world;
    this.root = element('div', 'overlay hud-defeat');
    this.root.hidden = true;

    const panel = element('div', 'panel overlay-panel');
    const title = element('h2', 'overlay-title');
    const body = element('p', 'overlay-text');
    const replay = element('button', 'button-primary');
    const fresh = element('button', 'button-secondary');

    this.stats = element('dl', 'overlay-stats');
    this.seeds = element('div', 'overlay-seeds');
    // La sauvegarde est déjà effacée : l'adresse seule décide de la carte.
    replay.type = 'button';
    replay.addEventListener('click', () => window.location.assign(mapUrl(window.location.href, world.seed)));
    fresh.type = 'button';
    fresh.addEventListener('click', () => window.location.assign(mapUrl(window.location.href, null)));
    panel.append(title, body, this.stats, this.seeds, replay, fresh, seedLine(world.seed, this.disposer));
    this.root.append(panel);

    // Les libellés fixes se réécrivent au changement de langue, et l'écran ouvert aussi.
    this.disposer.add(onLocale(() => {
      const words = t().hud.defeat;

      title.textContent = words.title;
      body.textContent = words.text;
      replay.textContent = words.replay;
      fresh.textContent = words.fresh;
      if (!this.root.hidden) this.render();
    }));
  }

  public show(): void {
    this.render();
    this.root.hidden = false;
  }

  /** Le bilan de la défaite et ses graines, dans la langue du moment. */
  private render(): void {
    const { world } = this;
    const rows = defeatRows(world);

    this.stats.replaceChildren(
      ...rows.flatMap(([label, value]) => [text('', label, 'dt'), text('', value, 'dd')]),
    );

    // Les mêmes graines que `main.ts` verse au jardin : le barème est une fonction pure du bilan.
    const seeds = seedsFor(world.colonyScore());
    const amount = text('overlay-seeds-amount', t().hud.defeat.seeds(seeds));

    amount.prepend(uiIcon('seed', 28));
    this.seeds.replaceChildren(amount, text('overlay-seeds-hint', t().hud.defeat.seedsHint));
  }

  public dispose(): void {
    this.disposer.dispose();
  }
}

/**
 * Le bilan de l'écran de défaite. Les nuits survécues sont les aubes
 * atteintes, comme à la victoire : la mairie peut tomber de jour.
 */
export function defeatRows(world: World): [string, string][] {
  const survived = Math.floor((world.defeatTick || world.tickCount) / TICKS_PER_SECOND);

  return [
    [t().hud.defeat.nights, String(world.stats.nightsSurvived)],
    [t().hud.defeat.kills, String(world.kills)],
    [t().hud.defeat.time, clock(survived)],
  ];
}
