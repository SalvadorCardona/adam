/**
 * L'écran Collection : les succès obtenus ou non, les skins d'Adam gagnés, les
 * trophées et les bâtiments rares trouvés.
 *
 * Un succès secret (`tier: 'secret'`) reste un point d'interrogation tant
 * qu'il n'est pas obtenu : ni son nom ni sa condition ne s'affichent. Comme
 * les autres écrans, celui-ci ne touche à rien : il lit la collection qu'on
 * lui tend (`sim/collection.ts`) et redessine à chaque ouverture.
 */

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  ACHIEVEMENT_TIERS,
  RARE_BUILDINGS,
  TROPHIES,
  rewardOf,
  type AchievementId,
} from '../data/achievements.ts';
import { PIECES } from '../data/wardrobe.ts';
import { onLocale, t } from '../i18n/locale.ts';
import { earnedSkins, earnedTrophies, progressOf, type Collection } from '../sim/collection.ts';
import { buildingIcon, uiIcon } from './icons.ts';
import { PanelTabs } from './panelTabs.ts';

type CollectionTab = 'achievements' | 'skins' | 'rares';

/** Le texte de la récompense d'un succès, ou rien s'il n'en a pas. */
export function rewardText(id: AchievementId): string | null {
  const reward = rewardOf(id);
  const words = t().collection.reward;

  if (!reward) return null;
  return 'skin' in reward ? words.skin(t().pieces[reward.skin]) : words.trophy(t().trophies[reward.trophy].label);
}

export class CollectionPanel {
  public readonly root: HTMLElement;

  private readonly summary: HTMLElement;
  private readonly tabs: PanelTabs<CollectionTab>;
  private readonly read: () => Collection;

  /** `read` : la collection du moment. `onClose` : « Retour ». */
  public constructor(read: () => Collection, onClose: () => void) {
    this.read = read;
    this.root = document.createElement('div');
    this.root.className = 'panel overlay-panel collection-panel';
    this.root.setAttribute('role', 'dialog');

    const title = document.createElement('h2');

    title.className = 'overlay-title';

    this.summary = document.createElement('div');
    this.summary.className = 'collection-summary';

    this.tabs = new PanelTabs<CollectionTab>([
      { id: 'achievements', icon: uiIcon('trophy', 18) },
      { id: 'skins', icon: uiIcon('people', 18) },
      { id: 'rares', icon: uiIcon('hammer', 18) },
    ]);

    const back = document.createElement('button');

    back.type = 'button';
    back.className = 'button-secondary';
    back.addEventListener('click', onClose);

    this.root.append(title, this.summary, this.tabs.bar, this.tabs.pages, back);
    onLocale(() => {
      const words = t().collection;

      this.root.setAttribute('aria-label', words.title);
      title.textContent = words.title;
      back.textContent = words.back;
      for (const id of ['achievements', 'skins', 'rares'] as const) this.tabs.setLabel(id, words.tabs[id]);
      this.render();
    });
  }

  /** Redessine à partir de la collection du moment : à chaque ouverture. */
  public render(): void {
    const collection = this.read();
    const words = t().collection;
    const { done, total } = progressOf(collection);

    this.summary.replaceChildren(uiIcon('trophy', 26), words.summary(done, total));
    this.tabs.page('achievements').replaceChildren(...this.achievements(collection));
    this.tabs.page('skins').replaceChildren(...this.skins(collection));
    this.tabs.page('rares').replaceChildren(...this.rares(collection));
  }

  private achievements(collection: Collection): HTMLElement[] {
    const words = t().collection;

    return ACHIEVEMENT_TIERS.flatMap((tier) => {
      const heading = document.createElement('h3');
      const list = document.createElement('ul');

      heading.className = 'collection-heading';
      heading.textContent = words.tiers[tier];
      list.className = 'collection-list';
      list.replaceChildren(
        ...ACHIEVEMENT_IDS.filter((id) => ACHIEVEMENTS[id].tier === tier).map((id) => this.achievement(id, collection.unlocked.includes(id))),
      );
      return [heading, list];
    });
  }

  private achievement(id: AchievementId, got: boolean): HTMLElement {
    const words = t().collection;
    const hidden = ACHIEVEMENTS[id].tier === 'secret' && !got;
    const row = document.createElement('li');
    const text = document.createElement('div');
    const name = document.createElement('strong');
    const description = document.createElement('span');

    row.className = 'collection-row';
    row.dataset['done'] = String(got);
    row.dataset['hidden'] = String(hidden);
    text.className = 'collection-text';
    name.textContent = hidden ? words.hiddenLabel : t().achievements[id].label;
    description.textContent = hidden ? words.hiddenHint : t().achievements[id].description;
    text.append(name, description);

    const reward = hidden ? null : rewardText(id);

    if (reward) {
      const line = document.createElement('span');

      line.className = 'collection-reward';
      line.textContent = reward;
      text.append(line);
    }
    row.append(uiIcon(hidden ? 'hint' : 'trophy', 32), text);
    return row;
  }

  private skins(collection: Collection): HTMLElement[] {
    const words = t().collection;
    const intro = document.createElement('p');
    const skins = earnedSkins(collection);
    const trophies = earnedTrophies(collection);
    const list = document.createElement('ul');
    const trophyHeading = document.createElement('h3');
    const trophyList = document.createElement('ul');

    intro.className = 'collection-intro';
    intro.textContent = words.skinsIntro;
    list.className = 'collection-list';
    list.replaceChildren(...skins.map((piece) => this.card(t().pieces[piece], t().wardrobe.slots[PIECES[piece].slot], true)));
    if (skins.length === 0) list.append(this.empty());
    trophyHeading.className = 'collection-heading';
    trophyHeading.textContent = words.trophiesTitle;
    trophyList.className = 'collection-list';
    trophyList.replaceChildren(
      ...trophies.map((id) => this.card(t().trophies[id].label, `${words.trophyKinds[TROPHIES[id].kind]} · ${t().trophies[id].description}`, true)),
    );
    if (trophies.length === 0) trophyList.append(this.empty());
    return [intro, list, trophyHeading, trophyList];
  }

  private rares(collection: Collection): HTMLElement[] {
    const words = t().collection;
    const intro = document.createElement('p');
    const list = document.createElement('ul');

    intro.className = 'collection-intro';
    intro.textContent = words.raresIntro;
    list.className = 'collection-list';
    list.replaceChildren(
      ...RARE_BUILDINGS.map((id) => {
        const found = collection.found.includes(id);
        const row = this.card(t().buildings[id].label, found ? words.found : words.notFound, found);

        row.replaceChild(buildingIcon(id, 40), row.firstElementChild!);
        return row;
      }),
    );
    return [intro, list];
  }

  private card(name: string, detail: string, got: boolean): HTMLElement {
    const row = document.createElement('li');
    const text = document.createElement('div');
    const title = document.createElement('strong');
    const line = document.createElement('span');

    row.className = 'collection-row';
    row.dataset['done'] = String(got);
    text.className = 'collection-text';
    title.textContent = name;
    line.textContent = detail;
    text.append(title, line);
    row.append(uiIcon('trophy', 32), text);
    return row;
  }

  private empty(): HTMLElement {
    const row = document.createElement('li');

    row.className = 'collection-empty';
    row.textContent = t().collection.empty;
    return row;
  }
}
