/**
 * La carte du monde : tout le monde découvert d'un coup d'œil, à parcourir
 * du doigt, et un tap pour y envoyer la caméra du jeu.
 *
 * Un bouton du HUD (dans la rangée des contrôles) et la touche M l'ouvrent
 * et la ferment ; Échap et sa croix la ferment aussi (`main.ts`). La colonne
 * reste par-dessus la carte : ouverte, ses boutons zooment la carte, et
 * celui du milieu la ramène sur Adam. Elle couvre
 * l'écran : le jeu continue de tourner derrière, comme sous la fenêtre d'un
 * bâtiment ou le sac — une carte n'est pas une pause —, mais le canvas du
 * jeu cesse de se dessiner tant qu'elle est ouverte.
 *
 * **Pas un second rendu du monde.** Un canvas 2D, pas Pixi :
 * - le **fond** (sol, routes, filons, arbres, rochers) est peint par blocs
 *   de 16 × 16 tuiles, deux pixels par tuile, dans de petits canvas gardés
 *   d'une ouverture à l'autre ; ils se refont à l'ouverture, toutes les
 *   quelques secondes, et quand la zone découverte change — quelques blocs
 *   par cadre, les plus proches du centre d'abord ;
 * - par-dessus, dix fois par seconde ou au geste, des **marqueurs** simples :
 *   bâtiments et bases mutantes à leur emprise, habitants et ennemis en
 *   points, Adam en gros point, et le cadre de ce que montre la caméra.
 *
 * **Les régions** (`data/regions.ts`) : une conquise se montre telle
 * quelle ; une à conquérir — son gardien l'attend — est hachurée de jaune,
 * son repaire marqué d'un point corail ; une verrouillée — il faut une ère
 * plus avancée — est voilée d'indigo. Un liseré blanc borde chaque région ;
 * la légende le rappelle.
 *
 * **Le brouillard.** La carte ne montre que ce que `MapSight` lui permet :
 * rien d'une case inexplorée ; d'une case explorée, le sol et le bâti sous
 * un voile indigo, personne dessus ; le reste en direct.
 *
 * **Les gestes** sont ceux du jeu : le routeur de doigts (`input/pointer.ts`)
 * avec son pinch (`Pinch`), et la molette (`bindWheelZoom`). Un doigt ou la
 * souris glisse la carte ; un tap y va.
 *
 * Aucune règle de jeu ici, et rien n'est écrit dans le monde : on lit.
 */

import { TILE_SIZE, floorDiv } from '../core/grid.ts';
import { GROUND, PALETTE, type Color } from '../data/artDirection.ts';
import type { ContaminationKind } from '../data/contamination.ts';
import type { ItemId } from '../data/items.ts';
import type { ResourceId } from '../data/resources.ts';
import { onLocale, t } from '../i18n/locale.ts';
import { PointerRouter, TAP_SLOP, type PointerConsumer, type PointerSample } from '../input/pointer.ts';
import { Pinch, bindWheelZoom } from '../input/zoom.ts';
import { isStanding } from '../sim/enemyBases.ts';
import { oreAt, terrainAt, type TerrainKind } from '../sim/terrain.ts';
import type { Mobile } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { ENEMY_BASE } from '../data/enemyBases.ts';
import { uiIcon } from './icons.ts';
import type { MapSight } from './mapSight.ts';
import { MAP_ZOOM, MapView } from './worldMapView.ts';
import type { ZoomLimits } from './zoomControls.ts';

/** Côté d'un bloc du fond, en tuiles, et pixels de sa texture par tuile. */
const BLOCK = 16;
const BLOCK_PX = 2;

/** Blocs du fond peints au plus par cadre : l'ouverture ne gèle pas le téléphone. */
const BUILD_BUDGET = 12;

/** Au-delà de tant de blocs gardés, ceux hors de la vue sont jetés. */
const MAX_BLOCKS = 1500;

/** Le fond se repeint tout seul toutes les tant de ms, carte ouverte : arbres coupés, routes posées. */
const REFRESH_MS = 4000;

/** Les marqueurs se redessinent toutes les tant de ms, sans geste. */
const MARKER_MS = 100;

