/**
 * Arbres et rochers : des sprites, triés en profondeur avec tout ce qui marche.
 *
 * Un arbre monte bien au-dessus de sa tuile — c'est la vue 3/4 et ce qui
 * donne du volume à la forêt. Il ne peut donc plus être baké dans le sol :
 * il vit dans le conteneur trié de `EntityLayer`, et Adam passe derrière lui
 * quand il est au-dessus, devant quand il est en dessous. Tous les sprites
 * partagent l'atlas : Pixi les dessine en quelques appels, même par centaines.
 *
 * Seuls les chunks visibles ont leurs sprites ; au-delà d'une marge, ils sont
 * détruits. Un chunk neuf se construit sous le budget de bake de l'image,
 * partagé avec le sol (`bakeBudget.ts`). Une tuile heurtée est remise à jour à l'événement (entamée,
 * disparue) — par Adam ou par la hache d'un bûcheron —, et elle **tremble** : un minuteur de vue, la simulation n'en
 * sait rien. Un chunk sali par la simulation est reconstruit en entier.
 *
 * Les arbres que plante le forestier y vivent aussi : pousse, puis jeune
 * arbre (`sapling`), puis un arbre comme les autres — jamais un arbre mort.
 * Un changement de stade salit le chunk, qui se reconstruit. Les cultures
 * des fermiers aussi : la terre retournée au sol, avec les ombres, et les
 * plants — semis, pousse, épis mûrs (`crop`) — triés avec le reste.
 *
 * Le brouillard de guerre (`sim/fog.ts`) : une case vue de loin montre ce
 * qu'on y a vu la dernière fois (`World.lookAt`) — l'arbre coupé hors de
 * vue y reste debout jusqu'à ce qu'on revienne.
 *
 * Pendant un placement, l'arbre ou le rocher qui empêche de poser
 * **clignote** : c'est lui qu'Adam doit aller heurter.
 *
 * Les ombres portées vont dans un conteneur à part, sous tout le reste :
 * elles sont au sol, rien ne passe dessous.
 */

import type { Container} from 'pixi.js';
import { Sprite } from 'pixi.js';
import { CHUNK_SIZE, CHUNK_TILES, TILE_SIZE, coordKey, floorDiv, type TileCoord } from '../core/grid.ts';
import { hash3 } from '../core/rng.ts';
import { LIGHT } from '../data/artDirection.ts';
import { RESOURCES, SAPLING } from '../data/resources.ts';
import { SPRITES, type SpriteId } from '../data/sprites.ts';
import type { TileLook } from '../sim/resources.ts';
import { terrainAt } from '../sim/terrain.ts';
import type { World } from '../sim/world.ts';
import { bakeOrder, type BakeBudget } from './bakeBudget.ts';
import type { Camera } from './camera.ts';
import type { SpriteLibrary } from './spriteLibrary.ts';
import type { TerrainTiles } from './terrainTiles.ts';

/** Un chunk de ressources ne se « rebake » pas par le budget : sali, il se reconstruit aussitôt. */
const NO_STALE: ReadonlySet<string> = new Set();

/** Durée du tremblement d'une ressource frappée. */
const WOBBLE_MS = 200;
/** Un arbre entamé s'écrase d'abord, bref et franc : élargi, tassé, puis il revient. */
const SQUASH_MS = 120;
const SQUASH_X = 1.08;
const SQUASH_Y = 0.94;
/** Période du clignotement d'une ressource qui gêne un placement, et son opacité au plus bas. */
const BLINK_MS = 700;
const BLINK_MIN_ALPHA = 0.35;
/** Largeur de l'ombre portée d'un arbre et d'un rocher. */
const TREE_SHADOW = 34;
const ROCK_SHADOW = 28;
/** Celle d'une pousse et d'un jeune arbre du forestier. */
const SAPLING_SHADOW = { sprout: 12, young: 20 } as const;

interface ResourceView {
  sprite: Sprite;
  shadow: Sprite;
  baseX: number;
  /** Clé de texture affichée : ne recrée rien si elle n'a pas changé. */
  key: string;
}

