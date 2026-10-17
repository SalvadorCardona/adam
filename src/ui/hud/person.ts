/**
 * L'infobulle d'un habitant — prénom, âge, ce qu'il fait, ses jauges —,
 * au-dessus de lui, le temps de la lire. Elle le suit s'il marche.
 */

import { NEED_IDS } from '../../data/needs.ts';
import type { Mobile, MobileId } from '../../sim/types.ts';
import type { Inhabitant } from '../../sim/world.ts';
import { moodMeter } from '../moodMeter.ts';
import { needMeter } from '../needMeter.ts';
import { personText } from '../personText.ts';
import type { HudContext } from './context.ts';
import { element, text } from './dom.ts';
import { SPEECH_GAP } from './eve.ts';

/** Le temps de lire l'infobulle d'un habitant, en ms. */
const PERSON_MS = 4200;

export class PersonTip {
  public readonly root: HTMLElement;
  /** Sa hauteur, donnée par le `ResizeObserver` de la racine : sans la relire à chaque nouveau contenu. */
  public height = 0;

  /** L'habitant montré, et l'heure (`performance.now()`) où l'infobulle s'efface. */
  private id: MobileId | null = null;
  private until = 0;
  private key = '';

  private readonly ctx: HudContext;

  public constructor(ctx: HudContext) {
    this.ctx = ctx;
    this.root = element('div', 'hud-speech hud-person');
    this.root.hidden = true;
  }

  public show(id: MobileId): void {
    const person = this.root;

    this.id = id;
    this.until = performance.now() + PERSON_MS;
    person.style.animation = 'none';
    person.replaceChildren();
    this.key = '';
    person.hidden = false;
    void person.offsetWidth;
    person.style.animation = '';
  }

  public frame(): void {
    const { world } = this.ctx;
    const person = this.root;
    const mobile = this.id === null ? undefined : world.mobiles.get(this.id);

    if (!mobile || !isInhabitant(mobile) || (mobile.kind !== 'kid' && mobile.inside) || performance.now() >= this.until) {
      this.id = null;
      person.hidden = true;
      return;
    }

    const line = personText(world.nameFor(mobile), mobile.age, world.occupation(mobile));
    // La jauge avance par centièmes : l'infobulle ne se refait pas à chaque tick.
    const gauges = NEED_IDS.map((need) => Math.round(mobile.needs[need] * 100));
    const happiness = mobile.kind === 'kid' ? null : mobile.happiness;
    const key = `${line}|${gauges.join(':')}|${happiness === null ? '' : Math.round(happiness)}`;

    if (key !== this.key) {
      this.key = key;
      person.replaceChildren(
        text('hud-person-line', line),
        ...NEED_IDS.map((need) => needMeter(need, mobile.needs[need])),
        ...(happiness === null ? [] : [moodMeter(happiness)]),
      );
    }

    const { x, y } = this.ctx.project(mobile.x, mobile.y - (mobile.kind === 'kid' ? 30 : 40));
    const viewWidth = this.ctx.viewWidth();
    const margin = Math.min(130, viewWidth / 2);

    person.style.left = `${Math.round(Math.min(Math.max(x, margin), viewWidth - margin))}px`;
    person.style.top = `${Math.round(Math.max(y, this.ctx.topInset() + this.height + SPEECH_GAP))}px`;
  }

  /** Rien de branché hors de l'infobulle. */
  public dispose(): void {}
}

/** Un enfant, un ouvrier, un bûcheron, un forestier : ce qui a un prénom et une infobulle. */
function isInhabitant(mobile: Mobile): mobile is Inhabitant {
  return mobile.kind === 'kid' || mobile.kind === 'worker' || mobile.kind === 'lumberjack' || mobile.kind === 'forester' || mobile.kind === 'farmer';
}
