/**
 * Le renderer : la seule chose qui parle à Pixi.
 *
 * Il lit le monde, il ne l'écrit jamais. `draw()` reçoit `alpha`, la fraction
 * du pas de simulation déjà écoulée, et s'en sert pour interpoler — la
 * simulation avance à 20 TPS, l'écran affiche à 60 ou 120 Hz.
 *
 * Deux conteneurs seulement :
 * - `world`, translaté par la caméra, où vit tout ce qui a des coordonnées
 *   monde : le sol baké, l'eau qui bouge par-dessus, les zones des bases
 *   mutantes, le rayon de coupe d'une cabane, les ombres portées (et celles des particules, leurs flaques), le
 *   cadre de sélection au sol, puis le conteneur trié en profondeur (bâtiments, arbres, rochers, personnages), les particules, la
 *   nuit (une passe de teinte et ses lueurs), le brouillard de guerre (un voile indigo, `fogLayer.ts`) et le fantôme de construction ;
 * - `hud`, en pixels écran, où vivent la météo, les ondes du Signal et les repères de bord (le
 *   joystick, lui, est dans le DOM : `ui/joystick.ts`).
 *
 * Tout est vectoriel, rastérisé à la résolution de l'écran : aucune texture
 * n'est agrandie, aucune n'est en `nearest`.
 */

import { Application, Container } from 'pixi.js';
import type { TileCoord } from '../core/grid.ts';
import { GROUND, SIGNAL_WAVES, hex } from '../data/artDirection.ts';
import type { BuildingId } from '../data/buildings.ts';
import type { ItemId } from '../data/items.ts';
import type { GhostState, RoadTool, RoadTrail } from '../input/placement.ts';
import type { EntityId } from '../sim/types.ts';
import type { Selection } from '../ui/creatureView.ts';
import { STEP_MS, type World } from '../sim/world.ts';
import { Camera, ZOOM, stepZoom } from './camera.ts';
import { ChunkLayer } from './chunkLayer.ts';
import { EnemyBaseLayer } from './enemyBaseLayer.ts';
import { ChestLayer } from './chestLayer.ts';
import { SpotLayer } from './spotLayer.ts';
import { EntityLayer } from './entityLayer.ts';
import { FogLayer } from './fogLayer.ts';
import { GhostLayer } from './ghostLayer.ts';
import { IndicatorLayer, indicatorSources, type ScreenRect } from './indicatorLayer.ts';
import { NightLayer } from './nightLayer.ts';
import { ParticleLayer } from './particles.ts';
import { ResourceLayer } from './resourceLayer.ts';
import { SelectionLayer } from './selectionLayer.ts';
import { SignalLayer } from './signalLayer.ts';
import { Signboards } from './signboard.ts';
import { SpriteLibrary, type AtlasStats } from './spriteLibrary.ts';
import { TerrainTiles, terrainSources } from './terrainTiles.ts';
import { WaterLayer, type WaterStats } from './waterLayer.ts';
import { WorkReachLayer } from './workReach.ts';
import { WeatherLayer } from './weatherLayer.ts';

/** Le recul de la caméra quand l'antenne s'allume : de quoi voir le pylône entier et ses premières ondes. */
const SIGNAL_ZOOM = 0.75;

export class GameRenderer {
  public readonly camera = new Camera();

  private readonly worldContainer = new Container();
  private readonly hudContainer = new Container();
  private readonly chunkLayer: ChunkLayer;
  private readonly waterLayer: WaterLayer;
  private readonly shadows = new Container();
  private readonly entityLayer: EntityLayer;
  private readonly resourceLayer: ResourceLayer;
  private readonly enemyBases: EnemyBaseLayer;
  private readonly chests: ChestLayer;
  private readonly spots: SpotLayer;
  private readonly ghostLayer: GhostLayer;
  private readonly workReach: WorkReachLayer;
  private readonly selection: SelectionLayer;
  /** Le bâtiment dont la fenêtre est ouverte : un cadre l'entoure, une cabane y montre son rayon de coupe. */
  private selected: Selection | null = null;
  private readonly nightLayer: NightLayer;
  private readonly fogLayer: FogLayer;
  public readonly particles: ParticleLayer;
  private readonly library: SpriteLibrary;
  private readonly signboards: Signboards;
  private readonly tiles: TerrainTiles;
  private readonly indicators: IndicatorLayer;
  private readonly weather: WeatherLayer;
  private readonly signal: SignalLayer;