/** Résolution maximale du canvas de la carte : au-delà, l'œil ne voit rien de plus. */
const MAX_RESOLUTION = 2;

/** Part du voile indigo sur une case explorée hors de vue. */
const VEIL = 0.45;

/** Le sol de la carte, par nature de terrain. */
const TERRAIN_COLORS: Record<TerrainKind, Color> = {
  grass: GROUND.grass.base,
  sand: GROUND.sand.base,
  water: GROUND.water.alt,
  rock: GROUND.rock.base,
};

/** Un filon à nu, sans rocher dessus : la teinte claire de sa famille. */
const ORE_COLORS: Partial<Record<ItemId, Color>> = {
  ironOre: PALETTE.cyan.light,
  coal: PALETTE.ink.light,
  stone: PALETTE.coral.light,
};

/** Arbres et rochers : la teinte de leur famille. */
const RESOURCE_COLORS: Record<ResourceId, Color> = {
  tree: PALETTE.mint.base,
  ironRock: PALETTE.cyan.shade,
  coalRock: PALETTE.ink.base,
  stoneRock: PALETTE.coral.base,
};

/** Terres polluées et radioactives : les teintes de leurs tuiles. */
const TAINT_COLORS: Record<ContaminationKind, Color> = {
  polluted: PALETTE.violet.shade,
  radioactive: PALETTE.orange.shade,
};

const ROAD_COLOR: Color = PALETTE.paper.shade;
const VEIL_COLOR: Color = PALETTE.ink.base;
/** Une région à conquérir : ses hachures jaunes, une diagonale sur `HATCH`, et leur part. */
const OPEN_COLOR: Color = PALETTE.yellow.base;
const HATCH = 4;
const OPEN_MIX = 0.45;
/** Une région verrouillée : un voile indigo de plus. */
const LOCKED_MIX = 0.4;
/** Le liseré entre deux régions. */
const BORDER_COLOR: Color = PALETTE.paper.base;
const BORDER_MIX = 0.55;
/** Le repaire d'un gardien qui attend. */
const LAIR_COLOR: Color = PALETTE.coral.base;

/** L'inexploré : la nuit indigo, pas du noir. */
const UNEXPLORED_COLOR: Color = PALETTE.ink.shade;

interface Block {
  canvas: HTMLCanvasElement;
  /** La génération du fond à laquelle il a été peint : plus ancienne, il est à refaire. */
  generation: number;
}

export interface WorldMapActions {
  /** La carte s'ouvre : ce qui occupe l'écran se ferme, le son de fenêtre joue. */
  onOpen(): void;
  /** Un tap sur la carte : la caméra du jeu va en (x, y), pixels monde. */
  goTo(x: number, y: number): void;
  /** Le centre de la caméra du jeu, et ce qu'elle montre, en pixels monde. */
  cameraView(): { x: number; y: number; width: number; height: number };
}

export class WorldMap {
  public readonly root: HTMLElement;
  /** Le bouton du HUD qui l'ouvre et la ferme. */
  public readonly button: HTMLButtonElement;

  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly closeButton: HTMLButtonElement;
  private readonly world: World;
  private readonly sight: MapSight;
  private readonly actions: WorldMapActions;
  private readonly view = new MapView();
  private readonly blocks = new Map<number, Block>();
  private readonly rgb = new Map<Color, [number, number, number]>();
  private opened = false;
  private generation = 0;
  private seenRevision = -1;
  private sinceRefresh = 0;
  private sinceDraw = Infinity;
  private dirty = true;
  private resolution = 1;

