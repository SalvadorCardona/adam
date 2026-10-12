/**
 * Repères au bord de l'écran.
 *
 * Sur un téléphone, on voit une douzaine de tuiles de large : un mutant qui
 * arrive à vingt tuiles est invisible jusqu'au dernier moment, et la mairie
 * se perd dès qu'on part couper du bois. Un jeu pro ne laisse pas le joueur
 * deviner — il montre la direction.
 *
 * Trois sortes de repères, en pixels écran, plaqués contre le bord : une
 * pastille ronde en trois tons, sans contour, qui pointe vers sa cible —
 * - vert fluo, avec un gros œil, par mutant hors champ (la teinte des
 *   mutants), plus opaque quand il approche — et, dans la météo de brouillard, par
 *   mutant avalé par la brume même s'il est à l'écran. Le brouillard de
 *   guerre, lui, les tait : seul un mutant sur une case vue a son repère ;
 * - vert fluo, plus gros et qui bat, vers le point d'où surgira la
 *   prochaine vague, pendant les trois secondes de son annonce ;
 * - jaune, avec un petit toit, vers la mairie (ou son chantier) quand elle
 *   sort du champ, qui pulse tant que le chantier attend quelque chose, et
 *   qui grossit et clignote en corail quand la mairie est frappée (`alarm`) ;
 * - dans la teinte de sa famille, avec l'icône de l'objet, vers le gisement
 *   le plus proche de la ressource que réclame le conseil. Un gisement que le
 *   joueur n'a encore jamais eu à l'écran est une piste : un « ? » l'annonce ;
 * - dans la teinte de sa famille, avec l'icône de l'objet, vers le bâtiment
 *   d'une alerte de la ville tapée dans le panneau du sac (`pointTo`) —
 *   la forge qui attend son charbon —, quelques secondes.
 *
 * La mairie, le gisement et le bâtiment d'une alerte disent leur distance (« 24 m ») quand ils sont
 * loin. Le repère de la mairie se tape (`homeAt`).
 *
 * Aucun repère ne se pose sous le HUD : la zone utile s'arrête sous la quête
 * et au-dessus du bouton du bas (`setInsets`), et les boutons et le sac, qui
 * descendent le long des bords, sont contournés en glissant le long du bord
 * libre.
 *
 * Tout est redessiné à chaque frame dans un seul `Graphics` : quelques
 * disques, pas de quoi justifier un pool.
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { TILE_SIZE, floorDiv } from '../core/grid.ts';
import { FAMILY_TONES, PALETTE, hex, type Tone } from '../data/artDirection.ts';
import { ICON_SIZE, ITEM_ICONS } from '../data/icons.ts';
import { ITEM_IDS, type ItemId } from '../data/items.ts';
import { findDeposit, type Deposit } from '../sim/deposits.ts';
import { ticksToNextWave } from '../sim/dayNight.ts';
import type { EntityId } from '../sim/types.ts';
import { TICKS_PER_SECOND, type World } from '../sim/world.ts';
import type { Camera } from './camera.ts';
import type { SpriteLibrary, SvgSource } from './spriteLibrary.ts';
import { FOG_CLEAR_TILES } from './weatherLayer.ts';

/**
 * Marges par défaut où les repères ne vont pas : l'objectif en haut, le bouton
 * de construction en bas. Le HUD les corrige à chaque instant (`setInsets`) :
 * la quête grandit quand un conseil s'affiche.
 */
const MARGIN_TOP = 132;
const MARGIN_BOTTOM = 96;
const MARGIN_SIDE = 22;

/** Écart entre le bord du HUD et la pointe d'une flèche. */
const INSET_GAP = 18;

/** Demi-encombrement d'un repère et de son étiquette : ce qu'il garde entre lui et un élément du HUD. */
const CLEARANCE = 30;

/** Place réservée sous la zone utile pour l'étiquette de distance. */
const LABEL_ROOM = 20;

/** Durée du clignotement du repère de la mairie après un coup, en ms, et sa cadence. */
const ALARM_MS = 2500;
const ALARM_BLINK_MS = 180;

/** Au-delà de cette distance en tuiles, un mutant hors champ est dessiné au minimum d'opacité. */
const FAR_TILES = 24;

/** Au-delà, la mairie et le gisement disent leur distance. Une tuile fait un mètre. */
const LABEL_TILES = 10;

/** Rayon de la zone tapable autour d'une pastille : un pouce, pas un stylet. */
const HIT_RADIUS = 28;

/** Grain de ce que le joueur a vu, en tuiles : une case vue à l'écran est découverte. */
const SEEN_CELL = 4;

