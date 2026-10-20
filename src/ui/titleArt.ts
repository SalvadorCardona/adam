/**
 * La scène vivante derrière l'écran titre : la surface qui reçoit les gestes,
 * et qui mène la couche qui la peint (`TitleView`, `render/titleStage.ts`,
 * les plans et accessoires d'`art/titleScene.ts` dans Pixi). Le DOM n'a plus
 * qu'un `<div>` vide : pas de recalcul des styles ni de calque par
 * accessoire, à chaque image, sur un téléphone.
 *
 * - **Parallaxe** : chaque plan glisse de `depth` fois l'amplitude selon la
 *   visée (`ui/titleMotion.ts`) — la souris, l'inclinaison du téléphone (iOS
 *   la demande au premier toucher de la scène), sinon le doigt qui glisse —,
 *   menée par un ressort amorti. La boucle ne tourne que tant que la caméra
 *   bouge, et jamais onglet caché.
 * - **Toucher** : le mutant sursaute, un lampion flambe, un oiseau s'envole,
 *   le soleil palpite, Adam se retourne, l'herbe fleurit (`TitleTap`) ; la
 *   couche dit ce qui est sous le doigt (`hit`) et le fait réagir (`react`).
 * - **« Jouer »** : survolé ou visé, Adam se retourne et la lumière se
 *   réchauffe (`ready`) ; pressé, la caméra plonge vers la porte de la
 *   mairie (`dive`).
 * - **Regard** : les pupilles du mutant suivent la visée de la parallaxe, puis
 *   se tournent vers Adam quand il se retourne (la couche s'en charge).
 * - **Son** (`TitleSound`) : un vent doux dès le premier geste, des pépiements
 *   quand le vol d'oiseaux passe, des grillons à mesure que le crépuscule
 *   tombe (`TitleView.ambient`) ; un « pop » par fleur, le cri du mutant qui
 *   sursaute. Le moteur audio ne joue rien avant un geste, et le muet comme le
 *   volume des bruitages tiennent tout.
 *
 * La couche ne s'ouvre qu'une fois la surface à l'écran (une partie de test
 * ou l'ami qui rejoint construisent l'écran titre sans le montrer) ; tant
 * qu'elle se rastérise, l'écran garde son fond indigo. Sous
 * `prefers-reduced-motion`, ni parallaxe, ni plongée, ni regard : la scène est un
 * tableau, qui répond encore au toucher sans s'agiter. Pur décor :
 * `aria-hidden`, rien n'y prend le focus.
 */

import type { TitleTap } from '../art/titleScene.ts';
import { reducedMotion } from '../render/motion.ts';
import { Disposer } from './disposer.ts';
import { atRest, dragAim, pointerAim, springStep, tiltAim, type Aim, type Spring } from './titleMotion.ts';

/** Ce que la scène demande au son : trois effets, et l'ambiance (`null` la coupe, sinon le crépuscule, de 0 à 1). */
export interface TitleSound {
  play: (name: 'bloom' | 'squeal' | 'chirp') => void;
  ambience: (dusk: number | null) => void;
}

/** Le crépuscule et le vol d'oiseaux se relisent à ce rythme, en millisecondes : jamais dans la boucle de la caméra. */
const AMBIENCE_MS = 500;
const CHIRP_GAP_MS = { min: 600, max: 1800 };

/** Les effets d'un toucher qui a fait réagir la scène. */
const TAP_SOUNDS: Partial<Record<TitleTap, 'bloom' | 'squeal' | 'chirp'>> = { mutant: 'squeal', bird: 'chirp', ground: 'bloom' };

/** Combien de temps dure la plongée de « Jouer », en millisecondes (la couche a la même). */
export const TITLE_DIVE_MS = 1100;

/** Un accessoire qui réagit au toucher : ce à quoi il réagit, et lequel. */
export interface TitleHit {
  tap: TitleTap;
  id: string;
}

