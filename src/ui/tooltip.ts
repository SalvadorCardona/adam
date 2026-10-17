/**
 * Infobulles du HUD : le libellé d'une icône — ce qu'elle compte, ce
 * qu'elle fait.
 *
 * Une seule bulle, déléguée sur la racine du HUD : tout élément qui porte
 * `data-tip` en a une. Elle vient au survol de la souris après un court
 * délai, tout de suite au focus clavier d'un bouton, et à l'appui long au
 * doigt — le tap qui suit l'appui long est avalé, un appui court garde son
 * effet. `setTip` pose aussi le nom accessible de l'icône.
 *
 * Le HUD rebâtit ses cartes quand leur contenu change : la bulle retrouve,
 * sous la souris, l'élément qui a remplacé le sien (`refresh`, à chaque
 * frame) et relit son libellé — celui de l'horloge bouge chaque seconde.
 */

/** Délai du survol avant la bulle. */
const HOVER_MS = 400;
/** Appui long au doigt : celui du menu de construction. */
const LONG_PRESS_MS = 450;
/** Au doigt, la bulle reste le temps de la lire. */
const TOUCH_MS = 2500;
/** Un doigt qui glisse plus loin ne fait pas un appui long. */
const MOVE_PX = 10;
/** Écart entre l'icône et la bulle, et marge au bord de l'écran. */
const GAP = 8;
const MARGIN = 8;

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Où poser la bulle (`size`) près de l'icône (`anchor`) sans sortir de
 * l'écran (`viewport`) : dessous de préférence — le HUD est en haut —,
 * dessus si elle n'y tient pas, centrée sur l'icône et retenue aux bords.
 */
export function placeTip(
  anchor: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number; below: boolean } {
  const below = anchor.top + anchor.height + GAP + size.height <= viewport.height - MARGIN || anchor.top - GAP - size.height < MARGIN;
  const top = below ? anchor.top + anchor.height + GAP : anchor.top - GAP - size.height;
  const centered = anchor.left + anchor.width / 2 - size.width / 2;
  const left = Math.max(MARGIN, Math.min(centered, viewport.width - MARGIN - size.width));

  return { left: Math.round(left), top: Math.round(Math.max(MARGIN, top)), below };
}

/**
 * Décale la bulle (`tip`) hors des cartes à ne pas recouvrir (`avoid`, la
 * bulle d'Ève) : dessous si l'écran y laisse la place, sinon dessus ; à défaut,
 * elle reste où elle était.
 */
export function dodgeTips(
  tip: { left: number; top: number; width: number; height: number },
  avoid: readonly { left: number; top: number; width: number; height: number }[],
  viewportHeight: number,
): number {
  let top = tip.top;

  for (const card of avoid) {
    const overlaps = tip.left < card.left + card.width && card.left < tip.left + tip.width && top < card.top + card.height && card.top < top + tip.height;

    if (!overlaps) continue;

    const below = card.top + card.height + GAP;
    const above = card.top - GAP - tip.height;

    if (below + tip.height <= viewportHeight - MARGIN) top = below;
    else if (above >= MARGIN) top = above;
  }
  return Math.round(top);
}

/** Le libellé d'une icône : sa bulle, et son nom pour les lecteurs d'écran (`alt` d'une image). */
export function setTip(node: HTMLElement, label: string): void {
  node.dataset['tip'] = label;
  if (node instanceof HTMLImageElement) {
    node.alt = label;
    node.removeAttribute('aria-hidden');
  } else {
    node.setAttribute('aria-label', label);
  }
  // L'infobulle du navigateur doublerait la nôtre.
  node.removeAttribute('title');
  for (const child of node.querySelectorAll('[title]')) child.removeAttribute('title');
}

type Mode = 'hover' | 'focus' | 'touch';

export class Tooltips {
  private readonly root: HTMLElement;
  private readonly bubble: HTMLElement;
  /** L'icône dont la bulle est montrée, ou attendue (`timer`). */
  private target: HTMLElement | null = null;
  private mode: Mode = 'hover';
  private shown = false;
  private timer: number | undefined;
  /** Dernière position de la souris : la bulle y retrouve une icône rebâtie. */
  private mouse: { x: number; y: number } | null = null;
  /** Le doigt posé, tant qu'il peut encore faire un appui long. */
  private press: { id: number; x: number; y: number } | null = null;
  private touchUntil = 0;
  /** Un appui long a montré la bulle : le tap qui le termine ne fait rien d'autre. */
  private swallowClick = false;

  /** Les cartes que la bulle ne doit pas recouvrir. */
  private readonly avoid: () => readonly Rect[];

