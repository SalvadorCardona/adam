/**
 * L'anneau d'Adam : un ellipse au sol, permanent et discret, sous ses pieds,
 * pour que le joueur sache toujours « c'est moi » — au départ, parmi dix
 * colons, et à tous les zooms. Dans la teinte des humains (orange), jamais
 * le jaune de la sélection ; deux tons comme le cadre de sélection : un
 * trait `shade` décalé vers le bas sous un trait `base`.
 *
 * Quelques secondes de halo — une onde qui s'élargit et s'efface, en boucle
 * — au lancement et après chaque réapparition (`playerRespawned`). Sous
 * `prefers-reduced-motion`, pas de halo : l'anneau seul. Du ressenti, rien
 * que des minuteurs de vue.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, STROKE, hex } from '../data/artDirection.ts';
import type { World } from '../sim/world.ts';
import { reducedMotion } from './motion.ts';

const BASE = hex(PALETTE.orange.base);
const SHADE = hex(PALETTE.orange.shade);

/** Demi-axes de l'anneau, en pixels monde : plus large que les pieds, aplati en 3/4. */
const RADIUS_X = 15;
const RADIUS_Y = 9;
/** La face avant dépasse d'autant sous le trait. */
const FACE_DROP = 2;
/** Opacité de l'anneau permanent : discret. */
const RING_ALPHA = 0.75;

/** Le halo : durée totale, période d'une onde, et son agrandissement final. */
const HALO_MS = 4000;
const HALO_PERIOD_MS = 1300;
const HALO_GROWTH = 2.4;

export class AdamRing {
  public readonly container = new Container();

  private readonly ring = new Graphics();
  private readonly halo = new Graphics();
  private readonly world: World;
  private haloLeft = HALO_MS;

  public constructor(world: World) {
    this.world = world;
    this.ring
      .ellipse(0, FACE_DROP, RADIUS_X, RADIUS_Y)
      .stroke({ width: STROKE.width, color: SHADE, cap: STROKE.cap, join: STROKE.join })
      .ellipse(0, 0, RADIUS_X, RADIUS_Y)
      .stroke({ width: STROKE.width, color: BASE, cap: STROKE.cap, join: STROKE.join });
    this.ring.alpha = RING_ALPHA;
    this.halo
      .ellipse(0, 0, RADIUS_X, RADIUS_Y)
      .stroke({ width: STROKE.width * 1.5, color: BASE, cap: STROKE.cap, join: STROKE.join });
    this.halo.visible = false;
    this.container.addChild(this.halo, this.ring);
    world.events.on('playerRespawned', () => (this.haloLeft = HALO_MS));
  }

  public update(alpha: number, deltaMs: number): void {
    const adam = this.world.adam;
    const x = adam.prevX + (adam.x - adam.prevX) * alpha;
    const y = adam.prevY + (adam.y - adam.prevY) * alpha;
    const down = this.world.dead;

    this.container.visible = !down;
    this.container.position.set(x, y);
    if (down) return;

    this.haloLeft = Math.max(0, this.haloLeft - deltaMs);
    if (this.haloLeft === 0 || reducedMotion()) {
      this.halo.visible = false;
      return;
    }

    const phase = ((HALO_MS - this.haloLeft) % HALO_PERIOD_MS) / HALO_PERIOD_MS;
    const fade = Math.min(1, this.haloLeft / 600);

    this.halo.visible = true;
    this.halo.scale.set(1 + phase * (HALO_GROWTH - 1));
    this.halo.alpha = (1 - phase) * fade;
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}