  public constructor(world: World, sight: MapSight, actions: WorldMapActions) {
    this.world = world;
    this.sight = sight;
    this.actions = actions;

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'hud-button hud-map-button';
    this.button.append(uiIcon('map'));
    this.button.addEventListener('click', () => this.toggle());

    this.root = document.createElement('div');
    this.root.className = 'world-map';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'world-map-canvas';
    this.context = this.canvas.getContext('2d')!;

    const header = document.createElement('div');
    const title = document.createElement('h2');

    header.className = 'world-map-header';
    title.className = 'world-map-title';
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'hud-button world-map-close';
    this.closeButton.append(uiIcon('close', 22));
    this.closeButton.addEventListener('click', () => this.close());
    header.append(title, this.closeButton);

    const hint = document.createElement('p');

    hint.className = 'world-map-hint';

    // La légende des régions : conquise, à conquérir, verrouillée.
    const legend = document.createElement('ul');
    const chips = (['conquered', 'open', 'locked'] as const).map((state) => {
      const chip = document.createElement('li');
      const swatch = document.createElement('span');
      const label = document.createElement('span');

      chip.className = 'world-map-legend-chip';
      swatch.className = `world-map-swatch world-map-swatch-${state}`;
      chip.append(swatch, label);
      legend.append(chip);
      return { state, label };
    });

    legend.className = 'world-map-legend';
    this.root.append(this.canvas, header, legend, hint);

    onLocale(() => {
      const { worldMap } = t().screens;

      this.button.title = worldMap.open;
      this.button.setAttribute('aria-label', worldMap.open);
      this.root.setAttribute('aria-label', worldMap.title);
      title.textContent = worldMap.title;
      this.closeButton.title = worldMap.close;
      this.closeButton.setAttribute('aria-label', worldMap.close);
      hint.textContent = worldMap.hint;
      for (const { state, label } of chips) label.textContent = worldMap.regions[state];
    });

    const router = new PointerRouter(this.canvas);

    router.add(new DragTap((dx, dy) => this.pan(dx, dy), (x, y) => this.tap(x, y)));
    router.setGesture(
      new Pinch((factor, x, y) => {
        this.view.zoomAt(factor, x, y);
        this.dirty = true;
      }),
    );
    bindWheelZoom(
      this.canvas,
      () => this.opened,
      ({ factor }, x, y) => {
        this.view.zoomAt(factor, x, y);
        this.dirty = true;
      },
    );
  }

  public get open(): boolean {
    return this.opened;
  }

  public toggle(): void {
    if (this.opened) this.close();
    else this.show();
  }

  /** Ouvre la carte, centrée sur ce que montre la caméra du jeu. */
  public show(): void {
    if (this.opened) return;

    const camera = this.actions.cameraView();

    this.opened = true;
    this.root.hidden = false;
    this.button.classList.add('is-active');
    this.view.centerOn(camera.x / TILE_SIZE, camera.y / TILE_SIZE);
    this.generation += 1;
    this.sinceRefresh = 0;
    this.dirty = true;
    this.actions.onOpen();
  }

