/**
 * Chantiers, bâtiments et joueur.
 *
 * Les sprites ne sont pas reconstruits à chaque frame : ils sont créés à
 * l'événement `buildingPlaced`, échangés à `buildingCompleted`, et ne bougent
 * plus. Seul Adam est repositionné, et il l'est par **interpolation** entre
 * `prevX/prevY` et la position du tick courant : la simulation tourne à
 * 20 TPS, l'écran à 60 ou 120 Hz. Sans interpolation, le personnage avance
 * par à-coups visibles.
 *
 * Un bâtiment a trois visages, trois morceaux de son sprite : le chantier,
 * le bâtiment fini, et le bâtiment cabossé, affiché dès que les mutants lui
 * ont pris la moitié de ses points de vie. Certains ont en plus un morceau
 * animé : la roue de la foreuse tourne quand elle travaille, les cultures de
 * la ferme ondulent, la cheminée du labo fume quand une recherche tourne. Un producteur
 * arrêté par un problème (`World.problem` : coffre plein, ouvrier manquant)
 * porte au-dessus du toit une bulle d'alerte qui bat doucement : il faut
 * venir le vider, ou lui trouver des bras. Mis en pause par le joueur, il
 * porte à la place la bulle « pause ». À l'arrêt, son sprite pâlit, sa roue
 * et ses cultures se figent.
 *
 * Tri en profondeur : les enfants sont ordonnés par le bas de leur emprise,
 * pour qu'Adam passe derrière la mairie quand il est au-dessus d'elle et
 * devant quand il est en dessous. Les arbres et les rochers
 * (`resourceLayer.ts`) et les mobiles partagent ce conteneur.
 *
 * Sous la barre d'un chantier, la rangée de ce qu'il attend (`siteNeeds.ts`) :
 * chaque objet du coût et son compteur, les complets estompés, ceux que la
 * ville n'a plus en corail. Elle s'efface au marteau des bâtisseurs, et au
 * dézoom, où elle deviendrait illisible.
 *
 * Au pied de chaque bâtiment fini, sa pancarte (`signboard.ts`) : le
 * médaillon de son métier et son nom court — loin des bulles d'état, qui
 * flottent au-dessus du toit. En reculant, elle ne garde que le médaillon,
 * puis s'efface ; le réglage « Pancartes » la masque partout.
 *
 * Un bâtiment amélioré (`buildingUpgraded`) change de sprite sur place : celui
 * de son niveau (`BUILDINGS[proto].upgrades`), et il rebondit comme à l'achèvement.
 *
 * Le ressenti : un bâtiment achevé fait « pop » (écrasé, étiré, posé, ancré au pied),
 * un bâtiment frappé rougit et tremble ; sous la moitié de ses points de vie,
 * une fissure barre sa façade jusqu'à la réparation. Une tour qui tire
 * s'enfonce d'un pixel, le recul. Ce sont des minuteurs de vue,
 * en millisecondes d'écran — la simulation n'en sait rien.
 */

import { Container, Graphics, Sprite, Text, type Ticker } from 'pixi.js';
import { TILE_SIZE, floorDiv } from '../core/grid.ts';
import { LIGHT, PALETTE, hex } from '../data/artDirection.ts';
import { BUILDINGS, buildingLevel } from '../data/buildings.ts';
import type { ProblemId } from '../data/problems.ts';
import { SPRITES, type SpriteId, type SpriteProto } from '../data/sprites.ts';
import { DEFAULT_LOOK, sameLook, type Look } from '../data/wardrobe.ts';
import { adamLookParts } from '../art/adamLook.ts';
import { locale, t } from '../i18n/locale.ts';
import type { Entity, EntityId } from '../sim/types.ts';
import { terrainAt } from '../sim/terrain.ts';
import { floorCost, floorMissing } from '../sim/antenna.ts';
import { isCollecting, labMissing, researchCost } from '../sim/research.ts';
import type { SiteLine } from '../sim/siteLedger.ts';
import { canPause, employs } from '../sim/staffing.ts';
import type { WorkPriority } from '../data/workers.ts';
import { siteMissing, timerText, type World } from '../sim/world.ts';
import { ZOOM } from './camera.ts';
import { MobileLayer, drawHp } from './mobileLayer.ts';
import { type HeldTool, Puppet } from './puppet.ts';
import { NEEDS_MIN_ZOOM, SiteNeeds } from './siteNeeds.ts';
import type { Signboards } from './signboard.ts';
import { signItem, signMode } from './signs.ts';
import type { SpriteLibrary } from './spriteLibrary.ts';
import type { TerrainTiles } from './terrainTiles.ts';

