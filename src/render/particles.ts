/**
 * Particules : copeaux de bois, éclats de pierre, étincelles de fer, gouttes
 * vertes des mutants, confettis.
 *
 * Quelques éclats projetés depuis ce qui est heurté — c'est ce qui fait
 * « sentir » le coup. La forme dit ce qu'on a touché : chaque famille
 * (`PARTICLES`, `data/artDirection.ts`) a la sienne, ses couleurs, sa durée
 * et sa gravité. Les formes sont les morceaux du sprite `particles`,
 * rastérisés une fois dans l'atlas : des sprites qui partagent une page, que
 * Pixi dessine en un lot.
 *
 * Vue en 3/4 : une particule a une position au sol et une hauteur. Elle
 * monte, retombe, se pose ; tant qu'elle est en l'air, une petite ombre
 * violette la suit au sol. Une goutte de mutant posée laisse une flaque qui
 * s'efface en 1,5 s. Un bâtiment achevé lâche un anneau de poussière.
 *
 * L'anneau d'impact est un cercle blanc au trait, qui s'ouvre et s'efface
 * en un éclair là où la flèche a touché : on voit chaque coup porter. Un
 * seul `Graphics`, redessiné tant qu'il en reste ; plafonné lui aussi.
 *
 * Plafond : `MAX_PARTICLES` vivantes. Au-delà, la plus vieille est recyclée
 * — 80 mutants touchés d'un coup ne font pas tomber l'image. Les sprites
 * viennent d'une réserve : rien n'est alloué une fois la partie lancée.
 *
 * Le hasard d'ici (`Math.random`) est de l'affichage : la simulation ne le
 * voit jamais.
 */

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { DUST, PALETTE, PARTICLES, PARTICLE_SHADOW, STROKE, hex, type ParticleShape, type ParticleStyle } from '../data/artDirection.ts';
import { SPRITES } from '../data/sprites.ts';
import { reducedMotion } from './motion.ts';
import type { SpriteLibrary } from './spriteLibrary.ts';

/** Particules vivantes au plus ; la plus vieille cède sa place. */
export const MAX_PARTICLES = 300;
const MAX_PUDDLES = 24;
const MAX_RINGS = 8;
const MAX_IMPACTS = 32;

/** Hauteur, en pixels monde, d'où part un éclat au-dessus de son sol. */
const LIFT = 10;
/** Au-delà de cette hauteur, l'ombre ne rapetisse plus. */
const SHADOW_FADE_HEIGHT = 40;
const SHADOW_ALPHA = 0.45;

/** Vitesse de rotation d'un copeau, en radians par milliseconde. */
const SPIN = 0.02;

const PUDDLE_MS = 1500;
const PUDDLE_GROW_MS = 120;

/** L'anneau de poussière : il s'élargit de 0,5 à 1,6 fois la largeur du bâtiment, et disparaît. */
const RING_MS = 450;
const RING_FROM = 0.5;
const RING_TO = 1.6;
const RING_ALPHA = 0.9;

/** L'anneau d'impact s'ouvre de `IMPACT_FROM` à `IMPACT_TO` px de rayon en `IMPACT_MS`. */
const IMPACT_MS = 120;
const IMPACT_FROM = 4;
const IMPACT_TO = 14;
const IMPACT_COLOR = hex(PALETTE.paper.base);

interface Particle {
  sprite: Sprite;
  shadow: Sprite;
  shape: ParticleShape;
  x: number;
  /** Le point du sol sous la particule, et sa hauteur au-dessus. */
  ground: number;
  z: number;
  vx: number;
  /** Dérive au sol, en profondeur : la gerbe s'étale un peu vers l'avant et l'arrière. */
  vy: number;
  /** Vitesse verticale, vers le haut. */
  vz: number;
  gravity: number;
  spin: number;
  size: number;
  /** Millisecondes restantes, et durée de vie totale. */
  life: number;
  total: number;
  /** La couleur de la flaque qu'elle laissera en se posant, ou `null`. */
  puddle: number | null;
}

interface Fade {
  sprite: Sprite;
  life: number;
  total: number;
  /** Largeur finale, en pixels monde. */
  width: number;
}

/** Un anneau d'impact : centre, et millisecondes écoulées. */
interface Impact {
  x: number;
  y: number;
  age: number;
}

export class ParticleLayer {
  /** Au-dessus de tout ce qui a des coordonnées monde. */
  public readonly container = new Container();
  /** Au sol, sous le conteneur trié : ombres, flaques, anneaux de poussière. */
  public readonly ground = new Container();

  private readonly textures: Record<ParticleShape | 'shadow' | 'puddle', Texture>;
  private readonly ringTexture: Texture;
  private readonly live: Particle[] = [];
  private readonly spare: Particle[] = [];
  private readonly puddles: Fade[] = [];
  private readonly rings: Fade[] = [];
  private readonly impactGraphics = new Graphics();
  private readonly impacts: Impact[] = [];
  /** Les couleurs d'une famille, converties une fois pour Pixi. */
  private readonly tints = new Map<ParticleStyle, readonly number[]>();
  private readonly shadowTint = hex(PARTICLE_SHADOW);
  private readonly dustTint = hex(DUST);

