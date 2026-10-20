/**
 * La scène vivante derrière l'écran titre : les plans de `art/titleScene.ts`
 * en `<img>` SVG, empilés dans une scène qui couvre l'écran même décalée.
 *
 * - **Parallaxe** : chaque plan glisse de `depth` fois l'amplitude selon la
 *   visée (`ui/titleMotion.ts`) — la souris, l'inclinaison du téléphone (iOS
 *   la demande au premier toucher de la scène), sinon le doigt qui glisse —,
 *   menée par un ressort amorti. La boucle ne tourne que tant que la caméra
 *   bouge, et jamais onglet caché : seuls des `transform` changent, que le
 *   compositeur applique.
 * - **Vie** : les accessoires bougent par la feuille de style (`data-motion`),
 *   transformations et opacité seulement ; l'entrée cinématique et le
 *   crépuscule aussi. Onglet caché, tout s'arrête (`data-paused`).
 * - **Toucher** : le mutant sursaute, un lampion flambe, un oiseau s'envole,
 *   le soleil palpite, Adam se retourne, l'herbe fleurit (`TitleTap`).
 * - **« Jouer »** : survolé ou visé, Adam se retourne et la lumière se
 *   réchauffe (`ready`) ; pressé, la caméra plonge vers la porte de la
 *   mairie (`dive`).
 *
 * - **Regard** : les pupilles du mutant suivent la visée de la parallaxe, puis
 *   se tournent vers Adam quand il se retourne.
 * - **Son** (`TitleSound`) : un vent doux dès le premier geste, des pépiements
 *   quand le vol d'oiseaux passe, des grillons à mesure que le crépuscule
 *   tombe ; un « pop » par fleur, le cri du mutant qui sursaute. Le moteur
 *   audio ne joue rien avant un geste, et le muet comme le volume des
 *   bruitages tiennent tout.
 *
 * Sous `prefers-reduced-motion`, ni parallaxe, ni boucles, ni plongée, ni
 * regard : la scène est un tableau, qui répond encore au toucher sans s'agiter.
 * Pur décor : `aria-hidden`, rien n'y prend le focus.
 */

import { TITLE_ART, TITLE_DOOR, TITLE_GAZE_ADAM, titleScene, type TitleLayer, type TitleMotion, type TitleProp, type TitleTap } from '../art/titleScene.ts';
import { flower, svg, type Tone } from '../data/artDirection.ts';
import { reducedMotion } from '../render/motion.ts';
import { Disposer } from './disposer.ts';
import { TITLE_MOTION, atRest, dragAim, pointerAim, springStep, tiltAim, type Aim, type Spring } from './titleMotion.ts';

/** Ce que la scène demande au son : trois effets, et l'ambiance (`null` la coupe, sinon le crépuscule, de 0 à 1). */
export interface TitleSound {
  play: (name: 'bloom' | 'squeal' | 'chirp') => void;
  ambience: (dusk: number | null) => void;
}

/** Le crépuscule et le vol d'oiseaux se relisent à ce rythme, en millisecondes : jamais dans la boucle de la caméra. */
const AMBIENCE_MS = 500;
/** Le crépuscule le plus sombre du voile (`title-dusk` du CSS) : son opacité, ramenée à 1. */
const VEIL_MAX = 0.42;
/** Le vol d'oiseaux est à l'écran entre ces deux parts de son tour (`flock` du CSS) ; il pépie de loin en loin. */
const FLOCK_SPAN = [0.05, 0.52] as const;
const CHIRP_GAP_MS = { min: 600, max: 1800 };

/** Combien de temps dure la plongée de « Jouer », en millisecondes (le CSS a la même). */
export const TITLE_DIVE_MS = 1100;

/** Les fleurs qu'un toucher fait pousser : au-delà, la plus ancienne s'en va. */
const MAX_BLOOMS = 14;
const BLOOM_TONES: readonly Tone[] = ['coral', 'yellow', 'violet', 'cyan', 'orange'];
/** Combien de temps un oiseau envolé met à revenir, en millisecondes. */
const BIRD_AWAY_MS = 7000;