  public constructor(root: HTMLElement, avoid: () => readonly Rect[] = () => []) {
    this.root = root;
    this.avoid = avoid;
    this.bubble = document.createElement('div');
    this.bubble.className = 'hud-tip';
    this.bubble.hidden = true;
    // Le libellé est déjà le nom de l'icône : le lecteur d'écran ne le lit pas deux fois.
    this.bubble.setAttribute('aria-hidden', 'true');
    root.append(this.bubble);

    root.addEventListener('pointerover', (event) => {
      if (event.pointerType !== 'mouse') return;
      this.mouse = { x: event.clientX, y: event.clientY };

      const target = this.tipOf(event.target);

      if (!target || target === this.target) return;
      // D'une icône à sa voisine, la bulle suit sans attendre.
      if (this.shown && this.mode === 'hover') this.show(target, 'hover');
      else this.wait(target, 'hover', HOVER_MS);
    });
    root.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'mouse') this.mouse = { x: event.clientX, y: event.clientY };
      else if (this.press?.id === event.pointerId && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > MOVE_PX) {
        this.cancelPress();
      }
    });
    root.addEventListener('pointerout', (event) => {
      if (event.pointerType !== 'mouse' || this.mode !== 'hover' || !this.target) return;
      if (event.relatedTarget instanceof Node && this.target.contains(event.relatedTarget)) return;
      this.mouse = null;
      this.hide();
    });
    root.addEventListener('pointerdown', (event) => {
      this.swallowClick = false;
      if (event.pointerType === 'mouse') {
        this.hide();
        return;
      }

      const target = this.tipOf(event.target);

      this.hide();
      if (!target) return;
      this.wait(target, 'touch', LONG_PRESS_MS);
      this.press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    root.addEventListener('pointerup', () => this.cancelPress());
    root.addEventListener('pointercancel', () => this.cancelPress());
    // Le tap qui finit un appui long : la bulle seule, pas le bouton.
    root.addEventListener(
      'click',
      (event) => {
        if (!this.swallowClick) return;
        this.swallowClick = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
    // Le menu contextuel qu'un appui long ouvre sur Android cacherait la bulle.
    root.addEventListener('contextmenu', (event) => {
      if (this.tipOf(event.target)) event.preventDefault();
    });
    root.addEventListener('focusin', (event) => {
      const target = this.tipOf(event.target);

      if (target && target === event.target && target.matches(':focus-visible')) this.show(target, 'focus');
    });
    root.addEventListener('focusout', () => {
      if (this.mode === 'focus') this.hide();
    });
  }

  /** À chaque frame : la bulle suit son icône, relit son libellé, et s'en va à son heure. */
  public refresh(): void {
    if (!this.shown || !this.target) return;

    if (this.mode === 'touch' && performance.now() >= this.touchUntil) {
      this.hide();
      return;
    }

    if (!this.target.isConnected) {
      // Au doigt, la bulle reste où elle est ; sous la souris, elle passe à l'icône qui a pris la place.
      if (this.mode === 'touch') return;

      const found = this.mode === 'hover' && this.mouse ? this.tipOf(document.elementFromPoint(this.mouse.x, this.mouse.y)) : null;

      if (!found) {
        this.hide();
        return;
      }
      this.target = found;
    }
    this.render();
  }

  public hide(): void {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.target = null;
    this.press = null;
    this.shown = false;
    this.bubble.hidden = true;
  }

  private wait(target: HTMLElement, mode: Mode, delay: number): void {
    this.hide();
    this.target = target;
    this.mode = mode;
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      if (mode === 'touch') this.swallowClick = true;
      this.show(target, mode);
    }, delay);
  }

  private show(target: HTMLElement, mode: Mode): void {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.target = target;
    this.mode = mode;
    this.shown = true;
    this.press = null;
    this.touchUntil = performance.now() + TOUCH_MS;
    this.bubble.textContent = '';
    this.render();
  }

  /** Un doigt levé ou qui glisse n'attend plus d'appui long ; une bulle déjà montrée reste. */
  private cancelPress(): void {
    this.press = null;
    if (this.mode === 'touch' && !this.shown) this.hide();
  }

  private render(): void {
    const target = this.target!;
    const label = target.dataset['tip'] ?? '';

    if (label === '') {
      this.bubble.hidden = true;
      return;
    }
    if (this.bubble.textContent !== label) this.bubble.textContent = label;
    this.bubble.hidden = false;

    const anchor = target.getBoundingClientRect();
    const { left, top, below } = placeTip(
      anchor,
      { width: this.bubble.offsetWidth, height: this.bubble.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );

    const placed = dodgeTips({ left, top, width: this.bubble.offsetWidth, height: this.bubble.offsetHeight }, this.avoid(), window.innerHeight);

    this.bubble.style.left = `${left}px`;
    this.bubble.style.top = `${placed}px`;
    this.bubble.dataset['below'] = String(below);
  }

  /** L'icône à libellé sous un élément, dans le HUD. */
  private tipOf(node: EventTarget | null): HTMLElement | null {
    if (!(node instanceof Element)) return null;

    const target = node.closest<HTMLElement>('[data-tip]');

    return target && this.root.contains(target) ? target : null;
  }
}