/** Dessous de la boîte de collision d'Adam, pour le tri en profondeur. */
const PLAYER_FOOT = 7;

const BAR_TRACK = hex(PALETTE.paper.base);
const PROGRESS_FG = hex(PALETTE.yellow.shade);
/** La construction au marteau, une fois tout livré : la teinte du cercle du poste de construction. */
const BUILD_FG = hex(PALETTE.violet.base);
const HP_FG = hex(PALETTE.coral.base);
/** Le compte à rebours d'une recherche payée : la teinte de sa barre dans la fenêtre du labo. */
const RESEARCH_FG = hex(PALETTE.mint.shade);
const INK = hex(PALETTE.ink.base);
const BAR_HEIGHT = 8;
/** Le « m:ss » sous la barre d'un producteur, en pixels monde. */
const TIMER_FONT = 11;
/** La rangée des objets d'un chantier commence autant de pixels sous la barre. */
const NEEDS_DIP = 2;

/**
 * Le « pop » d'un bâtiment achevé, en trois temps, ancré au pied : écrasé,
 * étiré, posé. Chaque clé est une échelle (largeur, hauteur) atteinte à sa
 * fraction de `POP_MS` ; entre deux clés, une courbe douce.
 */
const POP_MS = 360;
const POP_KEYS: readonly (readonly [at: number, x: number, y: number])[] = [
  [0, 1, 1],
  [1 / 3, 1.15, 0.85],
  [2 / 3, 0.95, 1.08],
  [1, 1, 1],
];
/** Durée du tremblement (± `HIT_PX`, à l'horizontale) d'un bâtiment frappé. */
const HIT_MS = 150;
const HIT_PX = 2;
const HIT_TINT = hex(PALETTE.coral.light);

/** Le recul d'une tour qui tire : elle s'enfonce de `SINK_PX` pendant `SINK_MS`. */
const SINK_MS = 90;
const SINK_PX = 1;

/** La fissure, sur la façade : à cette part de la largeur, son pied à autant de px au-dessus du pied de l'emprise. */
const CRACK_AT = 0.25;
const CRACK_RISE = 12;

/** Un producteur à l'arrêt pâlit, comme délavé : lavande, la couleur des faces de l'interface. */
const PAUSED_TINT = hex(PALETTE.paper.shade);

/** La pointe d'une bulle (alerte, pause) descend d'autant sous le haut du cadre, et monte d'autant sur une barre de vie. */
const FULL_DIP = 6;

/** La pastille de priorité rentre d'autant dans le coin haut droit du cadre : sur le toit, pas dans le vide. */
const PRIORITY_INSET = 4;
const FULL_ABOVE_BAR = 16;
/** La bulle d'alerte bat : ± `ALERT_PULSE` d'échelle, une fois par `ALERT_BEAT_MS` — doucement, sans clignoter. */
const ALERT_PULSE = 0.08;
const ALERT_BEAT_MS = 1100;

/** Le pied des piquets de la pancarte, autant de px au-dessus du pied de l'emprise ; et sa marge de chaque côté. */
const SIGN_RISE = 1;
const SIGN_MARGIN = 2;

/** Sous cette part de ses points de vie, un bâtiment montre ses blessures. */
const DAMAGED_RATIO = 0.5;

/**
 * L'arc d'Adam tire de sa poitrine, `BOW_RISE` px au-dessus de sa position
 * (`World.shootPlayerBow`) ; un tir parti de là, à `SHOOTER_EPSILON` près,
 * est le sien — les tours tirent d'ailleurs.
 */
const BOW_RISE = 8;
const SHOOTER_EPSILON = 1;

interface EntityView {
  root: Container;
  /** Le bâtiment (ou le chantier) lui-même. */
  main: Sprite;
  /** Morceau animé : roue de foreuse, cultures, fumée du labo. */
  moving: Sprite | null;
  /** Bulle d'alerte d'un producteur, visible tant qu'un problème l'arrête ; et le problème qu'elle montre. */
  alert: Sprite | null;
  alertShown: ProblemId | null;
  /** Bulle « pause » d'un producteur, visible quand il est à l'arrêt. */
  pause: Sprite | null;
  /** Pastille de priorité de travail au coin haut droit, hors de Moyenne ; et la priorité qu'elle montre. */
  priority: Sprite | null;
  priorityShown: WorkPriority | null;
  /** La fissure d'un bâtiment sous la moitié de ses points de vie. */
  crack: Sprite | null;
  /** Teinte de repos du sprite, à laquelle il revient après un coup : blanc, ou pâli à l'arrêt. */
  tint: number;
  shadow: Sprite;
  /** Barre d'avancement d'un chantier, ou barre de vie d'un bâtiment entamé. */
  bar: Graphics;
  /** Millisecondes restantes de rebond, de secousse et de recul. */
  pop: number;
  hit: number;
  sink: number;
  /** Position de repos du pied de l'emprise, en pixels monde. */
  baseX: number;
  /** Morceau affiché (`built`, `damaged`…) : ne change la texture que s'il change. */
  shown: string;
  /** Dernier état dessiné de la barre : ne retessèle que s'il change. */
  barKey: string;
  /** Le temps restant en « m:ss », sous la barre d'une nurserie ou d'un labo qui produit ; `null` ailleurs. */
  timer: Text | null;
  timerKey: string;
  /** Sous la barre d'un chantier, ce qu'il attend encore ; `null` pour un bâtiment fini. */
  needs: SiteNeeds | null;
  /** La pancarte d'un bâtiment fini, `null` pour un chantier ; et la clé de sa texture. */
  sign: Sprite | null;
  signKey: string;
}