  public readonly app: Application;

  private readonly world: World;

  private constructor(app: Application, world: World, library: SpriteLibrary) {
    this.app = app;
    this.world = world;
    this.library = library;
    this.tiles = new TerrainTiles(library);
    this.chunkLayer = new ChunkLayer(app.renderer, library, this.tiles, world.seed, world.roads, world.land);
    // Une route posée ou retirée rebake le sol sous elle : c'est le seul changement que le sol connaisse.
    const repave = ({ tiles }: { tiles: readonly TileCoord[] }): void => {
      for (const { tx, ty } of tiles) this.chunkLayer.invalidate(tx, ty);
    };

    world.events.on('roadPaved', repave);
    world.events.on('roadRemoved', repave);
    // Une terre dépolluée redevient du sol ordinaire : le bloc se rebake.
    world.events.on('landCleaned', repave);
    this.waterLayer = new WaterLayer(world.seed);
    this.signboards = new Signboards(app.renderer, library);
    this.entityLayer = new EntityLayer(world, library, this.tiles, this.shadows, this.signboards);
    this.resourceLayer = new ResourceLayer(world, library, this.tiles, this.entityLayer.container, this.shadows);
    this.enemyBases = new EnemyBaseLayer(world, library, this.tiles, this.entityLayer.container, this.shadows);
    this.chests = new ChestLayer(world, library, this.tiles, this.entityLayer.container, this.shadows);
    this.spots = new SpotLayer(world, library, this.entityLayer.container);
    this.indicators = new IndicatorLayer(world, library);
    this.ghostLayer = new GhostLayer(world, library);
    this.workReach = new WorkReachLayer(world);
    this.selection = new SelectionLayer(world, this.entityLayer.container);
    this.nightLayer = new NightLayer(app.renderer, world);
    this.fogLayer = new FogLayer(world);
    this.weather = new WeatherLayer(world, library);
    this.particles = new ParticleLayer(library);
    this.signal = new SignalLayer(world);
    // L'antenne s'allume : la caméra recule vers elle le temps que ses ondes couvrent l'écran.
    world.events.on('signalSent', ({ x, y }) => this.camera.zoomOut(SIGNAL_ZOOM, SIGNAL_WAVES.durationMs, { x, y }));

    this.worldContainer.addChild(
      this.chunkLayer.container,
      this.waterLayer.container,
      this.enemyBases.zones,
      this.workReach.container,
      this.shadows,
      this.particles.ground,
      this.weather.ground,
      this.selection.container,
      this.entityLayer.container,
      this.particles.container,
      this.nightLayer.container,
      this.fogLayer.container,
      this.ghostLayer.container,
    );

    this.hudContainer.addChild(this.weather.screen, this.signal.container, this.indicators.container);

    app.stage.addChild(this.worldContainer, this.hudContainer);

    this.camera.centerOn(world.player.x, world.player.y);
  }

  public static async create(world: World, mount: HTMLElement): Promise<GameRenderer> {
    const app = new Application();

    await app.init({
      resizeTo: mount,
      background: hex(GROUND.grass.base),
      // Les sprites arrivent déjà lissés de la rastérisation SVG : l'anticrénelage
      // du framebuffer ne servirait qu'aux barres, et coûte cher sur mobile.
      antialias: false,
      autoDensity: true,
      resolution: window.devicePixelRatio,
      // Le doigt est routé par `input/pointer.ts` : on désactive le système
      // d'événements de Pixi plutôt que de le laisser tester la scène pour rien.
      eventMode: 'none',
    });

    mount.append(app.canvas);

    const library = await SpriteLibrary.load([...terrainSources(), ...indicatorSources()]);

    return new GameRenderer(app, world, library);
  }

  public get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  public screenToWorld(x: number, y: number): { x: number; y: number } {
    return this.camera.screenToWorld(x, y);
  }

  public worldToScreen(x: number, y: number): { x: number; y: number } {
    return this.camera.worldToScreen(x, y);
  }

  /**
   * Place occupée par le HUD en haut et en bas de l'écran, et ce qu'il pose le
   * long des bords entre les deux : les repères de bord l'évitent.
   */
  public setHudInsets(top: number, bottom: number, obstacles: readonly ScreenRect[]): void {
    this.indicators.setInsets(top, bottom, obstacles);
  }

