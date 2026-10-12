/**
 * Le curseur virtuel de la manette : une flèche dessinée par le jeu (celle
 * de la souris, `art/cursors.ts`, en plus grand), que le stick droit promène
 * et que la croix pose sur le bouton voisin.
 *
 * Il **est** une souris : sous lui, on cherche l'élément visé
 * (`elementFromPoint`) et on lui envoie les événements pointeur qu'une
 * souris enverrait — `pointermove` en bougeant (le fantôme d'un bâtiment armé
 * le suit, une icône du HUD montre son libellé), `pointerdown` à l'appui du
 * bouton du bas, `pointerup` puis `click` au relâché. Le canvas, le HUD, les
 * fenêtres n'ont rien à savoir de la manette : un clic au curseur fait
 * exactement ce que ferait un clic de souris au même endroit, tenu compris
 * (tracer une route, faire glisser la carte du monde).
 *
 * Les événements portent `pointerType: 'mouse'` et un `pointerId` à eux ;
 * `isTrusted` est faux, c'est ainsi que `gamepadControls.ts` distingue la
 * vraie souris, qui fait disparaître le curseur.
 *
 * La croix (`navigate`) passe d'un élément focusable à l'autre parmi ceux
 * qu'on peut atteindre — ceux qu'aucune fenêtre ne recouvre —, lui donne le
 * focus (bien visible : `.pad-focus`) et y pose le curseur.
 */

import { CURSOR_SVGS } from '../art/cursors.ts';
import { CURSORS, CURSOR_SIZE } from '../data/cursors.ts';
import { clampToScreen, nearestInDirection, type PadDirection } from '../input/gamepad.ts';

/** L'identifiant des événements du curseur : loin de ceux de la souris (1) et des doigts. */
export const PAD_POINTER_ID = 7_331;

/** Le curseur est plus grand que celui de la souris : il se voit de loin, sur un Steam Deck posé sur les genoux. */
const SCALE = 1.4;