export class EntityLayer {
  public readonly container = new Container();

  private readonly views = new Map<EntityId, EntityView>();
  private readonly adam: Puppet;
  /** Sa barre de vie, au-dessus de la tête, dès qu'une bête l'a entamé. */
  private readonly adamHp = new Graphics();
  private adamHpShown = -1;
  private readonly mobiles: MobileLayer;
  private readonly shadows: Container;
  private groundTile = '';

  private readonly world: World;
  private readonly library: SpriteLibrary;
  private readonly tiles: TerrainTiles;
  private readonly signboards: Signboards;
  /** Le réglage « Pancartes » : faux, aucune ne s'affiche. */
  public signsOn = true;
  /** La dernière recomposition d'Adam demandée : une plus ancienne qui finit après elle est jetée. */
  private dressing = 0;
  private destroyed = false;

  public constructor(world: World, library: SpriteLibrary, tiles: TerrainTiles, shadows: Container, signboards: Signboards) {
    this.world = world;
    this.library = library;
    this.tiles = tiles;
    this.signboards = signboards;
    this.shadows = shadows;
    this.container.sortableChildren = true;
    this.mobiles = new MobileLayer(world, library, tiles, this.container);

    this.adam = new Puppet(library, 'adam', tiles.shadow('grass'), { shadowWidth: 22, stride: 4 });
    this.adamHp.position.set(-9, -SPRITES.adam.height * SPRITES.adam.anchorY - 2);
    this.adamHp.visible = false;
    this.adam.root.addChild(this.adamHp);
    this.container.addChild(this.adam.root);

    world.events.on('buildingPlaced', ({ id }) => this.add(id));
    world.events.on('buildingCompleted', ({ id }) => {
      this.replace(id);

      const view = this.views.get(id);

      if (view) view.pop = POP_MS;
    });
    // Abattue, l'antenne perd son étage du haut : son sprite redescend d'un niveau.
    world.events.on('antennaFell', ({ id }) => this.replace(id));
    world.events.on('buildingUpgraded', ({ id }) => {
      this.replace(id);

      const view = this.views.get(id);

      if (view) view.pop = POP_MS;
    });
    world.events.on('buildingDamaged', ({ id }) => {
      const view = this.views.get(id);

      if (view) view.hit = HIT_MS;
    });
    world.events.on('playerHurt', () => this.adam.hit());
    // Adam s'habille comme il l'a choisi : à l'ouverture d'une partie, et à chaque « Valider » de l'éditeur.
    if (!sameLook(world.player.look, DEFAULT_LOOK)) this.dressAdam(world.player.look);
    world.events.on('lookChanged', ({ look }) => this.dressAdam(look));
    // Adam a les mains vides : l'outil découle de ce qu'il fait — la hache pour un arbre, la
    // pioche pour un rocher (fer, charbon, pierre), le marteau pour bâtir, renforcer ou réparer.
    world.events.on('resourceHarvested', ({ item }) => this.wieldTool(item === 'wood' ? 'axe' : 'pickaxe'));
    world.events.on('siteDelivered', () => this.wieldTool('hammer', true));
    world.events.on('playerRepaired', () => this.wieldTool('hammer', true));
    world.events.on('buildingUpgraded', () => this.wieldTool('hammer', true));
    world.events.on('arrowShot', ({ x, y }) => {
      const { player } = world;

      if (Math.abs(x - player.x) < SHOOTER_EPSILON && Math.abs(y - (player.y - BOW_RISE)) < SHOOTER_EPSILON) {
        this.adam.shoot();
        return;
      }

      // Une tour tire du centre de son emprise.
      const id = world.chunks.occupantAt(floorDiv(x, TILE_SIZE), floorDiv(y, TILE_SIZE));
      const view = id === undefined ? undefined : this.views.get(id);

      if (view && world.entities.get(id!)?.kind === 'tower') view.sink = SINK_MS;
    });
    for (const id of world.entities.keys()) this.add(id);
  }