  /** La ressource que réclame le conseil : un repère pointe vers son gisement le plus proche. */
  public setObjective(item: ItemId | null): void {
    this.indicators.setObjective(item);
  }

  /** Une alerte de la ville tapée : un repère de bord pointe quelques secondes vers le bâtiment en cause. */
  public pointTo(id: EntityId, item: ItemId): void {
    this.indicators.pointTo(id, item);
  }

  /** Le bâtiment ou la créature sélectionné — sa fenêtre est ouverte —, ou `null`. */
  public setSelected(selected: Selection | null): void {
    this.selected = selected;
  }

  /** Le réglage « Pancartes » : montre ou masque celles de tous les bâtiments. */
  public setSigns(on: boolean): void {
    this.entityLayer.signsOn = on;
  }

  /** Le repère de la mairie est-il sous ce point écran ? */
  public homeIndicatorAt(x: number, y: number): boolean {
    return this.indicators.homeAt(x, y);
  }

  /** La caméra glisse vers (x, y) monde, s'y attarde une seconde, puis revient sur Adam. */
  public peek(x: number, y: number): void {
    this.camera.peek(x, y);
  }

  /** Pose la caméra sur (x, y) monde jusqu'à ce qu'Adam marche : le tap sur la carte du monde. */
  public lookAt(x: number, y: number): void {
    this.camera.lookAt(x, y);
  }

  /** Le centre de ce que montre la caméra, et sa taille, en pixels monde : le cadre de la carte du monde. */
  public get cameraView(): { x: number; y: number; width: number; height: number } {
    const { camera } = this;

    return { x: camera.centerX, y: camera.centerY, width: camera.viewWidth / camera.zoom, height: camera.viewHeight / camera.zoom };
  }

  /**
   * Masque la scène — la carte du monde la couvre — ou la remontre. Masquée,
   * elle ne coûte plus rien au GPU ; `draw` continue de suivre le monde.
   */
  public setHidden(hidden: boolean): void {
    this.app.stage.visible = !hidden;
  }

  /** La carte glisse d'elle-même (recul, coup d'œil) : cf. `Camera.drifting`. */
  public get cameraDrifting(): boolean {
    return this.camera.drifting;
  }

  /** Recule la caméra un instant : cf. `Camera.zoomOut`. */
  public zoomOut(zoom: number, holdMs: number, focus: { x: number; y: number } | null = null): void {
    this.camera.zoomOut(zoom, holdMs, focus);
  }

  /** Le niveau de zoom choisi par le joueur : cf. `Camera.level`. */
  public get zoomLevel(): number {
    return this.camera.level;
  }

  /** Ce que les boutons de zoom peuvent encore faire : avancer, reculer, revenir sur Adam. */
  public get zoomLimits(): { canZoomIn: boolean; canZoomOut: boolean; atHome: boolean } {
    const level = this.camera.level;

    return { canZoomIn: level < ZOOM.max - 1e-3, canZoomOut: level > ZOOM.min + 1e-3, atHome: this.camera.atHome };
  }

  /** Zoome de `factor` autour d'un point écran : cf. `Camera.zoomBy`. */
  public zoomBy(factor: number, anchor: { x: number; y: number } | null, immediate = false): void {
    this.camera.zoomBy(factor, anchor, immediate);
  }

  /** Un cran de zoom, en glissant, autour du centre de l'écran. */
  public stepZoom(direction: 1 | -1): void {
    this.camera.zoomTo(stepZoom(this.camera.level, direction));
  }

  /** Retour au zoom par défaut, centré sur Adam. */
  public resetZoom(): void {
    this.camera.resetZoom();
  }

  /** Reprend un niveau de zoom mémorisé, sans glisser. */
  public restoreZoom(level: number): void {
    this.camera.restoreLevel(level);
  }

  /** Un clic de souris refusé : le fantôme secoue la tête. */
  public refuseGhost(): void {
    this.ghostLayer.refuse();
  }

  /**
   * La mairie vient d'être frappée. Si elle est hors de l'écran, son repère
   * clignote ; renvoie vrai dans ce cas, pour que le HUD sonne l'alarme.
   */
  public alarmTownHall(): boolean {
    if (!this.indicators.hallOffScreen) return false;
    this.indicators.alarm();
    return true;
  }

  /** Secoue la caméra : 0.2 pour un coup, 0.6 pour un effondrement. */
  public shake(amount: number): void {
    this.camera.shake(amount);
  }