  public close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.hidden = true;
    this.button.classList.remove('is-active');
  }

  /** À chaque cadre : rien carte fermée ; sinon le fond à compléter, et les marqueurs. */
  public update(deltaMs: number): void {
    if (!this.opened) return;

    this.resize();
    this.sinceRefresh += deltaMs;
    this.sinceDraw += deltaMs;
    if (this.sinceRefresh >= REFRESH_MS || this.sight.revision !== this.seenRevision) {
      this.seenRevision = this.sight.revision;
      this.sinceRefresh = 0;
      this.generation += 1;
    }
    this.view.clamp(this.sight.known());
    if (this.paintBlocks()) this.dirty = true;
    if (!this.dirty && this.sinceDraw < MARKER_MS) return;
    this.dirty = false;
    this.sinceDraw = 0;
    this.draw();
  }

  /** Un cran de zoom des boutons du bord, autour du centre : carte ouverte, ils zooment la carte. */
  public stepZoom(direction: 1 | -1): void {
    this.view.zoomAt(direction > 0 ? MAP_ZOOM.step : 1 / MAP_ZOOM.step, this.view.width / 2, this.view.height / 2);
    this.dirty = true;
  }

  /** Le bouton du milieu, carte ouverte : la carte revient sur Adam, à son échelle par défaut. */
  public recenter(): void {
    const { player } = this.world;

    this.view.centerOn(player.x / TILE_SIZE, player.y / TILE_SIZE);
    this.view.scale = MAP_ZOOM.default;
    this.dirty = true;
  }

  /** Ce que les boutons du bord peuvent encore faire sur la carte. */
  public get zoomLimits(): ZoomLimits {
    const { view, world } = this;

    return {
      canZoomIn: view.scale < MAP_ZOOM.max - 1e-3,
      canZoomOut: view.scale > MAP_ZOOM.min + 1e-3,
      atHome:
        Math.abs(view.scale - MAP_ZOOM.default) < 1e-3 &&
        Math.hypot(view.cx - world.player.x / TILE_SIZE, view.cy - world.player.y / TILE_SIZE) < 0.5,
    };
  }

  private pan(dx: number, dy: number): void {
    this.view.pan(dx, dy);
    this.view.clamp(this.sight.known());
    this.dirty = true;
  }

  private tap(x: number, y: number): void {
    const tile = this.view.toTile(x, y);

    this.close();
    this.actions.goTo(tile.x * TILE_SIZE, tile.y * TILE_SIZE);
  }

  /** Le canvas suit la taille de la fenêtre, à la résolution de l'écran (plafonnée). */
  private resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const resolution = Math.min(MAX_RESOLUTION, window.devicePixelRatio || 1);

    if (width === this.view.width && height === this.view.height && resolution === this.resolution) return;
    this.view.resize(width, height);
    this.resolution = resolution;
    this.canvas.width = Math.round(width * resolution);
    this.canvas.height = Math.round(height * resolution);
    this.dirty = true;
  }

  /** Peint jusqu'à `BUILD_BUDGET` blocs à refaire dans la vue, du centre vers les bords. Renvoie vrai si un bloc a changé. */
  private paintBlocks(): boolean {
    const tiles = this.view.visibleTiles();
    const minBx = floorDiv(tiles.minTx, BLOCK);
    const minBy = floorDiv(tiles.minTy, BLOCK);
    const maxBx = floorDiv(tiles.maxTx, BLOCK);
    const maxBy = floorDiv(tiles.maxTy, BLOCK);
    const centerBx = this.view.cx / BLOCK - 0.5;
    const centerBy = this.view.cy / BLOCK - 0.5;
    const todo: [number, number, number][] = [];

    for (let by = minBy; by <= maxBy; by += 1) {
      for (let bx = minBx; bx <= maxBx; bx += 1) {
        const block = this.blocks.get(blockKey(bx, by));

        if (!block || block.generation < this.generation) todo.push([bx, by, (bx - centerBx) ** 2 + (by - centerBy) ** 2]);
      }
    }
    if (todo.length === 0) return false;

    todo.sort((a, b) => a[2] - b[2]);
    for (const [bx, by] of todo.slice(0, BUILD_BUDGET)) this.paintBlock(bx, by);
    if (this.blocks.size > MAX_BLOCKS) this.evict(minBx, minBy, maxBx, maxBy);
    return true;
  }

  /** Peint le bloc (bx, by) : une couleur par tuile, voilée hors de vue, transparente inexplorée. */
  private paintBlock(bx: number, by: number): void {
    const key = blockKey(bx, by);
    const block = this.blocks.get(key) ?? { canvas: blockCanvas(), generation: 0 };
    const context = block.canvas.getContext('2d')!;
    const size = BLOCK * BLOCK_PX;
    const image = context.createImageData(size, size);
    const { seed, resources, roads, land } = this.world;
    const [or, og, ob] = this.colorOf(OPEN_COLOR);
    const [lr, lg, lb] = this.colorOf(VEIL_COLOR);
    const [br, bgr, bb] = this.colorOf(BORDER_COLOR);

    for (let ly = 0; ly < BLOCK; ly += 1) {
      for (let lx = 0; lx < BLOCK; lx += 1) {
        const tx = bx * BLOCK + lx;
        const ty = by * BLOCK + ly;
        const sight = this.sight.sightAt(tx, ty);

        if (sight === 'unexplored') continue;

        let [r, g, b] = this.colorOf(tileColor(seed, tx, ty, roads.has(tx, ty), resources.at(tx, ty)?.id ?? null, land.at(tx, ty)));
        const region = this.world.regionAt(tx, ty);
        const state = this.world.regionState(region);

        if (state === 'open' && (((tx + ty) % HATCH) + HATCH) % HATCH === 0) {
          [r, g, b] = [r + (or - r) * OPEN_MIX, g + (og - g) * OPEN_MIX, b + (ob - b) * OPEN_MIX];
        } else if (state === 'locked') {
          [r, g, b] = [r + (lr - r) * LOCKED_MIX, g + (lg - g) * LOCKED_MIX, b + (lb - b) * LOCKED_MIX];
        }
        if (this.world.regionAt(tx + 1, ty) !== region || this.world.regionAt(tx, ty + 1) !== region) {
          [r, g, b] = [r + (br - r) * BORDER_MIX, g + (bgr - g) * BORDER_MIX, b + (bb - b) * BORDER_MIX];
        }
        const veil = sight === 'explored' ? VEIL : 0;
        const [vr, vg, vb] = this.colorOf(VEIL_COLOR);

        for (let py = 0; py < BLOCK_PX; py += 1) {
          for (let px = 0; px < BLOCK_PX; px += 1) {
            const at = ((ly * BLOCK_PX + py) * size + lx * BLOCK_PX + px) * 4;

            image.data[at] = r + (vr - r) * veil;
            image.data[at + 1] = g + (vg - g) * veil;
            image.data[at + 2] = b + (vb - b) * veil;
            image.data[at + 3] = 255;
          }
        }
      }
    }
    context.putImageData(image, 0, 0);
    block.generation = this.generation;
    this.blocks.set(key, block);
  }

  /** Jette les blocs hors de la vue : la carte d'une longue partie ne remplit pas la mémoire. */
  private evict(minBx: number, minBy: number, maxBx: number, maxBy: number): void {
    for (const key of this.blocks.keys()) {
      const bx = Math.floor(key / 0x10000) - 0x8000;
      const by = (key % 0x10000) - 0x8000;

      if (bx < minBx || bx > maxBx || by < minBy || by > maxBy) this.blocks.delete(key);
    }
  }

  private draw(): void {
    const { context, view } = this;
    const tiles = view.visibleTiles();

    context.setTransform(this.resolution, 0, 0, this.resolution, 0, 0);
    context.fillStyle = UNEXPLORED_COLOR;
    context.fillRect(0, 0, view.width, view.height);

    // Le fond : un drawImage par bloc, lissé — les bords du terrain s'adoucissent d'eux-mêmes.
    context.imageSmoothingEnabled = true;
    const side = BLOCK * view.scale;

    for (let by = floorDiv(tiles.minTy, BLOCK); by <= floorDiv(tiles.maxTy, BLOCK); by += 1) {
      for (let bx = floorDiv(tiles.minTx, BLOCK); bx <= floorDiv(tiles.maxTx, BLOCK); bx += 1) {
        const block = this.blocks.get(blockKey(bx, by));

        if (!block) continue;

        const at = view.toScreen(bx * BLOCK, by * BLOCK);

        // Au pixel près, un peu plus grand : pas de fente entre deux blocs.
        context.drawImage(block.canvas, Math.floor(at.x), Math.floor(at.y), Math.ceil(side) + 1, Math.ceil(side) + 1);
      }
    }

    this.drawBuildings();
    this.drawLairs();
    this.drawMobiles();
    this.drawPlayer();
    this.drawCameraFrame();
  }

  /** Le bâti : chantiers en jaune pâle, bâtiments en jaune de la colonie, bases mutantes en fluo — debout — ou en ruine violette. */
  private drawBuildings(): void {
    for (const entity of this.world.entities.values()) {
      if (this.sightOf(entity.tx + entity.width / 2, entity.ty + entity.height / 2) === 'unexplored') continue;
      this.footprint(entity.tx, entity.ty, entity.width, entity.height, entity.kind === 'site' ? 'site' : 'built');
    }
    for (const base of this.world.enemyBases) {
      if (this.sightOf(base.tx + ENEMY_BASE.width / 2, base.ty + ENEMY_BASE.height / 2) === 'unexplored') continue;
      this.footprint(base.tx, base.ty, ENEMY_BASE.width, ENEMY_BASE.height, isStanding(base) ? 'base' : 'ruin');
    }
  }

  /** Le repaire du gardien de chaque région à conquérir, une fois exploré : un point corail cerclé de blanc. */
  private drawLairs(): void {
    const r = Math.max(3, this.view.scale * 0.7);

    for (const region of this.world.regions) {
      if (!region.lair || this.world.regionState(region.id) !== 'open') continue;
      if (this.sightOf(region.lair.tx, region.lair.ty) === 'unexplored') continue;
      this.dot(region.lair.tx + 0.5, region.lair.ty + 0.5, r + 1.5, PALETTE.paper.base);
      this.dot(region.lair.tx + 0.5, region.lair.ty + 0.5, r, LAIR_COLOR);
    }
  }

  /** Une emprise, en trois tons comme une carte du HUD : la face avant, le dessus, et un liseré clair. */
  private footprint(tx: number, ty: number, width: number, height: number, kind: 'site' | 'built' | 'base' | 'ruin'): void {
    const { context, view } = this;
    const at = view.toScreen(tx, ty);
    const w = Math.max(3, width * view.scale);
    const h = Math.max(3, height * view.scale);
    const radius = Math.min(w, h) * 0.25;
    const face = Math.max(1, h * 0.12);
    const tones: Record<typeof kind, { base: Color; shade: Color }> = {
      site: { base: PALETTE.yellow.light, shade: PALETTE.yellow.shade },
      built: { base: PALETTE.yellow.base, shade: PALETTE.yellow.shade },
      base: { base: PALETTE.toxic.base, shade: PALETTE.toxic.shade },
      ruin: { base: PALETTE.violet.light, shade: PALETTE.violet.shade },
    };
    const tone = tones[kind];

    context.fillStyle = tone.shade;
    context.beginPath();
    context.roundRect(at.x, at.y, w, h, radius);
    context.fill();
    context.fillStyle = tone.base;
    context.beginPath();
    context.roundRect(at.x, at.y, w, h - face, radius);
    context.fill();
  }

  /** Les habitants en points orange, les mutants en fluo, les bêtes en corail ; seulement là où l'on voit. */
  private drawMobiles(): void {
    const r = Math.max(1.6, this.view.scale * 0.32);

    for (const mobile of this.world.mobiles.values()) {
      const color = mobileColor(mobile);

      if (!color) continue;

      const tx = mobile.x / TILE_SIZE;
      const ty = mobile.y / TILE_SIZE;

      if (this.sightOf(tx, ty) !== 'visible') continue;
      this.dot(tx, ty, mobile.kind === 'caravan' ? r * 1.6 : r, color);
    }
  }

  /** Adam : un gros point orange cerclé de blanc, toujours affiché — il voit où il est. */
  private drawPlayer(): void {
    const { player } = this.world;
    const r = Math.max(4, this.view.scale * 0.6);
    const tx = player.x / TILE_SIZE;
    const ty = player.y / TILE_SIZE;

    this.dot(tx, ty, r + 2, PALETTE.paper.base);
    this.dot(tx, ty, r, PALETTE.orange.base);
  }

  /** Ce que montre la caméra du jeu : un cadre blanc arrondi, sur sa face lavande. */
  private drawCameraFrame(): void {
    const { context, view } = this;
    const camera = this.actions.cameraView();
    const at = view.toScreen((camera.x - camera.width / 2) / TILE_SIZE, (camera.y - camera.height / 2) / TILE_SIZE);
    const w = (camera.width / TILE_SIZE) * view.scale;
    const h = (camera.height / TILE_SIZE) * view.scale;
    const radius = Math.min(10, Math.min(w, h) * 0.2);

    context.lineWidth = 2.5;
    context.strokeStyle = PALETTE.paper.shade;
    context.beginPath();
    context.roundRect(at.x, at.y + 2, w, h, radius);
    context.stroke();
    context.strokeStyle = PALETTE.paper.base;
    context.beginPath();
    context.roundRect(at.x, at.y, w, h, radius);
    context.stroke();
  }

  private dot(tx: number, ty: number, r: number, color: Color): void {
    const at = this.view.toScreen(tx, ty);

    this.context.fillStyle = color;
    this.context.beginPath();
    this.context.arc(at.x, at.y, r, 0, Math.PI * 2);
    this.context.fill();
  }

  private sightOf(tx: number, ty: number) {
    return this.sight.sightAt(Math.floor(tx), Math.floor(ty));
  }

  /** Une couleur de la palette en composantes, lue une fois. */
  private colorOf(color: Color): [number, number, number] {
    let rgb = this.rgb.get(color);

    if (!rgb) {
      const value = Number.parseInt(color.slice(1), 16);

      rgb = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
      this.rgb.set(color, rgb);
    }
    return rgb;
  }
}