/** Le gisement visé est recherché au plus toutes les … ms : c'est une fouille de la seed. */
const SEARCH_MS = 500;

/** La teinte de famille de chaque objet (`FAMILY_TONES`) : corail pour la pierre, menthe pour le bois. */
export const ITEM_TONES: Record<ItemId, Tone> = {
  wood: FAMILY_TONES.vegetation,
  stone: FAMILY_TONES.stone,
  ironOre: FAMILY_TONES.iron,
  coal: FAMILY_TONES.coal,
  food: FAMILY_TONES.colony,
  meat: FAMILY_TONES.stone,
  water: FAMILY_TONES.water,
  ironPlate: FAMILY_TONES.iron,
  mutantGoo: FAMILY_TONES.mutants,
  wolfFang: 'paper',
  crabClaw: FAMILY_TONES.humans,
  radCore: FAMILY_TONES.mutants,
  amber: FAMILY_TONES.colony,
  pearl: FAMILY_TONES.water,
  quartz: FAMILY_TONES.ruins,
  spore: FAMILY_TONES.ruins,
};

/** Durée du repère d'une alerte de la ville, en ms : le temps de regarder, puis de marcher. */
const FLAG_MS = 8000;

/** Taille de l'icône d'objet dans la pastille, en pixels écran. */
const ICON_PX = 14;

/** Les icônes d'objets, rastérisées dans l'atlas avec les sprites. */
export function indicatorSources(): SvgSource[] {
  return ITEM_IDS.map((item) => ({ key: iconKey(item), svg: ITEM_ICONS[item], width: ICON_SIZE, height: ICON_SIZE }));
}

export function iconKey(item: ItemId): string {
  return `icon.${item}`;
}

/** Un rectangle en pixels écran — un `DOMRect` convient. */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** La zone où les repères ont le droit de se poser, bords compris. */
interface Zone {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type Glyph = 'eye' | 'home' | 'item';

/** Une pastille posée : son centre à l'écran, et si sa flèche descend. */
interface Pin {
  x: number;
  y: number;
  down: boolean;
}

/** Secondes avant une vague pendant lesquelles le repère montre d'où elle vient : celles de l'annonce. */
const ANNOUNCE_SECONDS = 3;

export class IndicatorLayer {
  public readonly container = new Container();

  private readonly graphics = new Graphics();
  private readonly icon = new Sprite();
  private readonly homeLabel = label();
  private readonly depositLabel = label();
  private readonly flagIcon = new Sprite();
  private readonly flagLabel = label();
  private readonly world: World;
  private readonly library: SpriteLibrary;
  private elapsed = 0;
  private insetTop = MARGIN_TOP;
  private insetBottom = MARGIN_BOTTOM;
  private obstacles: readonly ScreenRect[] = [];
  private alarmMs = 0;

  /** Centre de la pastille de la mairie au dernier cadre, pour le tap. */
  private home: Pin | null = null;

  /** Les cases de `SEEN_CELL` tuiles déjà passées à l'écran. Vue seulement : ce n'est pas de l'état de jeu. */
  private readonly seen = new Set<string>();
  private objective: ItemId | null = null;
  private deposit: Deposit | null = null;
  private searchIn = 0;

  /** Le bâtiment d'une alerte tapée, l'objet en cause, et le temps qui reste au repère. */
  private flag: { id: EntityId; item: ItemId; ms: number } | null = null;

  public constructor(world: World, library: SpriteLibrary) {
    this.world = world;
    this.library = library;
    this.icon.anchor.set(0.5);
    this.icon.visible = false;
    this.flagIcon.anchor.set(0.5);
    this.flagIcon.visible = false;
    this.container.addChild(this.graphics, this.icon, this.flagIcon, this.homeLabel, this.depositLabel, this.flagLabel);
  }

  /**
   * Place occupée par le HUD : hauteurs en haut et en bas, pleine largeur, et
   * les éléments posés le long des bords entre les deux (boutons, sac).
   */
  public setInsets(top: number, bottom: number, obstacles: readonly ScreenRect[]): void {
    this.insetTop = top + INSET_GAP;
    this.insetBottom = bottom + INSET_GAP;
    this.obstacles = obstacles.filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
  }

  /** La ressource que le conseil envoie chercher, ou `null` : pas de repère d'objectif. */
  public setObjective(item: ItemId | null): void {
    if (item === this.objective) return;
    this.objective = item;
    this.deposit = null;
    this.searchIn = 0;
  }