  /**
   * `armed` : le bâtiment armé au menu de construction, ou `null` hors du mode construction.
   * `road` : l'outil route armé à sa place, et son tracé.
   */
  public draw(
    alpha: number,
    armed: BuildingId | null,
    ghost: GhostState | null,
    road: { tool: RoadTool; trail: RoadTrail | null } | null = null,
  ): void {
    const building = armed !== null;
    const { player } = this.world;

    this.camera.resize(this.app.screen.width, this.app.screen.height);
    // La caméra suit la position interpolée, pas la position de simulation :
    // sinon elle avance par sauts de 7 pixels à 20 TPS. La vitesse, elle, se
    // lit sur le dernier pas : c'est elle qui décide de l'avance.
    this.camera.follow(
      player.prevX + (player.x - player.prevX) * alpha,
      player.prevY + (player.y - player.prevY) * alpha,
      (player.x - player.prevX) / STEP_MS,
      (player.y - player.prevY) / STEP_MS,
      this.app.ticker.deltaMS,
    );

    // Décalage arrondi au pixel d'écran : une caméra sub-pixel fait scintiller les bords des tuiles.
    const resolution = this.app.renderer.resolution;

    this.worldContainer.position.set(
      Math.round(this.camera.offsetX() * resolution) / resolution,
      Math.round(this.camera.offsetY() * resolution) / resolution,
    );
    this.worldContainer.scale.set(this.camera.zoom);

    this.chunkLayer.update(this.camera);
    this.waterLayer.update(this.camera, this.app.ticker.deltaMS);
    // Un seul appel au juge par frame : le fantôme colore les cases, l'arbre qui gêne clignote.
    const block = building && ghost ? this.world.placementBlock(ghost.building, ghost.tx, ghost.ty) : null;

    this.resourceLayer.update(this.camera, this.app.ticker.deltaMS, block?.reason === 'resource' ? block.tiles : []);
    this.entityLayer.update(alpha, this.app.ticker, this.camera.zoom);
    this.enemyBases.update(this.app.ticker.deltaMS);
    this.chests.update(this.camera, this.app.ticker.deltaMS);
    this.spots.update(this.camera, this.app.ticker.deltaMS);
    this.particles.update(this.app.ticker.deltaMS);
    this.nightLayer.update(alpha);
    this.fogLayer.update(this.camera);
    if (road) this.ghostLayer.updateRoad(road.tool, road.trail, this.app.ticker.deltaMS);
    else this.ghostLayer.update(armed, ghost, block, this.app.ticker.deltaMS);
    this.workReach.update(building ? ghost : null, this.selected?.kind === 'building' ? this.selected.id : null);
    this.selection.update(this.selected, alpha, this.app.ticker.deltaMS);
    this.weather.update(this.camera, this.app.ticker.deltaMS, alpha);
    this.signal.update(this.camera, this.app.ticker.deltaMS);
    this.indicators.update(this.camera, this.app.ticker.deltaMS, alpha);
  }

  /** Nombre de blocs de sol bakés — le HUD de debug l'affiche. */
  public get bakedChunks(): number {
    return this.chunkLayer.drawn;
  }

  /** Sprites d'eau à l'écran, et combien sont animés — le HUD de debug les affiche. */
  public get waterStats(): WaterStats {
    return this.waterLayer.stats;
  }

  /** Particules de météo affichées — le HUD de debug l'affiche, pour mesurer sur téléphone. */
  public get weatherParticles(): number {
    return this.weather.particleCount;
  }

  /** Coût de l'atlas de sprites : pages, images, mémoire, temps de chargement. */
  public get atlasStats(): AtlasStats {
    return this.library.stats;
  }

  public destroy(): void {
    this.chunkLayer.destroy();
    this.waterLayer.destroy();
    this.resourceLayer.destroy();
    this.entityLayer.destroy();
    this.signboards.destroy();
    this.enemyBases.destroy();
    this.chests.destroy();
    this.spots.destroy();
    this.ghostLayer.destroy();
    this.workReach.destroy();
    this.selection.destroy();
    this.nightLayer.destroy();
    this.fogLayer.destroy();
    this.indicators.destroy();
    this.weather.destroy();
    this.signal.destroy();
    this.particles.destroy();
    this.library.destroy();
    this.app.destroy(true, { children: true });
  }
}
