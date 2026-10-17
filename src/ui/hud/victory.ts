/** L'écran de victoire, le Signal : le bilan de la partie et les graines qu'elle laisserait au jardin. */

import { seedsFor } from '../../data/perks.ts';
import { TICKS_PER_SECOND, type World } from '../../sim/world.ts';
import { onLocale, t } from '../../i18n/locale.ts';
import { Disposer } from '../disposer.ts';
import { uiIcon } from '../icons.ts';
import { clock, element, text } from './dom.ts';

export class Victory {
  public readonly root: HTMLElement;
  /** Ce que fait « Continuer sans fin » : `main.ts` relance l'horloge. */
  public onContinue: () => void = () => {};
  /** « Fonder une nouvelle colonie » : `main.ts` verse les graines au jardin et repart sur une carte neuve. */
  public onRefound: () => void = () => {};

  private readonly stats: HTMLElement;
  private readonly seeds: HTMLElement;

  private readonly world: World;
  private readonly rainLeaves: () => void;
  private readonly disposer = new Disposer();

  public constructor(world: World, rainLeaves: () => void) {
    this.world = world;
    this.rainLeaves = rainLeaves;
    this.root = element('div', 'overlay hud-victory');
    this.root.hidden = true;

    const panel = element('div', 'panel overlay-panel');
    const title = element('h2', 'overlay-title');
    const body = element('p', 'overlay-text');
    const refound = element('button', 'button-primary');
    const endless = element('button', 'button-secondary');

    this.stats = element('dl', 'overlay-stats');
    endless.type = 'button';
    endless.addEventListener('click', () => {
      this.root.hidden = true;
      this.onContinue();
    });
    this.seeds = element('div', 'overlay-seeds');
    refound.type = 'button';
    refound.addEventListener('click', () => this.onRefound());
    panel.append(uiIcon('goal', 56), title, body, this.stats, this.seeds, refound, endless);
    this.root.append(panel);

    // Les libellés fixes se réécrivent au changement de langue, et l'écran ouvert aussi.
    this.disposer.add(onLocale(() => {
      const words = t().hud;

      title.textContent = t().lore.signal.title;
      body.textContent = t().lore.signal.text;
      refound.textContent = words.victory.refound;
      endless.textContent = words.victory.endless;
      if (!this.root.hidden) this.render();
    }));
  }

  public show(): void {
    this.render();
    this.root.hidden = false;
    this.rainLeaves();
  }

  /** Le bilan de la victoire, dans la langue du moment. */
  private render(): void {
    const { world } = this;
    const label = t().hud.victory;
    const { adults, children, workers } = world.population();
    let buildings = 0;

    for (const entity of world.entities.values()) if (entity.kind !== 'site') buildings += 1;

    const rows: [string, string][] = [
      [label.nights, String(world.stats.nightsSurvived)],
      [label.kills, String(world.kills)],
      [label.inhabitants, String(adults + children + workers)],
      [label.buildings, String(buildings)],
      [label.playTime, clock(Math.floor(world.victoryTick / TICKS_PER_SECOND))],
    ];

    this.stats.replaceChildren(
      ...rows.flatMap(([name, value]) => [text('', name, 'dt'), text('', value, 'dd')]),
    );

    // Les mêmes graines que `main.ts` verse au jardin à la refondation.
    const amount = text('overlay-seeds-amount', label.seeds(seedsFor(world.colonyScore())));

    amount.prepend(uiIcon('seed', 28));
    this.seeds.replaceChildren(amount, text('overlay-seeds-hint', label.seedsHint));
  }

  public dispose(): void {
    this.disposer.dispose();
  }
}