  private add(id: EntityId): void {
    const entity = this.world.entities.get(id);

    if (!entity || this.views.has(id)) return;

    const view = this.build(entity);

    // Pivot au pied de l'emprise : le rebond part du sol, pas du coin haut gauche.
    view.baseX = (entity.tx + entity.width / 2) * TILE_SIZE;
    view.root.pivot.set((entity.width * TILE_SIZE) / 2, entity.height * TILE_SIZE);
    view.root.position.set(view.baseX, (entity.ty + entity.height) * TILE_SIZE);
    view.root.zIndex = (entity.ty + entity.height) * TILE_SIZE;
    this.views.set(id, view);
    this.container.addChild(view.root);
    this.shadows.addChild(view.shadow);
  }

  private replace(id: EntityId): void {
    const view = this.views.get(id);

    if (view) this.remove(id, view);
    this.add(id);
  }

  private remove(id: EntityId, view: EntityView): void {
    view.root.destroy({ children: true });
    view.shadow.destroy();
    this.views.delete(id);
  }

  private build(entity: Entity): EntityView {
    const root = new Container();
    const sprite = spriteOf(entity);
    const art: SpriteProto = SPRITES[sprite];
    const shown = entity.kind === 'site' ? 'site' : this.faceOf(entity);
    const main = footSprite(this.library.texture(`${sprite}.${shown}`), entity);
    const moving = entity.kind === 'site' ? null : (['wheel', 'crops', 'smoke'] as const).find((part) => art.parts[part]) ?? null;
    let movingSprite: Sprite | null = null;

    root.addChild(main);

    if (moving) {
      const [px, py] = art.pivots?.[moving] ?? [0, art.height];

      movingSprite = new Sprite(this.library.texture(`${sprite}.${moving}`));
      movingSprite.anchor.set(px / art.width, py / art.height);
      movingSprite.position.set(px, entity.height * TILE_SIZE - art.height + py);
      root.addChild(movingSprite);
    }

    // Une foreuse posée hors gisement reste visible, mais délavée : le joueur
    // doit comprendre pourquoi elle ne produit rien sans ouvrir un panneau.
    if (entity.kind === 'drill' && !entity.output) root.alpha = 0.5;

    // L'ombre portée : pleine, teinte foncée du sol, sous l'emprise.
    const width = entity.width * TILE_SIZE;
    const ground = terrainAt(this.world.seed, entity.tx + floorDiv(entity.width, 2), entity.ty + entity.height - 1);
    const shadow = new Sprite(this.tiles.shadow(ground));

    shadow.anchor.set(0.5);
    shadow.width = width - 4;
    shadow.height = 14;
    shadow.position.set(
      (entity.tx + entity.width / 2) * TILE_SIZE + LIGHT.shadowOffset.x,
      (entity.ty + entity.height) * TILE_SIZE - 6 + LIGHT.shadowOffset.y,
    );

    const bar = new Graphics();

    bar.visible = false;
    root.addChild(bar);

    let needs: SiteNeeds | null = null;

    if (entity.kind === 'site' || entity.kind === 'lab') {
      needs = new SiteNeeds(this.library);
      needs.root.visible = false;
      root.addChild(needs.root);
    }

    let alert: Sprite | null = null;
    let pause: Sprite | null = null;

    if (entity.kind !== 'site' && canPause(entity.proto)) {
      alert = new Sprite(this.library.part('alert', 'storeFull'));
      alert.anchor.set(SPRITES.alert.anchorX, SPRITES.alert.anchorY);
      alert.x = (entity.width * TILE_SIZE) / 2;
      alert.visible = false;
      root.addChild(alert);

      pause = new Sprite(this.library.part('paused', 'bubble'));
      pause.anchor.set(SPRITES.paused.anchorX, SPRITES.paused.anchorY);
      pause.x = (entity.width * TILE_SIZE) / 2;
      pause.visible = false;
      root.addChild(pause);
    }

    let priority: Sprite | null = null;

    if (entity.kind !== 'site' && employs(entity.proto)) {
      // Au coin haut droit du toit, à l'écart des bulles (au milieu) et de la pancarte (au pied).
      priority = new Sprite(this.library.part('priority', 'high'));
      priority.anchor.set(SPRITES.priority.anchorX, SPRITES.priority.anchorY);
      priority.visible = false;
      root.addChild(priority);
    }

    let crack: Sprite | null = null;

    if (entity.kind !== 'site') {
      crack = new Sprite(this.library.part('crack', 'zigzag'));
      crack.anchor.set(SPRITES.crack.anchorX, SPRITES.crack.anchorY);
      crack.position.set(entity.width * TILE_SIZE * CRACK_AT, entity.height * TILE_SIZE - CRACK_RISE);
      crack.visible = shown === 'damaged';
      // Juste au-dessus du bâtiment, sous la barre et les bulles.
      root.addChildAt(crack, root.getChildIndex(main) + 1);
    }

    let sign: Sprite | null = null;

    // Une décoration n'a pas de pancarte : elle est trop petite pour en porter une.
    if (entity.kind !== 'site' && entity.kind !== 'decor') {
      // Plantée au pied de la façade, au milieu : devant le bâtiment, sous sa barre et ses bulles.
      sign = new Sprite();
      sign.anchor.set(0.5, 1);
      sign.position.set((entity.width * TILE_SIZE) / 2, entity.height * TILE_SIZE - SIGN_RISE);
      sign.visible = false;
      root.addChildAt(sign, root.getChildIndex(bar));
    }

    let timer: Text | null = null;

    if (entity.kind === 'lab' || entity.kind === 'nursery') {
      timer = new Text({
        text: '',
        style: { fontFamily: 'Fredoka', fontWeight: '600', fontSize: TIMER_FONT, fill: INK },
        // Net jusqu'au zoom le plus fort, à la densité de l'écran.
        resolution: Math.min(3, window.devicePixelRatio || 1) * ZOOM.max,
      });
      timer.anchor.set(0.5, 0);
      timer.position.set((entity.width * TILE_SIZE) / 2, barTop(entity) + BAR_HEIGHT + 1);
      timer.visible = false;
      root.addChild(timer);
    }

    return {
      root,
      main,
      moving: movingSprite,
      alert,
      alertShown: null,
      pause,
      priority,
      priorityShown: null,
      crack,
      tint: 0xffffff,
      shadow,
      bar,
      pop: 0,
      hit: 0,
      sink: 0,
      baseX: 0,
      shown,
      barKey: '',
      timer,
      timerKey: '',
      needs,
      sign,
      signKey: '',
    };
  }

