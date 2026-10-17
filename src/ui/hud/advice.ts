/**
 * Le conseil sous la quête (cf. `hint.ts`) : c'est Ève qui le dit, son
 * portrait devant. Il suit ce que fait le joueur (couper, casser, livrer,
 * construire, se défendre) et se tait quand il a compris ; au bout de cinq
 * secondes, il se replie en ampoule à côté du titre de la quête. Il dit aussi
 * au reste du jeu ce qu'il envoie chercher : l'objet du sac, le repère de
 * bord, la recherche du labo.
 */

import type { ItemId } from '../../data/items.ts';
import type { ResearchId } from '../../data/research.ts';
import { TICKS_PER_SECOND } from '../../sim/world.ts';
import { locale, onLocale, t } from '../../i18n/locale.ts';
import { Disposer } from '../disposer.ts';
import { tutorialAdvice, type Advice as Hint } from '../hint.ts';
import { uiIcon } from '../icons.ts';
import { setTip } from '../tooltip.ts';
import type { HudContext } from './context.ts';
import { element } from './dom.ts';
import type { Quest } from './quest.ts';

/**
 * Un conseil inchangé se replie au bout de ce délai, compté en ticks : il ne
 * se replie ni derrière l'écran titre ni pendant la pause.
 */
const HINT_FOLD_TICKS = 5 * TICKS_PER_SECOND;

export class Advice {
  /** Ce que le joueur a déjà fait : un conseil compris ne revient pas. */
  public readonly learned = { harvestedWood: false, harvestedStone: false, delivered: false, repaired: false };

  private readonly hint: HTMLElement;
  private readonly text: HTMLElement;
  private readonly bulb: HTMLButtonElement;
  private last = '';
  /** La langue du conseil affiché : en changer réécrit le conseil sans le relancer. */
  private shownLocale = locale();
  /** Tick où le conseil a été montré (ou déplié) : il se replie `HINT_FOLD_TICKS` plus tard. */
  private since = 0;
  private wanted: ItemId | null = null;
  private pointed: ItemId | null = null;
  private research: ResearchId | null = null;

  private readonly ctx: HudContext;
  private readonly quest: Quest;
  private readonly disposer = new Disposer();

  /** Le conseil se range dans la quête : l'ampoule dans sa tête, le pli sous son corps. */
  public constructor(ctx: HudContext, quest: Quest) {
    this.ctx = ctx;
    this.quest = quest;

    // Replié, le conseil n'est plus qu'une ampoule à côté du titre : un tap le déplie.
    this.bulb = element('button', 'hud-hint-bulb');
    this.bulb.type = 'button';
    this.bulb.append(uiIcon('hint', 20));
    this.bulb.addEventListener('click', () => this.unfold());
    quest.head.append(this.bulb);

    // Le conseil s'ouvre et se referme en douceur dans son pli : la quête
    // grandit sans à-coup, et rien n'est posé dessous qui puisse sauter.
    const fold = element('div', 'hud-hint-fold');

    this.hint = element('div', 'hud-hint');
    this.text = element('span', 'hud-hint-text');
    this.hint.append(uiIcon('eve', 22), this.text);
    const clip = element('div', 'hud-hint-clip');

    clip.append(this.hint);
    fold.append(clip);
    quest.root.append(fold);

    this.disposer.add(onLocale(() => setTip(this.bulb, t().hud.hintBulb)));
  }

  /** La ressource que le conseil envoie chercher, ou `null`. */
  public wantedItem(): ItemId | null {
    return this.wanted;
  }

  /** Ce que le repère de bord montre : ce qu'on récolte, ou l'eau où poser le puits. */
  public pointedItem(): ItemId | null {
    return this.pointed;
  }

  /** La recherche que le conseil envoie lancer au labo, ou `null`. */
  public advisedResearch(): ResearchId | null {
    return this.research;
  }

  public update(): void {
    const advice = this.current();
    const hint = advice?.text ?? '';
    const root = this.quest.root;

    this.wanted = advice?.wants ?? null;
    this.pointed = advice?.pointTo ?? this.wanted;
    this.research = advice?.research ?? null;
    this.hint.dataset['urgent'] = String(advice?.urgent === true);

    // La langue vient de changer : le même conseil, dans l'autre langue, sans le relancer ni le déplier.
    if (hint !== this.last && this.shownLocale !== locale()) {
      this.shownLocale = locale();
      this.last = hint;
      if (hint !== '') this.text.textContent = hint;
    } else if (hint !== this.last) {
      this.last = hint;
      this.since = this.ctx.world.tickCount;
      if (hint !== '') this.quest.unfold(HINT_FOLD_TICKS);
      // Le texte reste en place quand le conseil se tait : il part en se repliant.
      if (hint !== '') this.text.textContent = hint;

      // Relance l'animation d'entrée à chaque nouveau conseil.
      this.hint.style.animation = 'none';
      void this.hint.offsetWidth;
      this.hint.style.animation = '';
    }

    const folded = this.ctx.world.tickCount - this.since >= HINT_FOLD_TICKS;
    const state = hint === '' ? 'none' : folded ? 'folded' : 'open';

    if (root.dataset['hint'] !== state) root.dataset['hint'] = state;
  }

  /** Le tap sur l'ampoule : le conseil revient pour cinq secondes. */
  public unfold(): void {
    this.since = this.ctx.world.tickCount;
    this.quest.root.dataset['hint'] = this.last === '' ? 'none' : 'open';
    this.quest.unfold(HINT_FOLD_TICKS);
  }

  /** Le conseil sous la quête, cf. `hint.ts`. */
  private current(): Hint | null {
    const { world } = this.ctx;
    const towers = [...world.entities.values()].some((entity) => entity.kind === 'tower');

    return tutorialAdvice(world, { ...this.learned }, towers, this.ctx.mutantCount(), this.quest.selected());
  }

  public dispose(): void {
    this.disposer.dispose();
  }
}