  /** Une alerte de la ville tapée : un repère pointe quelques secondes vers son bâtiment. */
  public pointTo(id: EntityId, item: ItemId): void {
    this.flag = { id, item, ms: FLAG_MS };
  }

  /** Le repère de la mairie est-il sous ce point écran ? */
  public homeAt(x: number, y: number): boolean {
    return this.home !== null && Math.hypot(x - this.home.x, y - this.home.y) <= HIT_RADIUS;
  }

  /** Vrai si la mairie était hors de l'écran au dernier cadre : son repère était dessiné. */
  public get hallOffScreen(): boolean {
    return this.home !== null;
  }

  /** La mairie vient d'être frappée : son repère clignote quelques secondes. */
  public alarm(): void {
    this.alarmMs = ALARM_MS;
  }

  public update(camera: Camera, deltaMs: number, alpha: number): void {
    const g = this.graphics;

    this.elapsed += deltaMs;
    this.alarmMs = Math.max(0, this.alarmMs - deltaMs);
    g.clear();
    this.icon.visible = false;
    this.homeLabel.visible = false;
    this.depositLabel.visible = false;
    this.flagIcon.visible = false;
    this.flagLabel.visible = false;
    this.home = null;

    const { player } = this.world;
    const px = player.prevX + (player.x - player.prevX) * alpha;
    const py = player.prevY + (player.y - player.prevY) * alpha;
    const zone = this.zone(camera);
    const foggy = this.world.weather()?.id === 'fog';

    this.discover(camera);

    for (const mobile of this.world.mobiles.values()) {
      // Le brouillard de guerre : seul un mutant vu a son repère — la tour de guet sert à les voir venir.
      if (mobile.kind !== 'mutant' || !this.world.sees(mobile.x, mobile.y)) continue;

      const x = mobile.prevX + (mobile.x - mobile.prevX) * alpha;
      const y = mobile.prevY + (mobile.y - mobile.prevY) * alpha;
      const distance = Math.hypot(x - px, y - py) / TILE_SIZE;
      const near = 1 - Math.min(1, distance / FAR_TILES);

      this.arrow(camera, zone, x, y - 16, 'toxic', 0.45 + near * 0.55, 1, 'eye', foggy && distance > FOG_CLEAR_TILES);
    }

    this.searchIn -= deltaMs;
    if (this.objective && this.searchIn <= 0) {
      this.searchIn = SEARCH_MS;
      this.deposit = findDeposit(this.world, this.objective, player.x, player.y, (tx, ty) => this.isSeen(tx, ty));
    }

    if (this.objective && this.deposit) {
      const x = (this.deposit.tx + 0.5) * TILE_SIZE;
      const y = (this.deposit.ty + 0.5) * TILE_SIZE;
      const center = this.arrow(camera, zone, x, y, ITEM_TONES[this.objective], 1, 1, 'item');

      if (center) {
        this.icon.texture = this.library.texture(iconKey(this.objective));
        this.icon.width = ICON_PX;
        this.icon.height = ICON_PX;
        this.icon.position.set(center.x, center.y);
        this.icon.visible = true;

        const tiles = Math.hypot(x - px, y - py) / TILE_SIZE;

        if (!this.deposit.known) this.tag(this.depositLabel, center, '?');
        else if (tiles >= LABEL_TILES) this.tag(this.depositLabel, center, meters(tiles));
      }
    }

    this.pointFlag(camera, zone, px, py, deltaMs);

    const { world } = this;
    const clock = world.clock();
    const left = clock ? ticksToNextWave(clock) : 0;

    // Une nuit calme — aucune base debout, rien en réserve — n'a rien à montrer du doigt.
    if (clock && !world.defeated && left > 0 && left <= ANNOUNCE_SECONDS * TICKS_PER_SECOND && world.raidSize(clock.cycle).count > 0) {
      const origin = world.waveOrigin();

      this.arrow(camera, zone, origin.x, origin.y, 'toxic', 1, 1.25 + Math.sin(this.elapsed / 120) * 0.15, 'eye');
    }

    const hall = this.world.entities.get(this.world.townHallId);

    if (hall) {
      const x = (hall.tx + hall.width / 2) * TILE_SIZE;
      const y = (hall.ty + hall.height / 2) * TILE_SIZE;
      const pulse = hall.kind === 'site' ? 1 + Math.sin(this.elapsed / 180) * 0.12 : 1;
      const blink = this.alarmMs > 0 && Math.floor(this.alarmMs / ALARM_BLINK_MS) % 2 === 0;
      const scale = this.alarmMs > 0 ? 1.3 + Math.sin(this.elapsed / 90) * 0.1 : pulse;
      const center = this.arrow(camera, zone, x, y, blink ? 'coral' : 'yellow', 1, scale, 'home');
      const tiles = Math.hypot(x - px, y - py) / TILE_SIZE;

      this.home = center;
      if (center && tiles >= LABEL_TILES) this.tag(this.homeLabel, center, meters(tiles));
    }
  }