export class ResourceLayer {
  private readonly chunks = new Map<string, Map<string, ResourceView>>();
  private readonly wobbles = new Map<string, number>();
  /** Les tremblements qui sont ceux d'un arbre : il s'écrase au lieu de se tasser. */
  private readonly squashes = new Set<string>();
  /** Tuiles qui clignotent, et l'horloge du clignotement. */
  private blinking = new Set<string>();
  private blinkClock = 0;

  private readonly world: World;
  private readonly library: SpriteLibrary;
  private readonly tiles: TerrainTiles;
  private readonly sorted: Container;
  private readonly shadows: Container;

  public constructor(world: World, library: SpriteLibrary, tiles: TerrainTiles, sorted: Container, shadows: Container) {
    this.world = world;
    this.library = library;
    this.tiles = tiles;
    this.sorted = sorted;
    this.shadows = shadows;

    const struck = ({ tx, ty }: TileCoord, tree: boolean): void => {
      const key = coordKey(tx, ty);

      this.refresh(tx, ty);
      this.wobbles.set(key, WOBBLE_MS);
      if (tree) this.squashes.add(key);
      else this.squashes.delete(key);
    };

    world.events.on('resourceHarvested', (event) => struck(event, event.item === 'wood'));
    // Un coup de hache de bûcheron fait trembler l'arbre comme un passage d'Adam.
    world.events.on('treeChopped', (event) => struck(event, true));
    // Une pousse qu'on vient de mettre en terre frémit, une case qu'on sème ou qu'on récolte aussi.
    world.events.on('treePlanted', (event) => struck(event, true));
    world.events.on('cropSown', (event) => struck(event, true));
    world.events.on('cropHarvested', (event) => struck(event, true));
  }

  /** `blocking` : les tuiles dont la ressource gêne le fantôme, à faire clignoter. */
  public update(camera: Camera, deltaMs: number, blocking: readonly TileCoord[], budget: BakeBudget): void {
    const visible = camera.visibleChunks(0);
    const keep = camera.visibleChunks(1);

    // Un chunk sali se reconstruit tout de suite : un arbre abattu ne reste pas debout à l'écran.
    for (let cy = visible.minCy; cy <= visible.maxCy; cy += 1) {
      for (let cx = visible.minCx; cx <= visible.maxCx; cx += 1) {
        const key = coordKey(cx, cy);
        const chunk = this.world.chunks.peek(cx, cy);

        if (!this.chunks.has(key) || !chunk?.dirty) continue;

        this.clearChunk(key);
        this.buildChunk(cx, cy);
        chunk.dirty = false;
      }
    }

    // Un chunk neuf attend le budget de bake de l'image (`bakeBudget.ts`), le plus proche du centre d'abord. Pas d'avance
    // sur la marge : ses arbres, jamais cachés, seraient dessinés hors champ à chaque image.
    const order = bakeOrder(visible, camera.centerX / CHUNK_SIZE, camera.centerY / CHUNK_SIZE, (key) => this.chunks.has(key), NO_STALE);

    for (const { bx, by, key } of order) {
      if (!budget.take(performance.now())) break;
      this.build(bx, by, key);
    }

    for (const key of [...this.chunks.keys()]) {
      const [cx, cy] = key.split(',').map(Number) as [number, number];

      if (cx < keep.minCx || cx > keep.maxCx || cy < keep.minCy || cy > keep.maxCy) this.clearChunk(key);
    }

    this.shake(deltaMs);
    this.blink(blocking, deltaMs);
  }

  /** Clignotement des ressources qui gênent ; celles qui ne gênent plus retrouvent leur opacité. */
  private blink(blocking: readonly TileCoord[], deltaMs: number): void {
    const next = new Set(blocking.map(({ tx, ty }) => coordKey(tx, ty)));

    for (const key of this.blinking) {
      const view = next.has(key) ? undefined : this.view(key);

      if (view) view.sprite.alpha = 1;
    }
    this.blinking = next;
    this.blinkClock = next.size > 0 ? (this.blinkClock + deltaMs) % BLINK_MS : 0;

    const wave = (1 + Math.cos((this.blinkClock / BLINK_MS) * Math.PI * 2)) / 2;

    for (const key of next) {
      const view = this.view(key);

      if (view) view.sprite.alpha = BLINK_MIN_ALPHA + (1 - BLINK_MIN_ALPHA) * wave;
    }
  }