  /** Fini ou cabossé, selon ce qu'il reste de points de vie. */
  /** Le visage d'un bâtiment fini ; l'émetteur de l'antenne, une fois le Signal lancé, reste allumé. */
  private faceOf(entity: Exclude<Entity, { kind: 'site' }>): 'built' | 'damaged' | 'lit' {
    if (entity.hp <= buildingLevel(entity.proto, entity.level).hp * DAMAGED_RATIO) return 'damaged';
    return this.world.victory && 'lit' in SPRITES[spriteOf(entity)].parts ? 'lit' : 'built';
  }

  private drawBar(view: EntityView, entity: Entity): void {
    let ratio: number;
    let color: number;

    if (entity.kind === 'site' && this.world.awaitsBuilders(entity)) {
      // Tout est livré : la barre repart de zéro, et suit les coups de marteau des bâtisseurs.
      const { done, total } = this.world.siteBuild(entity);

      ratio = total === 0 ? 1 : done / total;
      color = BUILD_FG;
    } else if (entity.kind === 'site') {
      const total = Object.values(BUILDINGS[entity.proto].cost).reduce((sum, amount) => sum + amount, 0);

      ratio = total === 0 ? 1 : 1 - siteMissing(entity) / total;
      color = PROGRESS_FG;
    } else if (entity.kind === 'antenna' && entity.hp >= buildingLevel(entity.proto, entity.level).hp && entity.store.total() > 0) {
      // L'étage suivant se livre : intacte, l'antenne montre sa jauge comme un chantier.
      const total = floorCost(entity).reduce((sum, [, amount]) => sum + amount, 0);

      ratio = total === 0 ? 1 : 1 - floorMissing(entity) / total;
      color = PROGRESS_FG;
    } else if (entity.kind === 'lab' && entity.research !== null && entity.hp >= buildingLevel(entity.proto, entity.level).hp) {
      // Intact, le labo montre sa recherche : le coût qui se dépose comme un chantier, puis le compte à rebours.
      if (isCollecting(entity)) {
        const total = researchCost(entity.research).reduce((sum, [, amount]) => sum + amount, 0);

        ratio = total === 0 ? 1 : 1 - labMissing(entity) / total;
        color = PROGRESS_FG;
      } else {
        const timer = this.world.productionTimer(entity)!;

        ratio = 1 - timer.left / timer.total;
        color = RESEARCH_FG;
      }
    } else if (entity.kind === 'nursery' && entity.hp >= buildingLevel(entity.proto, entity.level).hp && this.world.productionTimer(entity)) {
      // Intacte et au travail, la nurserie montre le temps avant la naissance.
      const timer = this.world.productionTimer(entity)!;

      ratio = 1 - timer.left / timer.total;
      color = RESEARCH_FG;
    } else {
      const max = buildingLevel(entity.proto, entity.level).hp;

      ratio = entity.hp / max;
      color = HP_FG;
      if (ratio >= 1) {
        view.bar.visible = false;
        return;
      }
    }

    const key = `${color}:${ratio.toFixed(3)}`;

    view.bar.visible = true;
    if (key === view.barKey) return;
    view.barKey = key;

    // Une capsule blanche et son remplissage, flottant au-dessus du bâtiment — comme la maquette.
    const width = Math.min(72, entity.width * TILE_SIZE - 12);
    const x = (entity.width * TILE_SIZE - width) / 2;
    const y = barTop(entity);
    const fill = Math.max(0, Math.min(1, ratio)) * (width - 4);

    view.bar.clear().roundRect(x, y, width, BAR_HEIGHT, 4).fill(BAR_TRACK);
    if (fill > 0) view.bar.roundRect(x + 2, y + 2, Math.max(4, fill), 4, 2).fill(color);
  }