  /** Le repère d'une alerte de la ville : il bat, et s'éteint au bout de `FLAG_MS` ou si le bâtiment tombe. */
  private pointFlag(camera: Camera, zone: Zone, px: number, py: number, deltaMs: number): void {
    if (!this.flag) return;

    const target = this.world.entities.get(this.flag.id);

    this.flag.ms -= deltaMs;
    if (!target || this.flag.ms <= 0) {
      this.flag = null;
      return;
    }

    const x = (target.tx + target.width / 2) * TILE_SIZE;
    const y = (target.ty + target.height / 2) * TILE_SIZE;
    const center = this.arrow(camera, zone, x, y, ITEM_TONES[this.flag.item], 1, 1.15 + Math.sin(this.elapsed / 150) * 0.1, 'item');

    if (!center) return;
    this.flagIcon.texture = this.library.texture(iconKey(this.flag.item));
    this.flagIcon.width = ICON_PX;
    this.flagIcon.height = ICON_PX;
    this.flagIcon.position.set(center.x, center.y);
    this.flagIcon.visible = true;

    const tiles = Math.hypot(x - px, y - py) / TILE_SIZE;

    if (tiles >= LABEL_TILES) this.tag(this.flagLabel, center, meters(tiles));
  }

  /** La zone utile de l'écran : entre la quête et le bouton du bas, étiquette comprise. */
  private zone(camera: Camera): Zone {
    const height = camera.viewHeight;

    return {
      left: MARGIN_SIDE,
      right: camera.viewWidth - MARGIN_SIDE,
      top: Math.min(this.insetTop, height / 2 - 40),
      bottom: Math.max(height - this.insetBottom - LABEL_ROOM, height / 2 + 40),
    };
  }

  /** Tout ce qui passe à l'écran est découvert. */
  private discover(camera: Camera): void {
    const cells = camera.visibleCells(SEEN_CELL * TILE_SIZE, 0);

    for (let cy = cells.minCy; cy <= cells.maxCy; cy += 1) {
      for (let cx = cells.minCx; cx <= cells.maxCx; cx += 1) this.seen.add(`${cx},${cy}`);
    }
  }

  private isSeen(tx: number, ty: number): boolean {
    return this.seen.has(`${floorDiv(tx, SEEN_CELL)},${floorDiv(ty, SEEN_CELL)}`);
  }

