/**
 * Le panneau de la caserne : ce que montre la fenêtre d'une caserne.
 *
 * En haut, la troupe (`n/5`, formations comprises) et la recrue en
 * formation, avec le temps qui reste. Dessous, une carte par classe —
 * portrait, effet, caractéristiques en une ligne, coût en icônes (en rouge
 * ce qui manque, sac et ville comptés ensemble) et « Recruter ». Puis
 * l'armée actuelle : un compagnon par ligne, sa classe et ses points de vie.
 *
 * Comme toute l'interface, il ne modifie rien : « Recruter » pousse une
 * commande (`recruitCompanion`) que le tick consomme. Il lit le monde à
 * chaque frame ; les cartes ne sont réécrites que si ce qu'elles affichent
 * a changé.
 */

import { COMPANIONS, COMPANION_CLASSES, COMPANION_CLASS_IDS, type CompanionClassId } from '../data/companions.ts';
import type { ItemId } from '../data/items.ts';
import { locale, onLocale, t } from '../i18n/locale.ts';
import type { Barracks } from '../sim/types.ts';
import { TICKS_PER_SECOND, type World } from '../sim/world.ts';
import { Disposer } from './disposer.ts';
import { creatureIconUrl, itemAmount } from './icons.ts';

interface Card {
  root: HTMLElement;
  name: HTMLElement;
  effect: HTMLElement;
  stats: HTMLElement;
  cost: HTMLElement;
  button: HTMLButtonElement;
  last: string;
}

export class BarracksPanel {
  public readonly root: HTMLElement;

  private readonly army: HTMLElement;
  private readonly training: HTMLElement;
  private readonly cards = new Map<CompanionClassId, Card>();
  private readonly rosterTitle: HTMLElement;
  private readonly roster: HTMLElement;
  private barracksId: number | null = null;
  private lastRoster = '';
  private lastLocale = '';

  private readonly world: World;
  /** Ce qu'il a branché hors de lui : la langue. */
  private readonly disposer = new Disposer();

  public constructor(world: World) {
    this.world = world;

    this.root = element('div', 'barracks');
    this.army = element('p', 'barracks-army');
    this.training = element('p', 'barracks-training');
    this.rosterTitle = element('h3', 'barracks-roster-title');
    this.roster = element('ul', 'barracks-roster');

    const classes = element('div', 'barracks-classes');

    for (const role of COMPANION_CLASS_IDS) {
      const card = this.card(role);

      this.cards.set(role, card);
      classes.append(card.root);
    }

    this.root.append(this.army, this.training, classes, this.rosterTitle, this.roster);
    this.disposer.add(onLocale(() => this.reset()));
  }

  /** Ne suit plus la langue ; la fenêtre du bâtiment l'appelle en se défaisant. */
  public dispose(): void {
    this.disposer.dispose();
  }

  private card(role: CompanionClassId): Card {
    const root = element('div', 'barracks-card');
    const portrait = document.createElement('img');
    const body = element('div', 'barracks-card-body');
    const name = element('h4', 'barracks-card-name');
    const effect = element('p', 'barracks-card-effect');
    const stats = element('p', 'barracks-card-stats');
    const cost = element('div', 'building-panel-items');
    const actions = element('div', 'building-panel-actions');
    const button = document.createElement('button');

    portrait.className = 'barracks-card-portrait';
    portrait.alt = '';
    portrait.src = creatureIconUrl(COMPANION_CLASSES[role].sprite);
    button.type = 'button';
    button.dataset['tone'] = 'upgrade';
    button.addEventListener('click', () => {
      if (this.barracksId !== null) this.world.push({ type: 'recruitCompanion', barracks: this.barracksId, role });
    });
    actions.append(button);
    body.append(name, effect, stats, cost, actions);
    root.append(portrait, body);
    return { root, name, effect, stats, cost, button, last: '' };
  }

  private reset(): void {
    this.lastRoster = '';
    for (const card of this.cards.values()) card.last = '';
  }

  /** Relit la caserne ouverte ; `inReach` : Adam est assez près pour recruter. */
  public update(barracks: Barracks, inReach: boolean): void {
    const text = t().panel.barracks;
    const count = this.world.companionCount();
    const troop = this.world.companions();
    const full = count >= COMPANIONS.max;
    const busy = barracks.training !== null;

    // Un changement de langue en cours de fenêtre réécrit tout.
    if (this.lastLocale !== locale()) {
      this.lastLocale = locale();
      this.reset();
    }
    this.barracksId = barracks.id;

    this.army.textContent =
      (full ? `${text.army(count, COMPANIONS.max)} · ${text.full(COMPANIONS.max)}` : text.army(count, COMPANIONS.max)) + (inReach ? '' : text.comeCloser);
    this.training.hidden = !barracks.training;
    if (barracks.training) {
      const seconds = Math.max(0, Math.ceil((barracks.training.endTick - this.world.tickCount) / TICKS_PER_SECOND));

      this.training.textContent = text.training(t().companionClasses[barracks.training.role].label, seconds);
    }

    for (const [role, card] of this.cards) {
      const proto = COMPANION_CLASSES[role];
      const missing = this.world.recruitMissing(barracks, role);
      const short = Object.keys(missing).length > 0;
      const key = `${inReach}:${JSON.stringify(missing)}`;

      card.button.disabled = !inReach || busy || full || short;
      if (key === card.last) continue;
      card.last = key;

      const words = t().companionClasses[role];

      card.name.textContent = words.label;
      card.effect.textContent = words.effect;
      card.stats.textContent = [
        text.stats.hp(proto.hp),
        ...(proto.damage > 0 ? [text.stats.damage(proto.damage), text.stats.range(proto.range)] : []),
        ...(proto.heal > 0 ? [text.stats.heal(proto.heal)] : []),
        text.seconds(proto.trainTicks / TICKS_PER_SECOND),
      ].join(' · ');
      card.cost.replaceChildren(
        ...(Object.entries(proto.cost) as [ItemId, number][]).map(([item, needed]) => {
          const row = itemAmount(item, needed);
          const lacking = missing[item] ?? 0;

          if (lacking > 0) {
            const note = element('span', 'item-missing');

            row.dataset['missing'] = 'true';
            note.textContent = t().panel.upgrade.lacking(lacking);
            row.append(note);
          }
          return row;
        }),
      );
      card.button.textContent = text.recruit;
    }

    const rosterKey = troop.map((companion) => `${companion.id}:${companion.role}:${companion.hp}`).join(',');

    if (rosterKey === this.lastRoster) return;
    this.lastRoster = rosterKey;
    this.rosterTitle.textContent = text.rosterTitle;
    this.roster.replaceChildren(
      ...(troop.length === 0
        ? [Object.assign(element('li', 'barracks-roster-none'), { textContent: text.none })]
        : troop.map((companion) => {
            const line = element('li', 'barracks-roster-line');
            const name = element('span', 'barracks-roster-name');
            const hp = element('span', 'barracks-roster-hp');
            const max = COMPANION_CLASSES[companion.role].hp;
            const portrait = document.createElement('img');

            portrait.alt = '';
            portrait.src = creatureIconUrl(COMPANION_CLASSES[companion.role].sprite);
            name.textContent = t().companionClasses[companion.role].label;
            hp.textContent = text.hp(companion.hp, max);
            hp.dataset['alert'] = String(companion.hp / max < 1 / 3);
            line.append(portrait, name, hp);
            return line;
          })),
    );
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  node.className = className;
  return node;
}