/** Ce qui prend le focus à la croix. */
const FOCUSABLE = [
  'button:not([disabled])',
  '[role="button"]',
  '[role="tab"]',
  'a[href]',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export class PadCursor {
  public readonly root: HTMLDivElement;

  private readonly image: HTMLImageElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly canvasHand: (x: number, y: number) => boolean;
  private px = 0;
  private py = 0;
  private shown = false;
  private hover: Element | null = null;
  private downTarget: Element | null = null;
  private focused: HTMLElement | null = null;
  private look: 'arrow' | 'hand' = 'arrow';

  /** `canvasHand` : sous le curseur, la carte a-t-elle quelque chose à taper ? (en pixels CSS du canvas) */
  public constructor(canvas: HTMLCanvasElement, canvasHand: (x: number, y: number) => boolean) {
    this.canvas = canvas;
    this.canvasHand = canvasHand;
    this.root = document.createElement('div');
    this.root.className = 'pad-cursor';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.image = document.createElement('img');
    this.image.alt = '';
    this.image.width = this.image.height = Math.round(CURSOR_SIZE * SCALE);
    this.root.append(this.image);
    this.setLook('arrow');
    this.px = window.innerWidth / 2;
    this.py = window.innerHeight / 2;
    this.place();
  }

  public get x(): number {
    return this.px;
  }

  public get y(): number {
    return this.py;
  }

  /** Le bouton du bas est tenu. */
  public get pressing(): boolean {
    return this.downTarget !== null;
  }

  public setVisible(on: boolean): void {
    if (this.shown === on) return;
    this.shown = on;
    this.root.hidden = !on;
    if (on) {
      this.moveTo(this.px, this.py);
      return;
    }
    this.release(false);
    this.blur();
    this.leave();
  }

  /** Décale le curseur de (`dx`, `dy`) pixels CSS. */
  public moveBy(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.moveTo(this.px + dx, this.py + dy);
  }

  /** Pose le curseur en (`x`, `y`), borné à l'écran ; ce qui est dessous le voit passer. */
  public moveTo(x: number, y: number): void {
    const point = clampToScreen(x, y, window.innerWidth, window.innerHeight);

    this.px = point.x;
    this.py = point.y;
    this.place();

    const target = this.targetAt();

    if (target !== this.hover) {
      if (this.hover) this.fire(this.hover, 'pointerout', { relatedTarget: target });
      if (target) this.fire(target, 'pointerover', { relatedTarget: this.hover });
      this.hover = target;
    }
    // Pendant un appui, la souris reste « capturée » par ce qui a reçu le `pointerdown` : un glissé qui déborde reste suivi.
    if (target) this.fire(target, 'pointermove');
    else if (this.downTarget) this.fire(this.downTarget, 'pointermove');
    this.refresh();
  }

  /** Le bouton du bas s'enfonce : `pointerdown` sous le curseur, et le focus à ce qui le prend. */
  public press(): void {
    if (this.downTarget) return;

    const target = this.targetAt();

    if (!target) return;
    this.downTarget = target;

    const focusable = target.closest<HTMLElement>(FOCUSABLE);

    if (focusable) this.focus(focusable, false);
    else this.blur();
    this.fire(target, 'pointerdown', { button: 0 });
  }

  /** Le bouton du bas se relâche : `pointerup`, puis `click` sur ce qui a reçu les deux, comme une souris. */
  public release(click = true): void {
    const down = this.downTarget;

    if (!down) return;
    this.downTarget = null;

    const target = this.targetAt() ?? down;

    this.fire(target, 'pointerup', { button: 0 });
    if (!click) return;

    const common = commonAncestor(down, target);

    if (common && common !== document.documentElement && common !== document.body) {
      common.dispatchEvent(new MouseEvent('click', { ...this.init(), button: 0, detail: 1 }));
    }
  }

  /**
   * La croix : le focus passe à l'élément voisin dans cette direction, et le
   * curseur s'y pose. Sur un curseur de volume qui a le focus, gauche et
   * droite le règlent.
   */
  public navigate(direction: PadDirection): void {
    // Le focus de la croix, ou celui qu'une fenêtre a posé elle-même en s'ouvrant (sa croix, son champ de recherche).
    const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const current = active ?? (this.focused?.isConnected ? this.focused : null);

    if (current instanceof HTMLInputElement && current.type === 'range' && (direction === 'left' || direction === 'right')) {
      if (direction === 'left') current.stepDown();
      else current.stepUp();
      current.dispatchEvent(new Event('input', { bubbles: true }));
      current.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    const candidates = reachable();
    const start = current && candidates.includes(current) ? center(current.getBoundingClientRect()) : { x: this.px, y: this.py };
    const index = nearestInDirection(
      start,
      direction,
      candidates.map((element) => {
        const rect = element.getBoundingClientRect();

        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      }),
    );
    // Rien par là depuis un curseur égaré hors de la fenêtre : on prend l'élément le plus proche, pour y entrer.
    const next = candidates[index] ?? (current && candidates.includes(current) ? undefined : closest(start, candidates));

    if (!next) return;
    this.focus(next, true);
  }

  /** L'aspect suit ce qui est sous le curseur : la main sur ce qui se tape. Appelé par frame, c'est bon marché. */
  public refresh(): void {
    if (!this.shown) return;

    const target = this.targetAt();
    let hand = false;

    if (target === this.canvas) {
      const rect = this.canvas.getBoundingClientRect();

      hand = this.canvasHand(this.px - rect.left, this.py - rect.top);
    } else if (target) {
      hand = target.closest(FOCUSABLE) !== null;
    }
    this.setLook(hand ? 'hand' : 'arrow');
  }

  private focus(element: HTMLElement, moveCursor: boolean): void {
    this.blur();
    this.focused = element;
    element.classList.add('pad-focus');
    element.focus({ preventScroll: false });
    if (!moveCursor) return;

    // Le focus a pu faire défiler une fenêtre : la place se lit après.
    const point = center(element.getBoundingClientRect());

    this.moveTo(point.x, point.y);
  }

  private blur(): void {
    this.focused?.classList.remove('pad-focus');
    this.focused = null;
  }

  private leave(): void {
    if (this.hover) this.fire(this.hover, 'pointerout', { relatedTarget: null });
    this.hover = null;
  }

  private setLook(look: 'arrow' | 'hand'): void {
    if (this.look === look && this.image.src) return;
    this.look = look;
    this.image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(CURSOR_SVGS[look])}`;
    this.place();
  }

  /** Le point chaud du dessin tombe pile sur (`x`, `y`). */
  private place(): void {
    const { hotspot } = CURSORS[this.look];

    this.root.style.transform = `translate(${this.px - hotspot.x * SCALE}px, ${this.py - hotspot.y * SCALE}px)`;
  }

  private targetAt(): Element | null {
    return document.elementFromPoint(this.px, this.py);
  }

  private init(): MouseEventInit {
    return { bubbles: true, cancelable: true, composed: true, view: window, clientX: this.px, clientY: this.py, screenX: this.px, screenY: this.py };
  }

  private fire(target: Element, type: string, extra: { button?: number; relatedTarget?: Element | null } = {}): void {
    target.dispatchEvent(
      new PointerEvent(type, {
        ...this.init(),
        pointerId: PAD_POINTER_ID,
        pointerType: 'mouse',
        isPrimary: true,
        button: extra.button ?? -1,
        buttons: this.downTarget ? 1 : 0,
        relatedTarget: extra.relatedTarget ?? null,
      }),
    );
  }
}

function closest(point: { x: number; y: number }, elements: readonly HTMLElement[]): HTMLElement | undefined {
  let best: HTMLElement | undefined;
  let distance = Infinity;

  for (const element of elements) {
    const middle = center(element.getBoundingClientRect());
    const d = Math.hypot(middle.x - point.x, middle.y - point.y);

    if (d < distance) {
      distance = d;
      best = element;
    }
  }
  return best;
}

function center(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Le plus proche ancêtre commun : c'est lui qui reçoit le `click` d'une souris appuyée sur l'un, relâchée sur l'autre. */
function commonAncestor(a: Element, b: Element): Element | null {
  for (let node: Element | null = a; node; node = node.parentElement) if (node.contains(b)) return node;
  return null;
}

/**
 * Les éléments que la croix peut atteindre : affichés, et pas recouverts —
 * une fenêtre ouverte cache le HUD derrière elle. Un élément sorti de sa
 * fenêtre par le défilement compte si sa fenêtre, elle, est atteignable :
 * le focus l'y fera défiler.
 */
function reachable(): HTMLElement[] {
  const result: HTMLElement[] = [];
  const width = window.innerWidth;
  const height = window.innerHeight;

  for (const element of document.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    const rect = element.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0 || element.closest('[hidden], [inert], [aria-hidden="true"]')) continue;
    if (getComputedStyle(element).visibility === 'hidden') continue;

    const point = center(rect);
    const inside = point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
    const hit = inside ? document.elementFromPoint(point.x, point.y) : null;

    if (hit && (hit === element || element.contains(hit))) {
      result.push(element);
      continue;
    }

    const scroller = scrollParent(element);

    if (!scroller) continue;

    const box = scroller.getBoundingClientRect();
    const middle = clampToScreen(box.left + box.width / 2, box.top + box.height / 2, width, height);
    const seen = document.elementFromPoint(middle.x, middle.y);
    const within = rect.left >= box.left - 1 && rect.right <= box.right + 1;

    // Hors de la vue de sa fenêtre seulement : un élément visible mais recouvert reste hors d'atteinte.
    const clipped = rect.top < box.top || rect.bottom > box.bottom || !inside;

    if (clipped && within && seen && scroller.contains(seen)) result.push(element);
  }
  return result;
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);

    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}