  /** Le temps restant d'une production, en « m:ss » sous sa barre : seulement tant qu'elle tourne et que la barre se voit. */
  private showTimer(view: EntityView, entity: Entity): void {
    if (!view.timer) return;

    const timer = view.bar.visible ? this.world.productionTimer(entity) : null;

    view.timer.visible = timer !== null;
    if (!timer) return;

    const text = timerText(timer.left);

    if (text !== view.timerKey) {
      view.timerKey = text;
      view.timer.text = text;
    }
  }

  /**
   * La rangée des objets attendus, juste sous la barre — tant qu'il en reste à livrer et qu'elle se lit. Le labo
   * a la même, le temps que le coût de sa recherche arrive ; payée, la barre du compte à rebours reste seule.
   */
  private showNeeds(view: EntityView, entity: Entity, zoom: number, deltaMs: number): void {
    if (!view.needs) return;

    let lines: SiteLine[] = [];

    if (zoom >= NEEDS_MIN_ZOOM && entity.kind === 'site' && !this.world.awaitsBuilders(entity)) lines = this.world.siteLedger(entity);
    else if (zoom >= NEEDS_MIN_ZOOM && entity.kind === 'lab') lines = this.world.labLedger(entity);

    view.needs.root.visible = lines.length > 0;
    if (lines.length === 0) return;

    view.needs.update(lines, (entity.width * TILE_SIZE) / 2, barTop(entity) + BAR_HEIGHT + NEEDS_DIP, deltaMs);
  }

  /** La pancarte : médaillon et nom, le médaillon seul en reculant, rien plus loin ou si le réglage la masque. */
  private showSign(view: EntityView, entity: Entity, zoom: number): void {
    if (!view.sign || entity.kind === 'site') return;

    const item = signItem(entity.kind, entity.kind === 'drill' ? entity.output : null);
    const mode = this.signsOn ? signMode(zoom) : 'none';

    view.sign.visible = mode !== 'none';
    if (mode === 'none') return;

    const key = `${this.signboards.generation}:${locale()}:${mode}:${entity.proto}:${item ?? ''}`;

    if (key === view.signKey) return;
    view.signKey = key;
    view.sign.texture = this.signboards.texture(entity.proto, t().buildings[entity.proto].sign, item, mode);
    // Jamais plus large que l'emprise : un tap sur la pancarte est un tap sur le bâtiment.
    view.sign.scale.set(Math.min(1, (entity.width * TILE_SIZE - SIGN_MARGIN * 2) / view.sign.texture.width));
  }

  /** Un outil d'Adam, le temps d'un geste — sauf s'il vise : l'arc passe avant, sans clignoter. */
  private wieldTool(tool: Exclude<HeldTool, 'bow'>, swing = false): void {
    if (this.world.player.target === null) this.adam.wield(tool, swing);
  }

