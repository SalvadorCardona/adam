/**
 * La scène vivante de l'écran titre, peinte par Pixi : les plans et les
 * accessoires d'`art/titleScene.ts` en sprites d'un seul atlas, leurs
 * mouvements (`render/titleMoves.ts`) échantillonnés à chaque image.
 *
 * Pourquoi pas le DOM : en `<img>` animés par la feuille de style, chaque
 * image repassait par le recalcul des styles d'une soixantaine d'éléments et
 * par la composition d'autant de calques — un téléphone moyen perdait des
 * images dès que le doigt faisait glisser la scène. Ici, un canvas, un atlas,
 * un appel de dessin ou presque ; le DOM ne garde que la surface qui reçoit
 * les gestes (`ui/titleArt.ts`), qui mène cette couche par `TitleView`.
 *
 * La scène couvre l'écran avec une marge (`BLEED`) où les plans glissent sans
 * montrer un bord ; la caméra entre du ciel, plonge vers la porte de la
 * mairie au « Jouer ». Le temps de la scène ne court que quand elle est
 * dessinée : onglet caché, tout s'arrête. Sous `prefers-reduced-motion`, un
 * tableau posé, qui répond encore au toucher sans s'agiter.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { TITLE_ART, TITLE_DOOR, titleScene, type TitleProp } from '../art/titleScene.ts';
import { PALETTE, flower, hex, svg, type Color, type Tone } from '../data/artDirection.ts';
import { TITLE_MOTION } from '../ui/titleMotion.ts';
import type { TitleHit, TitleView } from '../ui/titleArt.ts';
import { reducedMotion } from './motion.ts';
import { SpriteLibrary, type SvgSource } from './spriteLibrary.ts';
import {
  BLOOM,
  CAMERA_IN,
  DIVE,
  DIVE_FADE,
  DUSK,
  DUSK_MAX,
  FLOCK_SPAN,
  GAZE_MS,
  REACTION_HOLD,
  WARMTH,
  motionTrack,
  planeIn,
  progress,
  pupilShift,
  reactionTrack,
  restOf,
  sample,
  type Pose,
  type TitleReaction,
  type Track,
} from './titleMoves.ts';

/** La marge de la scène au-delà de l'écran, en pixels CSS : les plans y glissent sans jamais montrer un bord. */
const BLEED = 36;
/** La rastérisation suit l'écran, sans dépasser : au-delà, la mémoire d'un téléphone paie plus que l'œil ne gagne. */
const MAX_RESOLUTION = 2;
/** L'image la plus longue qu'on intègre d'un coup : un onglet qui revient reprend où il s'était arrêté. */
const MAX_FRAME_MS = 100;
/** Les fleurs qu'un toucher fait pousser : au-delà, la plus ancienne s'en va. */
const MAX_BLOOMS = 14;
const BLOOM_TONES: readonly Tone[] = ['coral', 'yellow', 'violet', 'cyan', 'orange'];
/** La taille des fleurs rastérisées ; chaque fleur poussée s'y rapporte. */
const BLOOM_SIZE = 2.2;
/** Sous la réduction des animations, la scène s'efface sans plonger. */
const FADE_MS = 380;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Un accessoire posé : son conteneur, son pivot dans sa boîte, sa place de repos, ce qui l'anime. */
interface Node {
  readonly prop: TitleProp;
  readonly container: Container;
  /** La place du pivot dans la boîte du parent, en pixels du cadre. */
  readonly baseX: number;
  readonly baseY: number;
  readonly rest: Pose;
  motion: Track | null;
  /** Quand son mouvement a commencé son premier tour (horloge de la scène) : une réaction finie le relance. */
  epoch: number;
  reaction: { track: Track; start: number; until: number } | null;
}

/** Ce qui se rastérise : chaque accessoire dessiné, sous son id, et les fleurs à faire pousser. */
function sources(): SvgSource[] {
  const out: SvgSource[] = [];
  const walk = (prop: TitleProp): void => {
    if (prop.svg) out.push({ key: prop.id, svg: prop.svg, width: prop.width, height: prop.height });
    for (const child of prop.children ?? []) walk(child);
  };

  for (const layer of titleScene()) for (const prop of layer.props) walk(prop);
  for (const tone of BLOOM_TONES) {
    const w = 7 * BLOOM_SIZE;

    out.push({ key: `bloom.${tone}`, svg: svg(w, w * 1.3, flower(w / 2, w * 0.4, tone, BLOOM_SIZE)), width: w, height: w * 1.3 });
  }
  return out;
}

/** La largeur de la scène à l'écran, en pixels CSS : l'écran et sa marge, au format du cadre. */
function sceneWidth(width: number, height: number): number {
  return Math.max(width + 2 * BLEED, ((height + 2 * BLEED) * TITLE_ART.width) / TITLE_ART.height);
}

