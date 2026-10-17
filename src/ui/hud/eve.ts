/**
 * La bulle d'Ève au-dessus de sa tête : son arrivée, ses quêtes, ce qu'elle
 * répond quand on la tape. Courte, jamais bloquante ; elle suit Ève à chaque
 * frame et passe à la réplique suivante le temps de lecture écoulé.
 */

import { currentQuest } from '../../sim/eve.ts';
import { t } from '../../i18n/locale.ts';
import type { HudContext } from './context.ts';
import { element } from './dom.ts';

/** Durée d'une réplique d'Ève : un socle, plus le temps de lire. */
const SPEECH_BASE_MS = 1600;
const SPEECH_PER_CHAR_MS = 45;
/** Sous la quête, la bulle garde ce jeu (ses 10 px de flottement compris). */
export const SPEECH_GAP = 14;

export class EveSpeech {
  public readonly root: HTMLElement;

  /** Les répliques d'Ève en attente, et l'heure où la réplique affichée s'en va. */
  private readonly queue: string[] = [];
  private until = 0;
  /** Ce qu'elle a déjà dit quand on la tape : elle ne radote pas. */
  private chatterIndex = 0;
  private talks = 0;
  /** Hauteur de la bulle, lue une fois par réplique : son texte ne change pas entre-temps. */
  private height = 0;

  private readonly ctx: HudContext;

  public constructor(ctx: HudContext) {
    this.ctx = ctx;
    this.root = element('div', 'hud-speech');
    this.root.hidden = true;
    this.root.setAttribute('aria-live', 'polite');
  }

  /** Des répliques à la suite dans la bulle d'Ève. */
  public say(lines: readonly string[]): void {
    this.queue.push(...lines);
  }

  /** Ève dit `line` tout de suite, à la place de ce qu'elle disait. */
  public interrupt(line: string): void {
    this.queue.length = 0;
    this.queue.push(line);
    this.until = 0;
  }

  /**
   * Ève tapée : elle répond sur-le-champ, à la place de ce qu'elle disait.
   * Pendant une attaque, elle a mieux à faire ; sinon, une fois sur deux elle
   * rappelle la quête, l'autre elle dit ce qui lui passe par la tête.
   */
  public talk(): void {
    const quest = currentQuest(this.ctx.world.questsDone);
    let line: string;

    if (this.ctx.mutantCount() > 0) {
      line = t().eve.busy;
    } else if (this.talks++ % 2 === 0) {
      line = quest ? t().quests[quest].give : t().eve.allDone;
    } else {
      const { chatter } = t().eve;

      line = chatter[this.chatterIndex++ % chatter.length]!;
    }

    this.interrupt(line);
  }

  /** La bulle suit Ève à l'écran ; elle passe à la réplique suivante quand le temps de lecture est écoulé. */
  public frame(): void {
    const eve = this.ctx.world.eve();
    const now = performance.now();
    const speech = this.root;

    if (!eve) {
      speech.hidden = true;
      return;
    }

    if (now >= this.until) {
      const line = this.queue.shift();

      if (line === undefined) {
        speech.hidden = true;
        return;
      }
      speech.textContent = line;
      speech.hidden = false;
      this.until = now + SPEECH_BASE_MS + line.length * SPEECH_PER_CHAR_MS;

      // Relance l'animation d'entrée à chaque réplique ; le reflow qu'il faut
      // pour ça donne aussi la hauteur de la bulle.
      speech.style.animation = 'none';
      this.height = speech.offsetHeight;
      speech.style.animation = '';
    }

    // La quête grandit pendant qu'Ève parle (une quête commence, un conseil
    // s'ouvre) : son bas se relit à chaque frame où la bulle est là.
    const questBottom = this.ctx.topInset();
    // Au-dessus de la tête — plus haut en selle —, sans sortir de l'écran.
    const head = eve.state === 'arriving' ? 62 : 50;
    const { x, y } = this.ctx.project(eve.x, eve.y - head);
    const viewWidth = this.ctx.viewWidth();
    const margin = Math.min(130, viewWidth / 2);

    speech.style.left = `${Math.round(Math.min(Math.max(x, margin), viewWidth - margin))}px`;
    // `top` est le bas de la bulle, qui flotte 10 px au-dessus : tout entière sous la quête.
    speech.style.top = `${Math.round(Math.max(y, questBottom + this.height + SPEECH_GAP))}px`;
  }

  /** Rien de branché hors de la bulle. */
  public dispose(): void {}
}
