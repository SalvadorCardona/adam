/**
 * La nuit : un seul voile, éclairci par les lumières, appliqué une fois.
 *
 * L'heure se lit dans la simulation (`world.clock()`, `sim/dayNight.ts`) ;
 * ici, on ne fait qu'appliquer sa part de nuit (`darkness`, de 0 à 1).
 *
 * - **Le voile** : une texture de lumière, rendue à chaque image de nuit,
 *   puis posée en un seul sprite en fusion `multiply`, centré sur Adam. Elle
 *   est remplie de l'indigo de `NIGHT_TINT.veil` — la carte vire au bleu nuit
 *   sans jamais tomber au noir. Son alpha suit la part de nuit, ce qui fond
 *   la teinte au crépuscule et à l'aube.
 * - **Les lumières** : dessinées dans cette même texture, en fusion `max`.
 *   La vision d'Adam (un disque lavande), une lampe jaune sur chaque
 *   bâtiment fini — les fenêtres et les lampions de la colonie — et un halo
 *   vert fluo autour de chaque mutant, famille réservée : c'est un signal de
 *   danger. Chaque lumière éclaircit le voile jusqu'à son plafond, jamais
 *   au-delà : deux lampes qui se recouvrent n'éclairent pas plus qu'une, et
 *   la carte multipliée ne dépasse jamais sa couleur de jour. Une ville de
 *   vingt bâtiments n'est pas plus blanche qu'une maison seule.
 *
 * Pas de filtre : une texture en basse définition (un texel pour `TEXEL`
 * pixels monde), quelques dizaines de sprites dedans, un quad multiplié.
 * Les lumières sont des coussins de trois anneaux bakés une fois, à bord
 * net. De jour, le conteneur est invisible et ne coûte rien.
 */

import { Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { TILE_SIZE } from '../core/grid.ts';
import { PALETTE, hex } from '../data/artDirection.ts';
import { NIGHT_TINT } from '../data/dayNight.ts';
import { darkness } from '../sim/dayNight.ts';
import type { World } from '../sim/world.ts';

/** Pixels monde par texel de la texture de lumière : elle est agrandie d'autant. */
const TEXEL = 8;

/** Demi-côté du voile, en pixels monde : de quoi couvrir un grand écran, même caméra en avance. */
const VEIL_HALF = 2560;

/** Côté de la texture de lumière, en texels. */
const VEIL_TEXELS = (VEIL_HALF * 2) / TEXEL;

/** Anneaux du bord de la vision, du voile à la lavande : un fondu en aplats, pas un dégradé. */
const VISION_RINGS = 4;

/** Anneaux d'une lampe ou d'un halo : des coussins de lumière, comme les arbres en coussins. */
const LIGHT_RINGS = 3;

/** Rayon, en pixels de texture, d'une lumière bakée : assez pour garder ses anneaux nets. */
const LIGHT_PIXELS = 32;

/** La lueur d'un éclat d'étoile filante, en tuiles. */
const STAR_GLOW_TILES = 1.4;

/** Le halo d'un mutant est centré sur son corps, pas sur ses pieds. */
const HALO_RISE = 12;

export class NightLayer {
  public readonly container = new Container();

  private readonly renderer: Renderer;
  private readonly target: RenderTexture;
  private readonly veil: Sprite;
  /** Ce qu'on rend dans la texture de lumière : le fond indigo, puis les lumières en `max`. */
  private readonly scene = new Container();
  private readonly lights = new Container();
  private readonly vision: Sprite;
  private readonly lampTexture: Texture;
  private readonly haloTexture: Texture;
  private readonly lamps = new Container();
  private readonly halos = new Container();
  private readonly world: World;

  public constructor(renderer: Renderer, world: World) {
    this.renderer = renderer;
    this.world = world;

    const veil = mix(hex(PALETTE.paper.base), hex(NIGHT_TINT.veil), NIGHT_TINT.veilStrength);

    this.target = RenderTexture.create({ width: VEIL_TEXELS, height: VEIL_TEXELS, resolution: 1 });
    this.veil = new Sprite(this.target);
    this.veil.scale.set(TEXEL);
    this.veil.blendMode = 'multiply';

    const ground = new Sprite(Texture.WHITE);

    ground.width = VEIL_TEXELS;
    ground.height = VEIL_TEXELS;
    ground.tint = veil;

    this.vision = new Sprite(bakeVision(renderer, veil));
    this.vision.anchor.set(0.5);
    this.lampTexture = bakeLight(renderer, veil, hex(NIGHT_TINT.lamp), NIGHT_TINT.lampCeiling);
    this.haloTexture = bakeLight(renderer, veil, hex(NIGHT_TINT.halo), NIGHT_TINT.haloCeiling);

    this.lights.blendMode = 'max';
    this.lights.addChild(this.vision, this.lamps, this.halos);
    this.scene.addChild(ground, this.lights);

    this.container.addChild(this.veil);
    this.container.visible = false;
  }

  public update(alpha: number): void {
    const clock = this.world.clock();
    const dark = clock ? darkness(clock) : 0;

    this.container.visible = dark > 0;
    if (dark <= 0) return;

    const { player } = this.world;
    const x = player.prevX + (player.x - player.prevX) * alpha;
    const y = player.prevY + (player.y - player.prevY) * alpha;
    // L'origine du voile tombe sur un texel entier : les lampes ne scintillent pas quand Adam marche.
    const left = Math.round((x - VEIL_HALF) / TEXEL) * TEXEL;
    const top = Math.round((y - VEIL_HALF) / TEXEL) * TEXEL;

    this.veil.alpha = dark;
    this.veil.position.set(left, top);
    this.vision.position.set((x - left) / TEXEL, (y - top) / TEXEL);

    let lamps = 0;

    for (const entity of this.world.entities.values()) {
      if (entity.kind === 'site') continue;

      const radius = (Math.max(entity.width, entity.height) / 2 + NIGHT_TINT.lampRadius) * TILE_SIZE;

      place(
        this.lamps,
        this.lampTexture,
        lamps++,
        ((entity.tx + entity.width / 2) * TILE_SIZE - left) / TEXEL,
        ((entity.ty + entity.height / 2) * TILE_SIZE - top) / TEXEL,
        radius / TEXEL,
      );
    }

    // Un éclat d'étoile filante tombé au sol : une petite lampe jaune, jusqu'à ce qu'on le ramasse.
    for (const mobile of this.world.mobiles.values()) {
      if (mobile.kind !== 'pickup' || !mobile.star) continue;
      place(this.lamps, this.lampTexture, lamps++, (mobile.x - left) / TEXEL, (mobile.y - top) / TEXEL, (STAR_GLOW_TILES * TILE_SIZE) / TEXEL);
    }

    let halos = 0;

    for (const mobile of this.world.mobiles.values()) {
      // Le brouillard de guerre : un halo trahirait un mutant qu'on ne voit pas.
      if (mobile.kind !== 'mutant' || !this.world.sees(mobile.x, mobile.y)) continue;

      place(
        this.halos,
        this.haloTexture,
        halos++,
        (mobile.prevX + (mobile.x - mobile.prevX) * alpha - left) / TEXEL,
        (mobile.prevY + (mobile.y - mobile.prevY) * alpha - HALO_RISE - top) / TEXEL,
        (NIGHT_TINT.haloRadius * TILE_SIZE) / TEXEL,
      );
    }

    hideFrom(this.lamps, lamps);
    hideFrom(this.halos, halos);

    this.renderer.render({ container: this.scene, target: this.target, clear: true });
  }

  public destroy(): void {
    this.target.destroy(true);
    this.vision.texture.destroy(true);
    this.lampTexture.destroy(true);
    this.haloTexture.destroy(true);
    this.scene.destroy({ children: true });
    this.container.destroy({ children: true });
  }
}

/** Pose la lumière numéro `index` du groupe, en la créant au besoin : les sprites sont recyclés. */
function place(group: Container, texture: Texture, index: number, x: number, y: number, radius: number): void {
  let sprite = group.children[index] as Sprite | undefined;

  if (!sprite) {
    sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    group.addChild(sprite);
  }

  sprite.visible = true;
  sprite.position.set(x, y);
  sprite.scale.set(radius / LIGHT_PIXELS);
}

function hideFrom(group: Container, count: number): void {
  for (let i = count; i < group.children.length; i += 1) group.children[i]!.visible = false;
}

/**
 * La vision d'Adam, en texels : quelques anneaux qui passent du voile à la
 * lavande de `vision`, du bord vers le centre.
 */
function bakeVision(renderer: Renderer, veil: number): Texture {
  const radius = (NIGHT_TINT.visionRadius * TILE_SIZE) / TEXEL;
  const outer = radius * 1.5;
  const vision = hex(NIGHT_TINT.vision);
  const graphics = new Graphics();

  for (let ring = 1; ring <= VISION_RINGS; ring += 1) {
    const t = ring / VISION_RINGS;

    graphics.circle(outer, outer, radius * (1.5 - 0.5 * t)).fill(mix(veil, vision, t));
  }
  return bake(renderer, graphics);
}

/**
 * Une lumière : trois anneaux pleins, à bord net, qui glissent du voile vers
 * `color` — le cœur atteint `ceiling`, le plafond de la lumière.
 */
function bakeLight(renderer: Renderer, veil: number, color: number, ceiling: number): Texture {
  const graphics = new Graphics();

  for (let ring = 1; ring <= LIGHT_RINGS; ring += 1) {
    const t = ring / LIGHT_RINGS;

    graphics.circle(LIGHT_PIXELS, LIGHT_PIXELS, LIGHT_PIXELS * (1 - (ring - 1) / LIGHT_RINGS)).fill(mix(veil, color, ceiling * t));
  }
  return bake(renderer, graphics);
}

function bake(renderer: Renderer, graphics: Graphics): Texture {
  const texture = renderer.generateTexture({ target: graphics, antialias: true, resolution: 1 });

  graphics.destroy();
  return texture;
}

/** Mélange deux couleurs `0xrrggbb`, canal par canal. */
function mix(from: number, to: number, t: number): number {
  let out = 0;

  for (const shift of [16, 8, 0]) {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;

    out |= Math.round(a + (b - a) * t) << shift;
  }
  return out;
}