export class TitleStage implements TitleView {
  public readonly container = new Container();

  private readonly library: SpriteLibrary;
  private readonly camera = new Container();
  private readonly planes: { plane: Container; rise: Container; track: Track; depth: number }[] = [];
  private readonly nodes = new Map<string, Node>();
  /** Ce qui bouge à chaque image : les accessoires animés, et ceux qui réagissent. */
  private readonly moving = new Set<Node>();
  /** Ce qui réagit au toucher, dans l'ordre où c'est peint : le dernier est devant. */
  private readonly tappable: Node[] = [];
  private readonly veils: Graphics[] = [];
  private readonly warmth: Graphics;
  private readonly blooms: { container: Container; born: number }[] = [];
  /** Les pupilles du mutant, et où leur regard en est (pixels du cadre) : elles le rejoignent en douceur. */
  private readonly pupils: { node: Node; x: number; y: number }[] = [];
  private readonly still: boolean;
  private clock = 0;
  private aim = { x: 0, y: 0 };
  private scale = 1;
  private reach = { x: 0, y: 0 };
  private turned = -Infinity;
  private warm = 0;
  private warmTarget = 0;
  private leaving: number | null = null;
  private disposed = false;

  private constructor(library: SpriteLibrary) {
    this.library = library;
    this.still = reducedMotion();
    this.camera.pivot.set(TITLE_DOOR[0], TITLE_DOOR[1]);
    this.container.addChild(this.camera);

    let order = 0;

    for (const layer of titleScene()) {
      const plane = new Container();
      const rise = new Container();

      plane.addChild(rise);
      for (const prop of layer.props) rise.addChild(this.node(prop, 0, 0));
      this.camera.addChild(plane);
      // L'entrée : les plans se posent l'un après l'autre, du fond vers l'avant, de plus haut s'ils sont plus près.
      this.planes.push({ plane, rise, depth: layer.depth, track: planeIn(order, Math.round(10 + layer.depth * 70)) });
      order += 1;
      if (layer.veil) {
        const veil = this.wash(PALETTE.ink.base);

        this.veils.push(veil);
        this.camera.addChild(veil);
      }
    }
    this.warmth = this.wash(PALETTE.yellow.light);
    this.camera.addChild(this.warmth);
    this.update(0, 0, 0);
  }

  /** Rastérise la scène à la taille de cet écran, puis la pose. */
  public static async create(width: number, height: number): Promise<TitleStage> {
    const density = (sceneWidth(width, height) / TITLE_ART.width) * (window.devicePixelRatio || 1);
    const library = await SpriteLibrary.of(sources(), Math.min(MAX_RESOLUTION, Math.max(1, density)));

    return new TitleStage(library);
  }

  /** Un aplat qui couvre le cadre : le voile du crépuscule, la lumière chaude de « Jouer ». */
  private wash(color: Color): Graphics {
    const wash = new Graphics().rect(0, 0, TITLE_ART.width, TITLE_ART.height).fill(hex(color));

    wash.alpha = 0;
    return wash;
  }

  /** Le conteneur d'un accessoire et de ce qu'il emmène, posé dans la boîte de son parent (px, py). */
  private node(prop: TitleProp, px: number, py: number): Container {
    const container = new Container();
    const [ox, oy] = prop.origin ? [prop.origin[0] - prop.x, prop.origin[1] - prop.y] : [prop.width / 2, prop.height / 2];

    container.pivot.set(ox, oy);
    if (prop.svg) container.addChild(new Sprite(this.library.texture(prop.id)));
    for (const child of prop.children ?? []) container.addChild(this.node(child, prop.x, prop.y));
    if (prop.clip) {
      const mask = new Graphics().rect(0, 0, prop.width, prop.height).fill(0xffffff);

      container.addChild(mask);
      container.mask = mask;
    }
    const node: Node = {
      prop,
      container,
      baseX: prop.x - px + ox,
      baseY: prop.y - py + oy,
      // Réduire les animations : les lucioles restent allumées, posées.
      rest: this.still && prop.motion === 'mote' ? { ...restOf(prop), alpha: 0.8 } : restOf(prop),
      motion: this.still ? null : motionTrack(prop),
      epoch: 0,
      reaction: null,
    };

    this.nodes.set(prop.id, node);
    if (prop.tap) this.tappable.push(node);
    if (prop.gaze) this.pupils.push({ node, x: 0, y: 0 });
    if (node.motion) this.moving.add(node);
    this.pose(node, node.rest);
    return container;
  }