/** Ce qui peint la scène ; l'écran titre ne fait que la mener. Les points sont en pixels CSS de l'écran. */
export interface TitleView {
  /** La caméra, de -1 à 1 par axe : chaque plan glisse à l'opposé, `depth` fois l'amplitude. */
  parallax(x: number, y: number): void;
  hit(x: number, y: number): TitleHit | null;
  /** Fait réagir l'accessoire touché ; `false` s'il n'a rien fait (l'oiseau déjà envolé). */
  react(hit: TitleHit, x: number, y: number): boolean;
  /** Ce que l'ambiance sonore suit : le crépuscule (0 à 1), et le vol d'oiseaux qui passe à l'écran. */
  ambient(): { dusk: number; flock: boolean };
  ready(on: boolean): void;
  dive(): void;
  dispose(): void;
}

export class TitleArt {
  public readonly root: HTMLElement;

  private readonly life = new Disposer();
  private readonly open: () => Promise<TitleView>;
  private view: TitleView | null = null;
  private opening = false;
  private spring: Spring = { x: 0, y: 0, vx: 0, vy: 0 };
  private aim: Aim = { x: 0, y: 0 };
  /** La visée de l'inclinaison, quand le téléphone en donne une : le doigt la remplace le temps qu'il glisse. */
  private tilt: Aim | null = null;
  private tiltRest: { beta: number; gamma: number } | null = null;
  private drag: { id: number; x: number; y: number } | null = null;
  private frame = 0;
  private last = 0;
  private readied = false;
  private askedTilt = false;
  private disposed = false;
  private readonly sound: TitleSound | undefined;
  private nextChirp = 0;

  /** `open` ouvre la couche qui peint la scène, à la taille de l'écran ; `sound`, s'il est là, la fait entendre. */
  public constructor(open: () => Promise<TitleView>, sound?: TitleSound) {
    this.open = open;
    this.sound = sound;
    this.root = document.createElement('div');
    this.root.className = 'title-art';
    this.root.setAttribute('aria-hidden', 'true');
    this.wire();
    this.sound?.ambience(0);
  }

  private wire(): void {
    const { life, root } = this;

    life.listen(window, 'pointermove', (event) => {
      if (event.pointerType === 'mouse') {
        this.aimAt(pointerAim(event.clientX, event.clientY, window.innerWidth, window.innerHeight));
        this.hover(event);
      } else if (this.drag && event.pointerId === this.drag.id) this.aimAt(dragAim(event.clientX - this.drag.x, event.clientY - this.drag.y, window.innerWidth, window.innerHeight));
    });
    life.listen(document, 'mouseleave', () => this.aimAt({ x: 0, y: 0 }));
    life.listen(root, 'pointerdown', (event) => {
      this.askTilt();
      if (event.pointerType !== 'mouse') this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      const [x, y] = this.local(event);
      const hit = this.view?.hit(x, y);

      if (!hit || !this.view!.react(hit, x, y)) return;
      const effect = TAP_SOUNDS[hit.tap];

      if (effect) this.sound?.play(effect);
    });
    const release = (event: PointerEvent): void => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      this.drag = null;
      this.aimAt(this.tilt ?? { x: 0, y: 0 });
    };