  /**
   * Une flèche au bord, pointée vers (x, y) monde. Renvoie le centre de sa
   * pastille, ou `null` si le point est à l'écran — pas de repère alors.
   */
  private arrow(
    camera: Camera,
    zone: Zone,
    x: number,
    y: number,
    tone: Tone,
    opacity: number,
    scale: number,
    glyph: Glyph,
    hidden = false,
  ): Pin | null {
    const screen = camera.worldToScreen(x, y);
    const { left, right, top, bottom } = zone;

    if (!hidden && screen.x >= 0 && screen.x <= camera.viewWidth && screen.y >= 0 && screen.y <= camera.viewHeight) return null;

    // Projette la direction depuis le centre de la zone utile jusqu'à son bord.
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const dx = screen.x - cx;
    const dy = screen.y - cy;
    const tx = dx === 0 ? Infinity : (dx > 0 ? right - cx : left - cx) / dx;
    const ty = dy === 0 ? Infinity : (dy > 0 ? bottom - cy : top - cy) / dy;
    const t = Math.min(tx, ty);
    const [ex, ey] = this.avoid(cx + dx * t, cy + dy * t, tx <= ty, zone);
    // Déplacé le long du bord, le repère vise toujours sa cible.
    const angle = Math.atan2(screen.y - ey, screen.x - ex);
    const size = 11 * scale;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const point = (along: number, across: number): [number, number] => [
      ex + cos * along - sin * across,
      ey + sin * along + cos * across,
    ];

    const colors = PALETTE[tone];
    const g = this.graphics;
    const [cx0, cy0] = point(-size * 0.4, 0);
    const radius = 11 * scale;

    // La pointe, puis la pastille : ombre en bas à droite, dessus, reflet en haut à gauche.
    g.poly([...point(size, 0), ...point(-size * 0.2, size * 0.75), ...point(-size * 0.2, -size * 0.75)]).fill({
      color: hex(colors.shade),
      alpha: opacity,
    });
    g.circle(cx0, cy0, radius).fill({ color: hex(colors.shade), alpha: opacity });
    g.circle(cx0 - 1, cy0 - 1.2, radius - 1.6).fill({ color: hex(colors.base), alpha: opacity });
    g.roundRect(cx0 - radius * 0.6, cy0 - radius * 0.62, radius * 0.6, radius * 0.26, radius * 0.13).fill({
      color: hex(colors.light),
      alpha: opacity,
    });

    if (glyph === 'home') {
      // Un petit toit corail et sa porte : c'est la maison, pas un ennemi. Jaune sur la pastille d'alarme.
      const roof = tone === 'coral' ? PALETTE.yellow.base : PALETTE.coral.base;

      g.poly([cx0 - 6.5, cy0, cx0, cy0 - 6.5, cx0 + 6.5, cy0]).fill({ color: hex(roof), alpha: opacity });
      g.roundRect(cx0 - 4.5, cy0, 9, 6, 2).fill({ color: hex(PALETTE.yellow.light), alpha: opacity });
      g.roundRect(cx0 - 1.5, cy0 + 1.5, 3, 4.5, 1.5).fill({ color: hex(PALETTE.violet.shade), alpha: opacity });
    } else if (glyph === 'item') {
      // Un disque blanc sous l'icône de l'objet : elle reste lisible sur sa propre teinte.
      g.circle(cx0, cy0, 8.5).fill({ color: hex(PALETTE.paper.base), alpha: opacity });
    } else {
      // Un gros œil de mutant, qui louche.
      g.circle(cx0, cy0, 5).fill({ color: hex(PALETTE.paper.base), alpha: opacity });
      g.circle(cx0 + 1.2, cy0 + 1.3, 2.3).fill({ color: hex(PALETTE.ink.base), alpha: opacity });
    }

    // Une flèche qui pointe vers le bas passerait sur l'étiquette : elle monte au-dessus.
    return { x: cx0, y: cy0, down: sin > 0.7 };
  }

  /**
   * Sort (x, y) des éléments du HUD en le faisant glisser le long de son bord :
   * verticalement sur un bord gauche ou droit (`side`), horizontalement en
   * haut ou en bas. Si le bord n'a plus de place, on essaie l'autre sens.
   */
  private avoid(x: number, y: number, side: boolean, zone: Zone): [number, number] {
    for (let pass = 0; pass < 4; pass += 1) {
      const hit = this.obstacles.find(
        (rect) =>
          x > rect.left - CLEARANCE && x < rect.right + CLEARANCE && y > rect.top - CLEARANCE && y < rect.bottom + CLEARANCE,
      );

      if (!hit) break;

      const [value, min, max, before, after] = side
        ? [y, zone.top, zone.bottom, hit.top - CLEARANCE, hit.bottom + CLEARANCE]
        : [x, zone.left, zone.right, hit.left - CLEARANCE, hit.right + CLEARANCE];
      const options = [before, after].filter((option) => option >= min && option <= max);

      if (options.length === 0) {
        side = !side;
        continue;
      }

      const best = options.reduce((a, b) => (Math.abs(a - value) <= Math.abs(b - value) ? a : b));

      if (side) y = best;
      else x = best;
    }
    return [x, y];
  }

  /** L'étiquette sous une pastille : une capsule blanche sur sa face lavande, le texte en indigo. */
  private tag(text: Text, center: Pin, value: string): void {
    if (text.text !== value) text.text = value;

    const width = text.width + 10;
    const height = 15;
    const x = center.x;
    const y = center.y + (center.down ? -1 : 1) * (11 + 3 + height / 2);

    this.graphics.roundRect(x - width / 2, y - height / 2, width, height + 2, height / 2).fill(hex(PALETTE.paper.shade));
    this.graphics.roundRect(x - width / 2, y - height / 2, width, height, height / 2).fill(hex(PALETTE.paper.base));
    text.position.set(x, y + 0.5);
    text.visible = true;
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}

function label(): Text {
  const text = new Text({
    text: '',
    style: { fontFamily: 'Fredoka', fontWeight: '600', fontSize: 11, fill: hex(PALETTE.ink.base) },
  });

  text.anchor.set(0.5);
  text.visible = false;
  return text;
}

/** « 24 m » : une tuile fait un mètre. */
function meters(tiles: number): string {
  return `${Math.round(tiles)} m`;
}