  private pose(node: Node, pose: Pose): void {
    const { container } = node;

    container.position.set(node.baseX + pose.x, node.baseY + pose.y);
    container.rotation = toRadians(pose.rotation);
    // Le cisaillement de Pixi tourne un axe ; celui du CSS le penche : l'échelle de l'autre axe rattrape l'écart.
    container.skew.set(toRadians(pose.skewX), toRadians(pose.skewY));
    container.scale.set(pose.scaleX / Math.cos(toRadians(pose.skewY)), pose.scaleY / Math.cos(toRadians(pose.skewX)));
    container.alpha = pose.alpha;
  }

  /** Une image : la scène couvre l'écran (`width` × `height`, pixels CSS), chaque plan à sa place, chaque accessoire à son instant. */
  public update(deltaMS: number, width: number, height: number): void {
    if (this.disposed) return;
    this.clock += Math.min(deltaMS, MAX_FRAME_MS);
    const now = this.clock;
    const wide = sceneWidth(width, height);

    this.scale = wide / TITLE_ART.width;
    this.reach = {
      x: Math.max(0, Math.min(TITLE_MOTION.amplitude, (wide - width) / 2 - 2)),
      y: Math.max(0, Math.min(TITLE_MOTION.amplitude * TITLE_MOTION.vertical, (wide * (TITLE_ART.height / TITLE_ART.width) - height) / 2 - 2)),
    };
    this.container.position.set(width / 2, height / 2);
    this.container.scale.set(this.scale);
    this.moveCamera(now);

    for (const { plane, rise, track, depth } of this.planes) {
      plane.position.set((-this.aim.x * this.reach.x * depth) / this.scale, (-this.aim.y * this.reach.y * depth) / this.scale);
      if (this.still) continue;
      const entrance = sample(track, now);

      rise.position.y = entrance.y / this.scale;
      rise.alpha = entrance.alpha;
    }
    for (const node of this.moving) this.step(node, now);

    const front = this.turned > now || this.warmTarget > 0;

    this.nodes.get('adam-back')!.container.visible = !front;
    this.nodes.get('adam-front')!.container.visible = front;
    this.look(front, deltaMS);
    this.warm = Math.max(0, Math.min(1, this.warm + (Math.sign(this.warmTarget - this.warm) * deltaMS) / WARMTH.ms));
    this.warmth.alpha = this.still ? this.warmTarget * WARMTH.alpha : this.warm * WARMTH.alpha;
    if (!this.still) for (const veil of this.veils) veil.alpha = sample(DUSK, now).alpha;
    for (const { container, born } of this.blooms) container.scale.set(this.still ? 1 : sample(BLOOM, now - born).scaleX);
  }

  /** Les pupilles du mutant : vers la visée, ou vers Adam quand il nous regarde ; au centre sous la réduction des animations. */
  private look(watching: boolean, deltaMS: number): void {
    const ease = this.still ? 1 : 1 - Math.exp(-Math.min(deltaMS, MAX_FRAME_MS) / (GAZE_MS / 3));

    for (const pupil of this.pupils) {
      const goal = this.still ? { x: 0, y: 0 } : pupilShift(pupil.node.prop, this.aim, watching);

      pupil.x += (goal.x - pupil.x) * ease;
      pupil.y += (goal.y - pupil.y) * ease;
      this.pose(pupil.node, { ...pupil.node.rest, x: pupil.x, y: pupil.y });
    }
  }

  /** L'entrée du ciel, la plongée vers la porte au « Jouer » : la caméra tourne autour de la porte de la mairie. */
  private moveCamera(now: number): void {
    const { camera, container } = this;
    const [doorX, doorY] = TITLE_DOOR;
    let pose = this.still ? null : sample(CAMERA_IN, now);

    container.alpha = 1;
    if (this.leaving !== null) {
      const since = now - this.leaving;

      if (this.still) container.alpha = Math.max(0, 1 - since / FADE_MS);
      else {
        pose = sample(DIVE, since);
        container.alpha = sample(DIVE_FADE, since).alpha;
      }
    }
    camera.position.set(doorX - TITLE_ART.width / 2 + (pose?.x ?? 0), doorY - TITLE_ART.height / 2 + (pose?.y ?? 0));
    camera.scale.set(pose?.scaleX ?? 1, pose?.scaleY ?? 1);
  }

  /** La pose d'un accessoire animé : sa réaction tant qu'elle tient, sinon son mouvement. */
  private step(node: Node, now: number): void {
    const { reaction } = node;

    if (reaction && now >= reaction.until) {
      node.reaction = null;
      node.epoch = now;
    }
    if (node.reaction) this.pose(node, sample(node.reaction.track, now - node.reaction.start));
    else if (node.motion) this.pose(node, sample(node.motion, now - node.epoch));
    else {
      this.pose(node, node.rest);
      this.moving.delete(node);
    }
  }

  /* --------------------------------------------------------- TitleView */

  public parallax(x: number, y: number): void {
    this.aim = { x, y };
  }

