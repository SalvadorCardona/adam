/** « Vous êtes mort » : plein écran, sans bouton — le décompte de la sim décide seul. */

import type { World } from '../../sim/world.ts';
import { onLocale, t } from '../../i18n/locale.ts';
import { Disposer } from '../disposer.ts';
import { element } from './dom.ts';

export class Death {
  public readonly root: HTMLElement;

  private readonly count: HTMLElement;
  private lastSeconds = -1;

  private readonly world: World;
  private readonly disposer = new Disposer();

  public constructor(world: World) {
    this.world = world;
    this.root = element('div', 'overlay hud-death');
    this.root.hidden = !world.dead;
    this.root.setAttribute('role', 'alert');

    const title = element('h2', 'death-title');

    this.count = element('p', 'death-count');
    this.root.append(title, this.count);
    this.disposer.add(onLocale(() => {
      title.textContent = t().hud.death.title;
      this.lastSeconds = -1;
    }));
  }

  public show(): void {
    this.root.hidden = false;
  }

  public hide(): void {
    this.root.hidden = true;
  }

  /** Le compte à rebours de la mort, réécrit seulement quand la seconde change. */
  public update(): void {
    if (this.root.hidden) return;

    const seconds = this.world.respawnSeconds();

    if (seconds === this.lastSeconds) return;
    this.lastSeconds = seconds;
    this.count.textContent = t().hud.death.countdown(seconds);
  }

  public dispose(): void {
    this.disposer.dispose();
  }
}