/** Un SVG en `data:` URL, pour un `<img>`. */
function svgUrl(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

const pct = (value: number): string => `${Math.round(value * 10000) / 100}%`;

/** Un trajet en pourcentages de la boîte de l'accessoire : `from`, `to`, et, pour une roue, ses degrés. */
interface Course {
  from: string;
  to: string;
  turn1: string;
  turn2: string;
}

/** Freins d'Ève : elle ralentit en arrivant, repart doucement. */
const ARRIVE = 'animation-timing-function: cubic-bezier(0.3, 0.3, 0.5, 1)';
const LEAVE = 'animation-timing-function: cubic-bezier(0.5, 0, 0.7, 0.7)';

/**
 * Les animations qui suivent un trajet, écrites en valeurs : une variable CSS
 * dans une image clé empêche le compositeur de la jouer, et chaque image
 * repasserait par le recalcul des styles. Chaque accessoire a donc les siennes,
 * dans une feuille que la scène porte (`TitleArt`).
 */
const COURSES: Partial<Record<TitleMotion, (course: Course) => string>> = {
  drift: ({ from, to }) => `from{transform:translate(${from})}to{transform:translate(${to})}`,
  sunset: ({ to }) => `0%,35%{transform:none}100%{transform:translate(${to})}`,
  flock: ({ to }) => `0%{transform:none}55%,100%{transform:translate(${to})}`,
  smoke: ({ from, to }) => `0%{opacity:0;transform:translate(${from}) scale(0.45)}15%{opacity:0.95}100%{opacity:0;transform:translate(${to}) scale(1.7)}`,
  mote: ({ to }) => `0%{opacity:0;transform:none}25%,70%{opacity:0.9}100%{opacity:0;transform:translate(${to})}`,
  ride: ({ from, to }) => `0%{transform:translate(${from});${ARRIVE}}30%,45%{transform:none;${LEAVE}}100%{transform:translate(${to})}`,
  spin: ({ turn1, turn2 }) => `0%{transform:none;${ARRIVE}}30%,45%{transform:rotate(${turn1});${LEAVE}}100%{transform:rotate(${turn2})}`,
  peek: ({ to }) => `0%,4%{opacity:0;transform:translate(${to})}12%{opacity:1;transform:none}26%,40%{transform:rotate(-8deg)}52%,62%{opacity:1;transform:none}72%,100%{opacity:0;transform:translate(${to})}`,
  grip: ({ to }) => `0%,6%{transform:translate(${to})}14%,62%{transform:none}70%,100%{transform:translate(${to})}`,
};

/** Le DOM d'un accessoire, sa boîte en pourcentages de celle de son parent. */
function propElement(item: TitleProp, parent: { x: number; y: number; width: number; height: number }, sheet: string[]): HTMLElement {
  const element = item.svg ? document.createElement('img') : document.createElement('div');

  if (element instanceof HTMLImageElement) {
    element.src = svgUrl(item.svg!);
    element.alt = '';
    element.draggable = false;
    element.decoding = 'async';
  }
  element.className = 'title-prop';
  element.dataset['id'] = item.id;
  const style = element.style;

  style.left = pct((item.x - parent.x) / parent.width);
  style.top = pct((item.y - parent.y) / parent.height);
  style.width = pct(item.width / parent.width);
  style.height = pct(item.height / parent.height);
  if (item.motion) {
    element.dataset['motion'] = item.motion;
    style.setProperty('--dur', `${item.duration ?? 4}s`);
    if (item.delay) style.setProperty('--delay', `${item.delay}s`);
  }
  if (item.origin) style.transformOrigin = `${pct((item.origin[0] - item.x) / item.width)} ${pct((item.origin[1] - item.y) / item.height)}`;
  const course = item.motion ? COURSES[item.motion] : undefined;

  if (course) {
    const [fx, fy, tx, ty] = item.path ?? [0, 0, 0, 0];
    const [turn1, turn2] = item.turns ?? [0, 0];
    const name = `title-course-${sheet.length}`;
    const tag = element.tagName.toLowerCase();

    sheet.push(
      `@keyframes ${name}{${course({ from: `${pct(fx / item.width)}, ${pct(fy / item.height)}`, to: `${pct(tx / item.width)}, ${pct(ty / item.height)}`, turn1: `${turn1}deg`, turn2: `${turn1 + turn2}deg` })}}` +
        // Le nom de balise passe devant la règle générale du mouvement, mais pas devant une réaction (`[data-startled]`…).
        `${tag}.title-prop[data-id="${item.id}"]{animation-name:${name}}`,
    );
  }
  if (item.gaze) element.dataset['gaze'] = String(item.gaze);
  if (item.tap) element.dataset['tap'] = item.tap;
  if (item.clip) element.dataset['clip'] = 'true';
  if (item.view) element.dataset['view'] = item.view;
  for (const child of item.children ?? []) element.append(propElement(child, item, sheet));
  return element;
}

export class TitleArt {
  public readonly root: HTMLElement;

  private readonly camera: HTMLElement;
  private readonly layers: { element: HTMLElement; depth: number }[] = [];
  private readonly life = new Disposer();
  private readonly timers = new Set<number>();
  private spring: Spring = { x: 0, y: 0, vx: 0, vy: 0 };
  private aim: Aim = { x: 0, y: 0 };
  /** La visée de l'inclinaison, quand le téléphone en donne une : le doigt la remplace le temps qu'il glisse. */
  private tilt: Aim | null = null;
  private tiltRest: { beta: number; gamma: number } | null = null;
  private drag: { id: number; x: number; y: number } | null = null;
  private frame = 0;
  private last = 0;
  /** Le décalage en pixels du plan le plus proche, par axe : la marge de la scène au-delà de l'écran, au plus `amplitude`. */
  private reach: { x: number; y: number } = { x: TITLE_MOTION.amplitude, y: TITLE_MOTION.amplitude * TITLE_MOTION.vertical };
  private askedTilt = false;
  private disposed = false;
  private readonly sound: TitleSound | undefined;
  private readonly pupils: HTMLElement[] = [];
  /** Le regard du mutant est sur Adam (il s'est retourné, ou « Jouer » est visé), plutôt que sur la visée. */
  private watching = false;
  private nextChirp = 0;
  private watchTimer = 0;

  public constructor(sound?: TitleSound) {
    this.sound = sound;
    this.root = document.createElement('div');
    this.root.className = 'title-art';
    this.root.setAttribute('aria-hidden', 'true');
    this.camera = document.createElement('div');
    this.camera.className = 'title-camera';
    this.camera.style.transformOrigin = `${pct(TITLE_DOOR[0] / TITLE_ART.width)} ${pct(TITLE_DOOR[1] / TITLE_ART.height)}`;

    const frameBox = { x: 0, y: 0, ...TITLE_ART };
    const sheet: string[] = [];
    let order = 0;

    for (const layer of titleScene()) {
      this.camera.append(this.layerElement(layer, frameBox, order, sheet));
      order += 1;
      if (layer.veil) {
        const veil = document.createElement('div');

        veil.className = 'title-veil';
        this.camera.append(veil);
      }
    }
    const warmth = document.createElement('div');

    warmth.className = 'title-warmth';
    this.camera.append(warmth);
    const courses = document.createElement('style');

    courses.textContent = sheet.join('');
    this.root.append(courses, this.camera);
    this.pupils.push(...this.root.querySelectorAll<HTMLElement>('[data-gaze]'));
    this.wire();
    this.sound?.ambience(0);
  }

  private layerElement(layer: TitleLayer, frameBox: { x: number; y: number; width: number; height: number }, order: number, sheet: string[]): HTMLElement {
    const element = document.createElement('div');
    const plane = document.createElement('div');

    element.className = 'title-plane';
    element.dataset['layer'] = layer.id;
    plane.className = 'title-plane-in';
    // L'entrée : les plans se posent l'un après l'autre, du fond vers l'avant, de plus haut s'ils sont plus près.
    plane.style.setProperty('--order', String(order));
    plane.style.setProperty('--rise', `${Math.round(10 + layer.depth * 70)}px`);
    for (const item of layer.props) plane.append(propElement(item, frameBox, sheet));
    element.append(plane);
    this.layers.push({ element, depth: layer.depth });
    return element;
  }

  private wire(): void {
    const { life, root } = this;

    life.listen(window, 'pointermove', (event) => {
      if (event.pointerType === 'mouse') this.aimAt(pointerAim(event.clientX, event.clientY, window.innerWidth, window.innerHeight));
      else if (this.drag && event.pointerId === this.drag.id) this.aimAt(dragAim(event.clientX - this.drag.x, event.clientY - this.drag.y, window.innerWidth, window.innerHeight));
    });
    life.listen(document, 'mouseleave', () => this.aimAt({ x: 0, y: 0 }));
    life.listen(root, 'pointerdown', (event) => {
      this.askTilt();
      if (event.pointerType !== 'mouse') this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      const target = (event.target as Element | null)?.closest<HTMLElement>('[data-tap]');

      if (target) this.tap(target, event);
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
      root.dataset['paused'] = String(document.hidden);
      if (document.hidden) this.stop();
      else this.kick();
    });
    if (this.sound) life.interval(() => this.tune(), AMBIENCE_MS);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => this.measure());

      observer.observe(root);
      life.add(() => observer.disconnect());
    }
  }

  /** Relit le crépuscule (le voile) et le vol d'oiseaux : l'ambiance s'y accorde, et les oiseaux pépient. */
  private tune(): void {
    if (!this.sound || document.hidden || typeof getComputedStyle !== 'function') return;
    const veil = this.root.querySelector('.title-veil');
    const opacity = veil ? Number.parseFloat(getComputedStyle(veil).opacity) : 0;

    this.sound.ambience(Number.isFinite(opacity) ? Math.min(1, opacity / VEIL_MAX) : 0);
    const flock = this.find('flock')?.getAnimations?.()[0];
    const timing = flock?.effect?.getComputedTiming();
    const now = performance.now();

    if (timing?.progress == null || timing.progress < FLOCK_SPAN[0] || timing.progress > FLOCK_SPAN[1] || now < this.nextChirp) return;
    this.sound.play('chirp');
    this.nextChirp = now + CHIRP_GAP_MS.min + Math.random() * (CHIRP_GAP_MS.max - CHIRP_GAP_MS.min);
  }

  /** Les pupilles du mutant : vers la visée de la parallaxe, ou vers Adam quand il nous regarde. Posées au centre sous `prefers-reduced-motion`. */
  private look(): void {
    const still = reducedMotion();
    const [x, y] = this.watching ? TITLE_GAZE_ADAM : [this.spring.x, this.spring.y];

    for (const pupil of this.pupils) {
      const reach = Number(pupil.dataset['gaze']) * 100;

      pupil.style.transform = still ? '' : `translate(${(x * reach).toFixed(1)}%, ${(y * reach).toFixed(1)}%)`;
    }
  }

  /** La marge de la scène au-delà de l'écran : lue au redimensionnement, jamais dans la boucle. */
  private measure(): void {
    const stage = this.camera.getBoundingClientRect();
    const view = this.root.getBoundingClientRect();
    const { amplitude, vertical } = TITLE_MOTION;

    if (stage.width <= 0 || view.width <= 0) return;
    this.reach = {
      x: Math.max(0, Math.min(amplitude, (stage.width - view.width) / 2 - 2)),
      y: Math.max(0, Math.min(amplitude * vertical, (stage.height - view.height) / 2 - 2)),
    };
    this.kick();
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

  /** Un pas du ressort, puis le décalage de chaque plan ; la boucle s'arrête quand la caméra est posée. */
  private step(now: number): void {
    const dt = this.last ? (now - this.last) / 1000 : 1 / 60;

    this.last = now;
    this.spring = springStep(this.spring, this.aim, dt);
    const settled = atRest(this.spring, this.aim);

    if (settled) this.spring = { ...this.aim, vx: 0, vy: 0 };
    for (const { element, depth } of this.layers) {
      const x = -this.spring.x * this.reach.x * depth;
      const y = -this.spring.y * this.reach.y * depth;

      element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    }
    this.look();
    this.frame = settled ? 0 : requestAnimationFrame((later) => this.step(later));
  }

  /* ------------------------------------------------------------- toucher */

  private tap(target: HTMLElement, event: PointerEvent): void {
    const kind = target.dataset['tap'] as TitleTap;

    switch (kind) {
      case 'mutant':
        this.pulse(this.find('mutant'), 'startled', 1600);
        this.pulse(this.find('fingers-hand'), 'startled', 1600);
        this.sound?.play('squeal');
        return;
      case 'lantern':
        target.dataset['lit'] = 'true';
        this.pulse(target, 'hit', 1400);
        return;
      case 'sun':
        this.pulse(target, 'hit', 900);
        return;
      case 'adam':
        this.pulse(this.root, 'turned', 1800, 'turn');
        this.watchAdam(1800);
        return;
      case 'bird':
        if (target.dataset['flown'] === 'true') return;
        this.pulse(target, 'flown', BIRD_AWAY_MS);
        this.sound?.play('chirp');
        return;
      case 'ground':
        this.bloom(target, event);
        return;
    }
  }

  private find(id: string): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`[data-id="${id}"]`);
  }

  /** Le mutant regarde Adam le temps de `ms`, puis revient à la visée. */
  private watchAdam(ms: number): void {
    this.watching = true;
    this.look();
    window.clearTimeout(this.watchTimer);
    this.watchTimer = window.setTimeout(() => {
      this.timers.delete(this.watchTimer);
      this.watching = this.root.dataset['ready'] === 'true';
      this.look();
    }, ms);
    this.timers.add(this.watchTimer);
  }

  /** Pose `data-<name>` le temps de `ms` : le CSS en fait une réaction ; un second toucher la relance. */
  private pulse(element: HTMLElement | null, name: string, ms: number, value = 'true'): void {
    if (!element) return;
    delete element.dataset[name];
    // Relire la mise en page relance l'animation d'un toucher à l'autre ; seulement sur un geste, jamais dans la boucle.
    void element.offsetWidth;
    element.dataset[name] = value;
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      delete element.dataset[name];
    }, ms);

    this.timers.add(timer);
  }

  /** Une fleur qui pousse là où le doigt a touché l'herbe. */
  private bloom(ground: HTMLElement, event: PointerEvent): void {
    const box = ground.getBoundingClientRect();

    if (box.width <= 0 || box.height <= 0) return;
    const tone = BLOOM_TONES[Math.floor(Math.random() * BLOOM_TONES.length)]!;
    const size = 1.6 + Math.random() * 1.2;
    const image = document.createElement('img');
    const w = 7 * size;

    image.className = 'title-bloom';
    image.src = svgUrl(svg(w, w * 1.3, flower(w / 2, w * 0.4, tone, size)));
    image.alt = '';
    image.draggable = false;
    // L'herbe est un accessoire du plan : la fleur s'y pose en pourcentages de sa boîte, et glisse avec lui.
    image.style.left = `calc(${ground.style.left} + ${ground.style.width} * ${(event.clientX - box.left) / box.width})`;
    image.style.top = `calc(${ground.style.top} + ${ground.style.height} * ${(event.clientY - box.top) / box.height})`;
    image.style.width = pct(w / TITLE_ART.width);
    ground.after(image);
    const blooms = this.root.querySelectorAll('.title-bloom');

    if (blooms.length > MAX_BLOOMS) blooms[0]!.remove();
    this.sound?.play('bloom');
  }

  /* ---------------------------------------------------------- « Jouer » */

  /** « Jouer » survolé ou visé : Adam se retourne vers vous, la lumière se réchauffe. */
  public ready(on: boolean): void {
    if (on) this.root.dataset['ready'] = 'true';
    else delete this.root.dataset['ready'];
    this.watching = on || this.root.dataset['turned'] !== undefined;
    this.look();
  }

  /** « Jouer » pressé : la caméra plonge vers la porte de la mairie, la scène s'efface (`TITLE_DIVE_MS`). */
  public dive(): void {
    if (reducedMotion()) return;
    this.root.dataset['leaving'] = 'true';
    this.aim = { x: 0, y: 0 };
    this.kick();
  }

  public dispose(): void {
    this.disposed = true;
    this.sound?.ambience(null);
    this.stop();
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.life.dispose();
  }
}