  public constructor(library: SpriteLibrary) {
    this.textures = {
      chip: library.part('particles', 'chip'),
      shard: library.part('particles', 'shard'),
      spark: library.part('particles', 'spark'),
      drop: library.part('particles', 'drop'),
      square: library.part('particles', 'square'),
      shadow: library.part('particles', 'shadow'),
      puddle: library.part('particles', 'puddle'),
    };
    this.ringTexture = library.part('dustRing', 'ring');
    this.container.addChild(this.impactGraphics);
    this.container.zIndex = Number.MAX_SAFE_INTEGER;
  }

  /** Projette `count` particules de la famille `style` depuis (x, y). */
  public burst(x: number, y: number, style: ParticleStyle, count = 6, speed = 0.09): void {
    // Les confettis sont coupés sous `prefers-reduced-motion` ; les éclats qui disent un coup reçu restent.
    if (style === PARTICLES.confetti && reducedMotion()) return;
    const tints = this.tintsOf(style);

    for (let i = 0; i < count; i += 1) {
      const particle = this.take(style.shape);
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      const velocity = speed * (0.5 + Math.random());
      const life = style.lifeMs * (0.8 + Math.random() * 0.4);

      particle.x = x + (Math.random() - 0.5) * 8;
      particle.ground = y + LIFT + (Math.random() - 0.5) * 6;
      particle.z = LIFT;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = (Math.random() - 0.5) * velocity * 0.4;
      particle.vz = -Math.sin(angle) * velocity;
      particle.gravity = style.gravity;
      particle.spin = style.spin ? SPIN * (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8) : 0;
      particle.size = 0.8 + Math.random() * 0.4;
      particle.life = life;
      particle.total = life;
      // Une flaque par gerbe, pas une par goutte.
      particle.puddle = i === 0 && style.puddle ? hex(style.puddle) : null;
      particle.sprite.tint = tints[Math.floor(Math.random() * tints.length)] ?? 0xffffff;
      // Un éclat part de biais sans tourner ; une étincelle est couchée dans le sens de sa course.
      particle.sprite.rotation =
        style.shape === 'spark'
          ? Math.atan2(particle.vy - particle.vz, particle.vx)
          : style.spin || style.shape === 'shard'
            ? Math.random() * Math.PI * 2
            : 0;
      particle.sprite.visible = true;
      particle.shadow.visible = true;
      this.place(particle);
    }
  }

  /** L'anneau de poussière au pied d'un bâtiment achevé, large de `width` pixels monde. */
  public dustRing(x: number, y: number, width: number): void {
    const recycled = this.rings.length >= MAX_RINGS ? this.rings.shift() : undefined;
    const sprite = recycled?.sprite ?? new Sprite(this.ringTexture);

    sprite.anchor.set(0.5);
    sprite.tint = this.dustTint;
    sprite.position.set(x, y);
    if (!recycled) this.ground.addChild(sprite);
    this.rings.push({ sprite, life: RING_MS, total: RING_MS, width });
    this.drawRing(this.rings[this.rings.length - 1]!);
  }

  /** Un anneau d'impact qui s'ouvre en (x, y). */
  public ring(x: number, y: number): void {
    if (this.impacts.length >= MAX_IMPACTS) this.impacts.shift();
    this.impacts.push({ x, y, age: 0 });
  }

  public update(deltaMs: number): void {
    for (let i = 0; i < this.live.length; i += 1) {
      const particle = this.live[i]!;

      particle.life -= deltaMs;
      if (particle.life <= 0) {
        this.release(i);
        i -= 1;
        continue;
      }
      this.move(particle, deltaMs);
      this.place(particle);
    }

    this.fadePuddles(deltaMs);
    this.fadeRings(deltaMs);
    this.drawImpacts(deltaMs);
  }

  private drawImpacts(deltaMs: number): void {
    const graphics = this.impactGraphics;

    if (this.impacts.length === 0 && graphics.visible === false) return;
    graphics.clear();

    for (let i = this.impacts.length - 1; i >= 0; i -= 1) {
      const impact = this.impacts[i]!;

      impact.age += deltaMs;

      if (impact.age >= IMPACT_MS) {
        this.impacts.splice(i, 1);
        continue;
      }

      // Il s'ouvre vite puis ralentit, et s'efface en s'ouvrant.
      const t = impact.age / IMPACT_MS;
      const open = 1 - (1 - t) * (1 - t);

      graphics
        .circle(impact.x, impact.y, IMPACT_FROM + (IMPACT_TO - IMPACT_FROM) * open)
        .stroke({ width: STROKE.width, color: IMPACT_COLOR, alpha: 1 - t });
    }
    graphics.visible = this.impacts.length > 0;
  }