  private view(key: string): ResourceView | undefined {
    const [tx, ty] = key.split(',').map(Number) as [number, number];

    return this.chunks.get(coordKey(floorDiv(tx, CHUNK_TILES), floorDiv(ty, CHUNK_TILES)))?.get(key);
  }

  /** Un chunk neuf : ses sprites, le chunk de la simulation marqué propre. */
  private build(cx: number, cy: number, key: string): void {
    const chunk = this.world.chunks.peek(cx, cy);

    this.clearChunk(key);
    this.buildChunk(cx, cy);
    if (chunk) chunk.dirty = false;
  }

  private buildChunk(cx: number, cy: number): void {
    const views = new Map<string, ResourceView>();

    this.chunks.set(coordKey(cx, cy), views);

    for (let ly = 0; ly < CHUNK_TILES; ly += 1) {
      for (let lx = 0; lx < CHUNK_TILES; lx += 1) {
        const tx = cx * CHUNK_TILES + lx;
        const ty = cy * CHUNK_TILES + ly;
        const view = this.create(tx, ty);

        if (view) views.set(coordKey(tx, ty), view);
      }
    }
  }

  /** Le sprite de la ressource en (tx, ty), ou `null` si la tuile est nue. */
  private create(tx: number, ty: number): ResourceView | null {
    const look = this.world.lookAt(tx, ty);

    if (!look.resource) return this.createSapling(tx, ty, look.sapling) ?? this.createCrop(tx, ty);

    const { seed } = this.world;
    // L'essence d'un arbre est tirée par tuile : elle reste la même une fois entamé. Le forestier ne plante pas d'arbre mort.
    const sprites: readonly SpriteId[] = look.planted ? SAPLING.sprites : RESOURCES[look.resource].sprites;
    const id = sprites[hash3(seed ^ 0x510e527f, tx, ty) % sprites.length]!;
    const proto = SPRITES[id];
    const part = look.stage === 'damaged' ? 'damaged' : 'full';
    const key = `${id}.${part}`;
    const tree = look.resource === 'tree';
    // Un léger décalage par tuile : la forêt ne pousse pas au cordeau.
    const jitter = tree ? (hash3(seed ^ 0x2545f491, tx, ty) % 7) - 3 : 0;
    const baseX = (tx + 0.5) * TILE_SIZE + jitter;
    const baseY = (ty + 1) * TILE_SIZE - 3;

    const sprite = new Sprite(this.library.texture(key));

    sprite.anchor.set(proto.anchorX, proto.anchorY);
    sprite.position.set(baseX, baseY);
    sprite.zIndex = (ty + 1) * TILE_SIZE;

    const shadow = new Sprite(this.tiles.shadow(terrainAt(seed, tx, ty)));
    const width = tree ? TREE_SHADOW : ROCK_SHADOW;

    shadow.anchor.set(0.5);
    shadow.width = width;
    shadow.height = width * 0.32;
    shadow.position.set(baseX + LIGHT.shadowOffset.x, baseY + LIGHT.shadowOffset.y - 2);

    this.sorted.addChild(sprite);
    this.shadows.addChild(shadow);
    return { sprite, shadow, baseX, key };
  }