/**
 * Un doigt (ou la souris) sur la carte : il la glisse s'il bouge, il y va
 * s'il tape. Il cède son doigt au pinch quand un second se pose.
 */
class DragTap implements PointerConsumer {
  private finger: { id: number; startX: number; startY: number; x: number; y: number; dragging: boolean } | null = null;

  private readonly onPan: (dx: number, dy: number) => void;
  private readonly onTap: (x: number, y: number) => void;

  public constructor(onPan: (dx: number, dy: number) => void, onTap: (x: number, y: number) => void) {
    this.onPan = onPan;
    this.onTap = onTap;
  }

  public onDown(sample: PointerSample): boolean {
    if (this.finger || (sample.button ?? 0) !== 0) return false;
    this.finger = { id: sample.id, startX: sample.x, startY: sample.y, x: sample.x, y: sample.y, dragging: false };
    return true;
  }

  public onMove(sample: PointerSample): void {
    const finger = this.finger;

    if (!finger || finger.id !== sample.id) return;
    if (!finger.dragging && Math.hypot(sample.x - finger.startX, sample.y - finger.startY) > TAP_SLOP) finger.dragging = true;
    if (finger.dragging) this.onPan(sample.x - finger.x, sample.y - finger.y);
    finger.x = sample.x;
    finger.y = sample.y;
  }