  private move(particle: Particle, deltaMs: number): void {
    if (particle.z <= 0) return;

    particle.vz -= particle.gravity * deltaMs;
    particle.x += particle.vx * deltaMs;
    particle.ground += particle.vy * deltaMs;
    particle.z += particle.vz * deltaMs;

    const sprite = particle.sprite;

    if (particle.shape === 'spark') sprite.rotation = Math.atan2(particle.vy - particle.vz, particle.vx);
    else sprite.rotation += particle.spin * deltaMs;

    if (particle.z > 0) return;

    // Posée : elle ne bouge plus, son ombre disparaît sous elle, une goutte s'étale en flaque.
    particle.z = 0;
    particle.shadow.visible = false;
    if (particle.puddle !== null) this.puddle(particle.x, particle.ground, particle.puddle);
    particle.puddle = null;
  }

  private place(particle: Particle): void {
    const scale = particle.size * Math.min(1, (particle.life / particle.total) * 2);

    particle.sprite.position.set(particle.x, particle.ground - particle.z);
    particle.sprite.scale.set(scale);

    if (!particle.shadow.visible) return;

    particle.shadow.position.set(particle.x, particle.ground);
    particle.shadow.scale.set(scale * (1 - Math.min(particle.z / SHADOW_FADE_HEIGHT, 0.5)));
  }

  /** Une particule de la réserve, ou la plus vieille vivante si le plafond est atteint. */
  private take(shape: ParticleShape): Particle {
    let particle = this.live.length >= MAX_PARTICLES ? this.live.shift() : this.spare.pop();

    if (!particle) {
      const sprite = new Sprite(this.textures[shape]);
      const shadow = new Sprite(this.textures.shadow);

      sprite.anchor.set(0.5);
      shadow.anchor.set(0.5);
      shadow.tint = this.shadowTint;
      shadow.alpha = SHADOW_ALPHA;
      this.container.addChild(sprite);
      this.ground.addChild(shadow);
      particle = {
        sprite,
        shadow,
        shape,
        x: 0,
        ground: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 0,
        spin: 0,
        size: 1,
        life: 0,
        total: 1,
        puddle: null,
      };
    }

    if (particle.shape !== shape) {
      particle.shape = shape;
      particle.sprite.texture = this.textures[shape];
    }
    this.live.push(particle);
    return particle;
  }

  private release(index: number): void {
    const [particle] = this.live.splice(index, 1);

    if (!particle) return;
    particle.sprite.visible = false;
    particle.shadow.visible = false;
    this.spare.push(particle);
  }

  private tintsOf(style: ParticleStyle): readonly number[] {
    let tints = this.tints.get(style);

    if (!tints) {
      tints = style.colors.map(hex);
      this.tints.set(style, tints);
    }
    return tints;
  }

  private puddle(x: number, y: number, tint: number): void {
    const recycled = this.puddles.length >= MAX_PUDDLES ? this.puddles.shift() : undefined;
    const sprite = recycled?.sprite ?? new Sprite(this.textures.puddle);

    sprite.anchor.set(0.5);
    sprite.tint = tint;
    sprite.position.set(x, y);
    sprite.scale.set(0);
    sprite.alpha = 1;
    // Sous les ombres des gouttes encore en vol.
    if (!recycled) this.ground.addChildAt(sprite, 0);
    this.puddles.push({ sprite, life: PUDDLE_MS, total: PUDDLE_MS, width: 0 });
  }

  private fadePuddles(deltaMs: number): void {
    for (let i = this.puddles.length - 1; i >= 0; i -= 1) {
      const puddle = this.puddles[i]!;

      puddle.life -= deltaMs;
      if (puddle.life <= 0) {
        puddle.sprite.destroy();
        this.puddles.splice(i, 1);
        continue;
      }

      const age = puddle.total - puddle.life;

      puddle.sprite.scale.set(Math.min(1, age / PUDDLE_GROW_MS));
      // Pleine la première moitié, puis le fondu.
      puddle.sprite.alpha = Math.min(1, (puddle.life / puddle.total) * 2);
    }
  }

  private fadeRings(deltaMs: number): void {
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i]!;

      ring.life -= deltaMs;
      if (ring.life <= 0) {
        ring.sprite.destroy();
        this.rings.splice(i, 1);
        continue;
      }
      this.drawRing(ring);
    }
  }

  private drawRing(ring: Fade): void {
    const t = 1 - ring.life / ring.total;
    // Rapide au départ, puis il ralentit : un souffle, pas une onde régulière.
    const spread = RING_FROM + (RING_TO - RING_FROM) * (1 - (1 - t) * (1 - t));
    const scale = (ring.width * spread) / SPRITES.dustRing.width;

    ring.sprite.scale.set(scale);
    ring.sprite.alpha = RING_ALPHA * (1 - t);
  }

  public destroy(): void {
    this.container.destroy({ children: true });
    this.ground.destroy({ children: true });
  }
}