  /** `alpha` est la fraction du pas de simulation déjà écoulée, dans [0, 1[. */
  public update(alpha: number, ticker: Ticker, zoom: number): void {
    const { player } = this.world;
    const x = player.prevX + (player.x - player.prevX) * alpha;
    const y = player.prevY + (player.y - player.prevY) * alpha;

    this.adam.root.position.set(x, y);
    this.adam.root.zIndex = y + PLAYER_FOOT;
    // Un ennemi à portée : Adam le vise, l'arc en main, tant qu'il le garde en joue.
    if (player.target !== null) this.adam.wield('bow');
    // La récolte se fait en marchant : on ne frappe qu'à l'arrêt.
    this.adam.update(ticker.deltaMS, player.facing, player.moving ? 'walk' : player.harvesting ? 'act' : 'idle');
    this.updateShadow(x, y);

    if (player.hp !== this.adamHpShown) {
      this.adamHpShown = player.hp;
      const maxHp = this.world.maxHp();

      this.adamHp.visible = player.hp < maxHp;
      if (this.adamHp.visible) drawHp(this.adamHp, player.hp / maxHp);
    }

    this.mobiles.update(alpha, ticker);

    for (const [id, view] of this.views) {
      const entity = this.world.entities.get(id);

      if (!entity) {
        this.remove(id, view);
        continue;
      }

      if (entity.kind !== 'site') {
        const face = this.faceOf(entity);

        if (face !== view.shown) {
          view.shown = face;
          view.main.texture = this.library.texture(`${spriteOf(entity)}.${face}`);
          if (view.crack) view.crack.visible = face === 'damaged';
        }
      }

      this.drawBar(view, entity);
      this.showTimer(view, entity);
      this.showNeeds(view, entity, zoom, ticker.deltaMS);
      this.showSign(view, entity, zoom);
      this.showAlert(view, entity, ticker.lastTime);
      this.showPause(view, entity, ticker.lastTime);
      this.showPriority(view, entity);
      this.feel(view, ticker.deltaMS);
      this.animate(view, entity, ticker.lastTime);
    }
  }

  /** La bulle d'alerte flotte et bat au-dessus du toit tant qu'un problème arrête le producteur. */
  private showAlert(view: EntityView, entity: Entity, now: number): void {
    if (!view.alert || entity.kind === 'site') return;

    const problem = this.world.problem(entity);

    view.alert.visible = problem !== null;
    if (problem === null) return;

    if (problem !== view.alertShown) {
      view.alertShown = problem;
      view.alert.texture = this.library.part('alert', problem);
    }

    // La pointe touche le haut du toit ; au-dessus de la barre de vie quand elle est là.
    const top = entity.height * TILE_SIZE - SPRITES[spriteOf(entity)].height;
    const beat = Math.sin((now / ALERT_BEAT_MS) * Math.PI * 2);

    view.alert.y = top + FULL_DIP - (view.bar.visible ? FULL_ABOVE_BAR : 0) + Math.sin(now * 0.004) * 2;
    view.alert.scale.set(1 + beat * ALERT_PULSE);
  }

  /** La bulle « pause » flotte au-dessus d'un producteur que le joueur a arrêté ; à l'arrêt, le sprite pâlit. */
  private showPause(view: EntityView, entity: Entity, now: number): void {
    if (!view.pause || entity.kind === 'site') return;

    const stopped = this.world.stopped(entity);
    // Sans ouvrier alors qu'on en demande, c'est la bulle d'alerte qui parle.
    const chosen = stopped && this.world.problem(entity) === null;

    view.pause.visible = chosen;
    view.tint = stopped ? PAUSED_TINT : 0xffffff;
    if (view.hit <= 0) view.main.tint = view.tint;
    if (!chosen) return;

    const top = entity.height * TILE_SIZE - SPRITES[spriteOf(entity)].height;

    view.pause.y = top + FULL_DIP - (view.bar.visible ? FULL_ABOVE_BAR : 0) + Math.sin(now * 0.004) * 2;
  }

  /** La pastille de priorité : flèche haute ou basse, rien en Moyenne. */
  private showPriority(view: EntityView, entity: Entity): void {
    if (!view.priority || entity.kind === 'site') return;

    const shown = entity.priority === 'normal' ? null : entity.priority;

    view.priority.visible = shown !== null;
    if (shown === null) return;
    if (shown !== view.priorityShown) {
      view.priorityShown = shown;
      view.priority.texture = this.library.part('priority', shown);
    }

    const top = entity.height * TILE_SIZE - SPRITES[spriteOf(entity)].height;

    view.priority.position.set(entity.width * TILE_SIZE - PRIORITY_INSET, top + PRIORITY_INSET);
  }

  /** L'ombre d'Adam prend la teinte du sol sous ses pieds. */
  private updateShadow(x: number, y: number): void {
    const tx = floorDiv(x, TILE_SIZE);
    const ty = floorDiv(y, TILE_SIZE);
    const key = `${tx},${ty}`;

    if (key === this.groundTile) return;
    this.groundTile = key;
    this.adam.setShadow(this.tiles.shadow(terrainAt(this.world.seed, tx, ty)));
  }