    life.listen(window, 'pointerup', release);
    life.listen(window, 'pointercancel', release);
    life.listen(window, 'deviceorientation', (event) => this.onTilt(event));
    life.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.kick();
    });
    if (this.sound) life.interval(() => this.tune(), AMBIENCE_MS);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => this.show());

      observer.observe(root);
      life.add(() => observer.disconnect());
    }
  }

  /** Relit le crépuscule et le vol d'oiseaux : l'ambiance s'y accorde, et les oiseaux pépient. */
  private tune(): void {
    if (!this.sound || !this.view || document.hidden) return;
    const { dusk, flock } = this.view.ambient();
    const now = performance.now();

    this.sound.ambience(Math.max(0, Math.min(1, dusk)));
    if (!flock || now < this.nextChirp) return;
    this.sound.play('chirp');
    this.nextChirp = now + CHIRP_GAP_MS.min + Math.random() * (CHIRP_GAP_MS.max - CHIRP_GAP_MS.min);
  }

  /** La surface est à l'écran : la couche s'ouvre, une fois. */
  public show(): void {
    if (this.opening || this.disposed || !this.root.isConnected) return;
    this.opening = true;
    void this.open().then(
      (view) => {
        if (this.disposed) {
          view.dispose();
          return;
        }
        this.view = view;
        view.ready(this.readied);
        view.parallax(this.spring.x, this.spring.y);
        if (this.root.dataset['leaving'] === 'true') view.dive();
        // La scène est peinte : l'écran laisse voir le canvas derrière lui.
        this.root.dataset['drawn'] = 'true';
      },
      // Sans scène (WebGL perdu, SVG illisible), l'écran garde son fond indigo.
      () => undefined,
    );
  }

  /** Le point d'un geste dans la surface, qui couvre l'écran comme le canvas : lu sur un geste seulement. */
  private local(event: PointerEvent): [number, number] {
    const box = this.root.getBoundingClientRect();

    return [event.clientX - box.left, event.clientY - box.top];
  }

  /** La souris sur un accessoire qui réagit : la main. */
  private hover(event: PointerEvent): void {
    if (!this.view || event.target !== this.root) return;
    const over = this.view.hit(...this.local(event)) !== null;

    if (this.root.dataset['hover'] !== String(over)) this.root.dataset['hover'] = String(over);
  }

  /** iOS ne donne l'inclinaison qu'après un geste et un « oui » : on la demande au premier toucher de la scène. */
  private askTilt(): void {
    if (this.askedTilt || typeof DeviceOrientationEvent === 'undefined') return;
    this.askedTilt = true;
    const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;

    if (typeof ask === 'function') void ask.call(DeviceOrientationEvent).catch(() => 'denied');
  }

  private onTilt(event: DeviceOrientationEvent): void {
    if (event.beta === null || event.gamma === null) return;
    this.tiltRest ??= { beta: event.beta, gamma: event.gamma };
    const angle = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : 0;

    this.tilt = tiltAim(event.beta, event.gamma, this.tiltRest, angle);
    if (!this.drag) this.aimAt(this.tilt);
  }

  private aimAt(aim: Aim): void {
    if (reducedMotion() || this.root.dataset['leaving'] === 'true') return;
    this.aim = aim;
    this.kick();
  }

  private kick(): void {
    if (this.frame || this.disposed || (typeof document !== 'undefined' && document.hidden) || typeof requestAnimationFrame !== 'function') return;
    this.last = 0;
    this.frame = requestAnimationFrame((now) => this.step(now));
  }

  private stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /** Un pas du ressort, passé à la couche ; la boucle s'arrête quand la caméra est posée. */
  private step(now: number): void {
    const dt = this.last ? (now - this.last) / 1000 : 1 / 60;

    this.last = now;
    this.spring = springStep(this.spring, this.aim, dt);
    const settled = atRest(this.spring, this.aim);

    if (settled) this.spring = { ...this.aim, vx: 0, vy: 0 };
    this.view?.parallax(this.spring.x, this.spring.y);
    this.frame = settled ? 0 : requestAnimationFrame((later) => this.step(later));
  }

  /* ---------------------------------------------------------- « Jouer » */

  /** « Jouer » survolé ou visé : Adam se retourne vers vous, la lumière se réchauffe. */
  public ready(on: boolean): void {
    this.readied = on;
    if (on) this.root.dataset['ready'] = 'true';
    else delete this.root.dataset['ready'];
    this.view?.ready(on);
  }

  /** « Jouer » pressé : la caméra plonge vers la porte de la mairie, la scène s'efface (`TITLE_DIVE_MS`). */
  public dive(): void {
    this.root.dataset['leaving'] = 'true';
    this.view?.dive();
    if (reducedMotion()) return;
    this.aim = { x: 0, y: 0 };
    this.kick();
  }

  public dispose(): void {
    this.disposed = true;
    this.sound?.ambience(null);
    this.stop();
    this.view?.dispose();
    this.view = null;
    this.life.dispose();
  }
}
