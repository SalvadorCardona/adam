import { onLocale, t } from '../i18n/locale.ts';
import { Disposer } from './disposer.ts';

/**
 * La pile d'événements du haut de l'écran, à droite de l'horloge : faveur de
 * l'aube, talent à choisir, vague, alerte de vivres, météo, combo, « Passer la nuit ». Elle ne
 * montre que le plus pressant, puis « +2 » ; un tap sur le « +2 » (ou Entrée,
 * Espace, le curseur de la manette) ouvre le reste en liste dessous, Échap la
 * referme. Les capsules gardent leur propre rendu : la pile ne fait que les
 * ranger, d'après ce qu'elles montrent (`hidden`, `data-*`).
 */

/** L'urgence d'une capsule visible : la plus haute passe devant. */
export function eventRank(id: string, data: DOMStringMap): number {
  switch (id) {
    case 'wave':
      return data['urgent'] === 'true' ? 100 : 70;
    case 'hunger':
      return 90;
    case 'boon':
      return data['state'] === 'offer' ? 60 : 20;
    case 'talent':
      return 62;
    case 'weather':
      return data['harsh'] === 'true' ? 65 : 45;
    case 'combo':
      return 40;
    case 'hasten':
      return 30;
    default:
      return 0;
  }
}

/** Les ids rangés du plus pressant au moins pressant (à égalité, l'ordre d'arrivée). */
export function sortEvents(entries: readonly { id: string; rank: number }[]): string[] {
  return entries
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((entry) => entry.id);
}

export class EventStack {
  public readonly root: HTMLElement;
  private readonly more: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly chips = new Map<string, HTMLElement>();
  private open = false;
  private key = '';
  /** Ce que la pile a branché hors d'elle : le toucher du document, la langue. */
  private readonly disposer = new Disposer();

  public constructor() {
    this.root = document.createElement('div');
    this.root.className = 'hud-events';
    this.root.hidden = true;
    this.more = document.createElement('button');
    this.more.type = 'button';
    this.more.className = 'panel hud-events-more';
    this.more.setAttribute('aria-haspopup', 'true');
    this.more.addEventListener('click', () => this.toggle(!this.open));
    this.list = document.createElement('div');
    this.list.className = 'hud-events-list';
    this.list.hidden = true;
    this.root.append(this.more, this.list);
    this.root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.open) return;
      event.stopPropagation();
      this.toggle(false);
      this.more.focus();
    });
    this.disposer.listen(document, 'pointerdown', (event) => {
      if (this.open && event.target instanceof Node && !this.root.contains(event.target)) this.toggle(false);
    });
    this.disposer.add(onLocale(() => {
      this.key = '';
    }));
  }

  /** Une capsule de plus dans la pile ; elle se montre et se cache seule (`hidden`). */
  public add(id: string, chip: HTMLElement): void {
    chip.dataset['event'] = id;
    this.chips.set(id, chip);
    this.root.insertBefore(chip, this.more);
  }

  /** À chaque frame : le plus pressant devant, le reste dans la liste. */
  public update(): void {
    const shown = [...this.chips].filter(([, chip]) => !chip.hidden);
    const order = sortEvents(shown.map(([id, chip]) => ({ id, rank: eventRank(id, chip.dataset) })));
    const key = order.join(',');

    if (key === this.key) return;
    this.key = key;
    this.root.hidden = order.length === 0;

    const [first, ...rest] = order;

    for (const [id, chip] of this.chips) {
      const queued = id !== first && rest.includes(id);

      chip.dataset['queued'] = String(queued);
      if (queued) this.list.append(chip);
      else if (chip.parentElement !== this.root) this.root.insertBefore(chip, this.more);
    }
    this.more.hidden = rest.length === 0;
    this.more.textContent = `+${rest.length}`;
    this.more.setAttribute('aria-label', t().hud.events.more(rest.length));
    if (rest.length === 0) this.toggle(false);
    else this.toggle(this.open);
  }

  /** Débranche le toucher du document et la langue. */
  public dispose(): void {
    this.disposer.dispose();
  }

  private toggle(open: boolean): void {
    this.open = open;
    this.list.hidden = !open;
    this.root.dataset['open'] = String(open);
    this.more.setAttribute('aria-expanded', String(open));
  }
}