  /** La roue tourne quand la foreuse travaille ; les cultures ondulent ; le labo fume quand il cherche, le four à charbon quand il cuit. */
  private animate(view: EntityView, entity: Entity, now: number): void {
    if (!view.moving) return;

    // À l'arrêt, tout se fige.
    if (entity.kind !== 'site' && canPause(entity.proto) && this.world.stopped(entity)) return;

    if (entity.kind === 'drill') {
      if (entity.output !== null && !entity.blocked) view.moving.rotation = (now * 0.006) % (Math.PI * 2);
    } else if (entity.kind === 'farm') {
      const sway = Math.sin(now * 0.002 + entity.id);

      view.moving.skew.x = sway * 0.05;
      view.moving.scale.y = 1 + Math.sin(now * 0.004 + entity.id) * 0.03;
    } else if (entity.kind === 'lab' || entity.kind === 'forge') {
      // Une fumée légère qui monte et gonfle, en boucle, tant que le compte à rebours tourne — ou que le four cuit.
      const running = entity.kind === 'lab' ? entity.endTick > 0 : !entity.blocked;

      view.moving.visible = running;
      if (!running) return;

      const t = (now * 0.0006 + entity.id * 0.37) % 1;

      view.moving.pivot.y = t * 6;
      view.moving.scale.set(0.85 + t * 0.3);
    }
  }

  /** Rebond d'achèvement et secousse d'impact, puis retour exact au repos. */
  private feel(view: EntityView, deltaMs: number): void {
    const { root } = view;

    if (view.pop > 0) {
      view.pop = Math.max(0, view.pop - deltaMs);

      const [x, y] = popScale(1 - view.pop / POP_MS);

      root.scale.set(x, y);
    } else if (root.scale.x !== 1) {
      root.scale.set(1);
    }

    if (view.hit > 0) {
      view.hit = Math.max(0, view.hit - deltaMs);

      const strength = view.hit / HIT_MS;

      root.x = view.baseX + Math.sign(Math.sin(view.hit * 0.25)) * HIT_PX;
      view.main.tint = strength > 0.35 ? HIT_TINT : view.tint;
    } else if (root.x !== view.baseX) {
      root.x = view.baseX;
      view.main.tint = view.tint;
    }

    if (view.sink > 0) {
      view.sink = Math.max(0, view.sink - deltaMs);
      view.main.y = view.root.pivot.y + (view.sink > 0 ? SINK_PX : 0);
    }
  }

  /**
   * Recompose les calques d'Adam (`art/adamLook.ts`) en textures : un corps par
   * direction, le pied. Ses animations n'y voient que des textures neuves —
   * le même nombre de sprites qu'avant, aucun coût par image.
   */
  private dressAdam(look: Look): void {
    const token = ++this.dressing;

    void this.library.dress('adam', adamLookParts(look)).then(({ install }) => {
      if (token !== this.dressing || this.destroyed) return;

      const release = install();

      this.adam.refresh();
      release();
    });
  }

  public destroy(): void {
    this.destroyed = true;
    this.mobiles.destroy();
    this.adam.destroy();
    this.container.destroy({ children: true });
  }
}

/** L'échelle du « pop » à la fraction `t` de sa durée : interpolée entre deux clés de `POP_KEYS`. */
function popScale(t: number): [number, number] {
  for (let i = 1; i < POP_KEYS.length; i += 1) {
    const [at, x, y] = POP_KEYS[i]!;

    if (t > at && i < POP_KEYS.length - 1) continue;

    const [from, fx, fy] = POP_KEYS[i - 1]!;
    const u = Math.max(0, Math.min(1, (t - from) / (at - from)));
    const ease = u * u * (3 - 2 * u);

    return [fx + (x - fx) * ease, fy + (y - fy) * ease];
  }
  return [1, 1];
}

/**
 * Les bâtiments sont vus en 3/4 : leur cadre est plus haut que l'emprise.
 * Ancré au pied, il s'aligne sur le bas de l'emprise et le toit monte
 * au-dessus des tuiles de derrière — le tri par `zIndex` fait le reste.
 */
function footSprite(texture: Sprite['texture'], entity: Entity): Sprite {
  const sprite = new Sprite(texture);

  sprite.anchor.set(0, 1);
  sprite.y = entity.height * TILE_SIZE;
  return sprite;
}

/** Le haut de la barre, au-dessus du toit, dans le repère du bâtiment. */
function barTop(entity: Entity): number {
  return entity.height * TILE_SIZE - SPRITES[spriteOf(entity)].height - 12;
}

/** Le sprite d'un chantier est celui du prototype ; celui d'un bâtiment fini, celui de son niveau. */
function spriteOf(entity: Entity): SpriteId {
  return entity.kind === 'site' ? BUILDINGS[entity.proto].sprite : buildingLevel(entity.proto, entity.level).sprite;
}