  public onUp(sample: PointerSample): void {
    const finger = this.finger;

    if (!finger || finger.id !== sample.id) return;
    this.finger = null;
    if (!finger.dragging) this.onTap(sample.x, sample.y);
  }

  public onCancel(id: number): void {
    if (this.finger?.id === id) this.finger = null;
  }
}

/** La couleur d'une tuile : la route, sinon l'arbre ou le rocher, sinon le filon, sinon le sol. */
function tileColor(seed: number, tx: number, ty: number, road: boolean, resource: ResourceId | null, tainted: ContaminationKind | null): Color {
  if (road) return ROAD_COLOR;
  if (tainted) return TAINT_COLORS[tainted];
  if (resource) return RESOURCE_COLORS[resource];

  const terrain = terrainAt(seed, tx, ty);
  const ore = terrain === 'water' ? null : oreAt(seed, tx, ty);

  return (ore && ORE_COLORS[ore.item]) ?? TERRAIN_COLORS[terrain];
}

/** Le point d'un mobile, ou `null` s'il n'a rien à faire sur la carte : rentré, flèche, butin, soigné. */
function mobileColor(mobile: Mobile): Color | null {
  if ('inside' in mobile && mobile.inside) return null;
  switch (mobile.kind) {
    case 'mutant':
      return PALETTE.toxic.base;
    case 'beast':
      return mobile.proto === 'guardian' ? PALETTE.toxic.shade : PALETTE.coral.base;
    case 'caravan':
      return PALETTE.yellow.shade;
    case 'arrow':
    case 'pickup':
      return null;
    case 'companion':
      return PALETTE.cyan.base;
    case 'patient':
      return mobile.state === 'care' ? null : PALETTE.toxic.light;
    default:
      return PALETTE.orange.base;
  }
}

function blockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');

  canvas.width = BLOCK * BLOCK_PX;
  canvas.height = BLOCK * BLOCK_PX;
  return canvas;
}

function blockKey(bx: number, by: number): number {
  return (bx + 0x8000) * 0x10000 + (by + 0x8000);
}