  /** L'accessoire qui réagit sous ce point de l'écran, le plus en avant d'abord ; ce qu'un groupe rogne ne se touche pas. */
  public hit(x: number, y: number): TitleHit | null {
    for (let i = this.tappable.length - 1; i >= 0; i -= 1) {
      const node = this.tappable[i]!;

      if (!node.container.visible || !this.inside(node, x, y)) continue;
      return { tap: node.prop.tap!, id: node.prop.id };
    }
    return null;
  }

  private inside(node: Node, x: number, y: number): boolean {
    const local = node.container.toLocal({ x, y });

    if (local.x < 0 || local.y < 0 || local.x > node.prop.width || local.y > node.prop.height) return false;
    for (let parent = node.container.parent; parent && parent !== this.camera; parent = parent.parent) {
      if (!parent.mask) continue;
      const clip = parent.toLocal({ x, y });
      const box = [...this.nodes.values()].find((other) => other.container === parent)!.prop;

      if (clip.x < 0 || clip.y < 0 || clip.x > box.width || clip.y > box.height) return false;
    }
    return true;
  }

  public react(hit: TitleHit, x: number, y: number): boolean {
    const target = this.nodes.get(hit.id);

    if (!target) return false;
    switch (hit.tap) {
      case 'mutant':
        this.play('mutant', 'startle');
        this.play('fingers-hand', 'startle');
        return true;
      case 'lantern': {
        const glow = this.nodes.get(`${hit.id}-glow`);

        // Allumée une fois pour toutes : elle ne rejoue plus son allumage, et reste à son éclat de repos.
        if (glow) {
          glow.motion = null;
          this.play(glow.prop.id, 'flare');
        }
        this.play(hit.id, 'swingHit');
        return true;
      }
      case 'sun':
        this.play(hit.id, 'boop');
        return true;
      case 'adam':
        this.turned = this.clock + REACTION_HOLD.hop;
        this.play('adam', 'hop');
        return true;
      case 'bird':
        if (target.reaction) return false;
        this.play(hit.id, 'flyOff');
        return true;
      case 'ground':
        this.bloom(target, x, y);
        return true;
    }
  }

  /** Le crépuscule du voile, ramené à 1, et le vol d'oiseaux à l'écran : l'ambiance sonore les suit. */
  public ambient(): { dusk: number; flock: boolean } {
    if (this.still) return { dusk: 0, flock: false };
    const flock = this.nodes.get('flock');
    const turn = flock?.motion ? progress(flock.motion, this.clock - flock.epoch) : null;

    return {
      dusk: Math.min(1, sample(DUSK, this.clock).alpha / DUSK_MAX),
      flock: turn !== null && turn >= FLOCK_SPAN[0] && turn <= FLOCK_SPAN[1],
    };
  }

  /** Une réaction jouée sur un accessoire, à la place de son mouvement, le temps qu'elle tient ; un second toucher la relance. */
  private play(id: string, reaction: TitleReaction): void {
    const node = this.nodes.get(id);

    if (!node) return;
    // Réduire les animations : rien ne s'agite, mais l'oiseau envolé disparaît le temps de revenir.
    if (this.still && reaction !== 'flyOff') return;
    const track = reactionTrack(reaction, node.prop);

    node.reaction = { track: this.still ? { ...track, keyframes: [], base: { ...track.base, alpha: 0 } } : track, start: this.clock, until: this.clock + REACTION_HOLD[reaction] };
    this.moving.add(node);
  }

  /** Une fleur qui pousse là où le doigt a touché l'herbe ; elle glisse avec son plan. */
  private bloom(ground: Node, x: number, y: number): void {
    const local = ground.container.toLocal({ x, y });
    const tone = BLOOM_TONES[Math.floor(Math.random() * BLOOM_TONES.length)]!;
    const size = 1.6 + Math.random() * 1.2;
    const w = 7 * size;
    const flower = new Sprite(this.library.texture(`bloom.${tone}`));
    const bloom = new Container();

    flower.scale.set(size / BLOOM_SIZE);
    // Posée par le pied de sa tige, aux neuf dixièmes de sa hauteur, d'où elle sort de terre.
    flower.position.set(-w / 2, -w * 1.3 * 0.9);
    bloom.addChild(flower);
    bloom.position.set(ground.prop.x + local.x, ground.prop.y + local.y + w * 0.39);
    const parent = ground.container.parent!;

    parent.addChildAt(bloom, parent.getChildIndex(ground.container) + 1);
    this.blooms.push({ container: bloom, born: this.clock });
    if (this.blooms.length > MAX_BLOOMS) this.blooms.shift()!.container.destroy({ children: true });
  }

  public ready(on: boolean): void {
    this.warmTarget = on ? 1 : 0;
  }

  public dive(): void {
    this.leaving ??= this.clock;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.container.destroy({ children: true });
    this.library.destroy();
  }

  public get destroyed(): boolean {
    return this.disposed;
  }
}