  /** La pousse ou le jeune arbre qu'un forestier a planté en (tx, ty), ou `null`. */
  private createSapling(tx: number, ty: number, stage: TileLook['sapling']): ResourceView | null {
    if (!stage) return null;

    const proto = SPRITES.sapling;
    const key = `sapling.${stage}`;
    const baseX = (tx + 0.5) * TILE_SIZE;
    const baseY = (ty + 1) * TILE_SIZE - 3;
    const sprite = new Sprite(this.library.texture(key));

    sprite.anchor.set(proto.anchorX, proto.anchorY);
    sprite.position.set(baseX, baseY);
    sprite.zIndex = (ty + 1) * TILE_SIZE;

    const shadow = new Sprite(this.tiles.shadow(terrainAt(this.world.seed, tx, ty)));

    shadow.anchor.set(0.5);
    shadow.width = SAPLING_SHADOW[stage];
    shadow.height = SAPLING_SHADOW[stage] * 0.32;
    shadow.position.set(baseX + LIGHT.shadowOffset.x, baseY + LIGHT.shadowOffset.y - 2);

    this.sorted.addChild(sprite);
    this.shadows.addChild(shadow);
    return { sprite, shadow, baseX, key };
  }

  /** La case semée par un fermier en (tx, ty) : sa terre au sol, ses plants au stade du jour ; `null` sans culture. */
  private createCrop(tx: number, ty: number): ResourceView | null {
    const stage = this.world.resources.crop(tx, ty);

    if (!stage) return null;

    const proto = SPRITES.crop;
    const key = `crop.${stage}`;
    const baseX = (tx + 0.5) * TILE_SIZE;
    const baseY = (ty + 1) * TILE_SIZE;
    const sprite = new Sprite(this.library.texture(key));
    // La terre retournée n'a pas d'ombre : elle est le sol, sous tout ce qui passe.
    const soil = new Sprite(this.library.texture('crop.soil'));

    for (const part of [sprite, soil]) {
      part.anchor.set(proto.anchorX, proto.anchorY);
      part.position.set(baseX, baseY);
    }
    sprite.zIndex = baseY;

    this.sorted.addChild(sprite);
    this.shadows.addChild(soil);
    return { sprite, shadow: soil, baseX, key };
  }

  /** Remet une tuile à jour après une récolte : entamée, ou disparue. */
  private refresh(tx: number, ty: number): void {
    const views = this.chunks.get(coordKey(floorDiv(tx, CHUNK_TILES), floorDiv(ty, CHUNK_TILES)));

    if (!views) return;

    const key = coordKey(tx, ty);
    const existing = views.get(key);
    const look = this.world.lookAt(tx, ty);

    if (existing && look.resource && existing.key.endsWith(look.stage === 'damaged' ? '.damaged' : '.full')) return;

    if (existing) {
      existing.sprite.destroy();
      existing.shadow.destroy();
      views.delete(key);
    }

    const view = this.create(tx, ty);

    if (view) views.set(key, view);
  }

  /** Tremblement des ressources frappées, puis retour exact au repos. */
  private shake(deltaMs: number): void {
    for (const [key, left] of this.wobbles) {
      const [tx, ty] = key.split(',').map(Number) as [number, number];
      const view = this.chunks.get(coordKey(floorDiv(tx, CHUNK_TILES), floorDiv(ty, CHUNK_TILES)))?.get(key);
      const remaining = Math.max(0, left - deltaMs);

      const tree = this.squashes.has(key);

      if (remaining === 0) {
        this.wobbles.delete(key);
        this.squashes.delete(key);
      } else {
        this.wobbles.set(key, remaining);
      }

      if (!view) continue;

      const strength = remaining / WOBBLE_MS;

      view.sprite.x = view.baseX + Math.sin(remaining * 0.09) * 2.2 * strength;
      if (tree) {
        const squash = Math.max(0, 1 - (WOBBLE_MS - remaining) / SQUASH_MS);

        view.sprite.scale.set(1 + (SQUASH_X - 1) * squash, 1 + (SQUASH_Y - 1) * squash);
      } else {
        view.sprite.scale.set(1 + strength * 0.05, 1 - strength * 0.07);
      }
    }
  }

  private clearChunk(key: string): void {
    const views = this.chunks.get(key);

    if (!views) return;

    for (const view of views.values()) {
      view.sprite.destroy();
      view.shadow.destroy();
    }
    this.chunks.delete(key);
  }

  public destroy(): void {
    for (const key of [...this.chunks.keys()]) this.clearChunk(key);
  }
}
