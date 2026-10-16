/**
 * Caméra : une translation, et les bornes de ce qu'elle voit.
 *
 * Elle ne connaît pas Pixi — c'est de l'arithmétique. Le renderer se contente
 * de recopier sa position dans le `Container` monde, et le culling interroge
 * `visibleChunks()`.
 *
 * La caméra suit une position **interpolée** du joueur, pas sa position de
 * simulation : à 20 TPS et 120 Hz d'écran, suivre la position brute donne une
 * caméra qui avance par saccades de 7 pixels.
 *
 * Elle ne colle pas au joueur, elle le **rattrape** : un amorti exponentiel,
 * indépendant de la cadence d'écran, avec une petite avance dans le sens de
 * la marche pour montrer ce qui vient plutôt que ce qu'on quitte. Et elle
 * tremble quand ça cogne — un « trauma » qui décroît, dont le carré donne
 * l'amplitude : les petits chocs restent discrets, les gros se sentent.
 *
 * Elle sait aussi jeter un **coup d'œil** : glisser vers un point, s'y
 * attarder, puis revenir sur le joueur — le tap sur le repère de la mairie.
 * Le suivi continue dessous ; le coup d'œil ne fait que déplacer le centre
 * affiché.
 *
 * Elle sait aussi **reculer** un instant (`zoomOut`) : un léger dézoom,
 * tenu quelques secondes puis relâché en douceur, en glissant un peu vers
 * un point à montrer — d'où arrive une vague. Court et discret : on peut
 * être en train de récolter.
 *
 * Elle sait enfin **regarder ailleurs** (`lookAt`) : le tap sur la carte du
 * monde la pose d'un coup sur un point, et elle y reste tant qu'Adam ne
 * marche pas — un pas, ou « Revenir sur Adam », et elle revient sur lui.
 *
 * Tant que l'un ou l'autre fait glisser la carte d'elle-même, elle le dit
 * (`drifting`) : un tap posé à ce moment viserait un point qui bouge.
 *
 * Le joueur, lui, choisit son **niveau de zoom** (`level`, borné par `ZOOM`) :
 * boutons, molette, pinch. Un zoom se fait autour d'un point de l'écran — le
 * curseur, le milieu des deux doigts — qui reste sous lui : la caméra garde
 * pour cela un décalage (`pan`) par rapport à Adam, qu'elle suit toujours.
 * Ce décalage n'emmène jamais Adam hors de l'écran, et se résorbe quand il
 * marche. Le recul d'une vague est un zoom absolu : il ne s'applique que
 * s'il montre plus large que le niveau choisi.
 *
 * Tant que le joueur n'a pas choisi de niveau (ni zoom ni niveau mémorisé),
 * la caméra **cadre** ce qu'il connaît (`fit`, `fitZoom`) : sur un grand
 * écran, elle avance pour que la clairière explorée le remplisse plutôt
 * qu'un disque au milieu de l'indigo. Ce niveau est aussi celui où « Revenir
 * sur Adam » ramène. Au premier zoom du joueur, son choix l'emporte.
 */

import { CHUNK_SIZE, TILE_SIZE, floorDiv } from '../core/grid.ts';

/** Constante de temps du rattrapage, en ms : ~95 % du chemin en trois fois cette durée. */
const FOLLOW_MS = 90;

/** Avance : combien de ms de marche la caméra montre devant le joueur. */
const LEAD_DISTANCE_MS = 260;
const LEAD_MS = 220;

/** Un trauma plein se dissipe en autant de ms. */
const TRAUMA_DECAY_MS = 600;
const MAX_SHAKE_PX = 10;

/** Coup d'œil : l'aller et l'arrêt font une seconde, puis le retour. */
const PEEK_GO_MS = 450;
const PEEK_HOLD_MS = 550;
const PEEK_BACK_MS = 450;

/** Constante de temps du retour sur Adam après un regard ailleurs, en ms. */
const LOOK_BACK_MS = 160;

/** Constante de temps du zoom, en ms : il glisse, il ne saute pas. */
const ZOOM_MS = 420;

/** Constante de temps d'un cran de zoom du joueur, en ms : plus vive que le recul. */
const LEVEL_MS = 140;

/**
 * Bornes du zoom du joueur. En deçà de `min`, le sol à baker grossit vite
 * (blocs de 512 px à la résolution de l'écran) ; au-delà de `max`, les
 * sprites, rastérisés une fois à la résolution de l'écran, s'étirent et
 * deviennent flous. Un cran (bouton, touche) multiplie par `step`.
 */
export const ZOOM = { min: 0.6, max: 1.5, default: 1, step: 1.25 } as const;

/** Un décalage du joueur garde Adam à au moins autant de pixels monde du bord de l'écran. */
const PAN_MARGIN = 3 * TILE_SIZE;

/** Quand Adam marche, le décalage se résorbe avec cette constante de temps, en ms. */
const PAN_RELAX_MS = 900;

/** Adam marche au-delà de cette vitesse, en pixels monde par ms. */
const WALKING = 0.01;

/**
 * Part de l'écran que la zone explorée doit couvrir quand la caméra la
 * cadre : un peu moins que tout, pour qu'un liseré de brume dise qu'il reste
 * à découvrir.
 */
export const FIT_COVER = 0.9;

/** Autour d'Adam, en tuiles, la fenêtre où se mesure la zone explorée à cadrer. */
export const FIT_REACH = 40;

/** Le zoom `level` ramené dans les bornes. */
export function clampZoom(level: number): number {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, level));
}

/**
 * Le cran suivant depuis `level`, vers l'avant (`direction` 1) ou l'arrière
 * (-1) : les crans sont les puissances de `ZOOM.step`, si bien qu'on retombe
 * toujours sur le zoom par défaut, même parti d'un niveau de molette.
 */
export function stepZoom(level: number, direction: 1 | -1): number {
  const index = Math.log(level) / Math.log(ZOOM.step);
  const next = direction > 0 ? Math.floor(index + 1e-6) + 1 : Math.ceil(index - 1e-6) - 1;

  return clampZoom(ZOOM.step ** next);
}

/**
 * Le niveau qui cadre une zone explorée de `spanWidth` × `spanHeight`
 * tuiles sur un écran de `viewWidth` × `viewHeight` pixels : elle en couvre
 * `FIT_COVER` sur le côté où elle est la plus courte. Jamais en deçà du zoom
 * par défaut — un téléphone, déjà rempli, ne recule pas —, jamais au-delà de
 * `ZOOM.max`.
 */
export function fitZoom(viewWidth: number, viewHeight: number, spanWidth: number, spanHeight: number): number {
  if (spanWidth <= 0 || spanHeight <= 0) return ZOOM.default;

  const cover = Math.max(viewWidth / (spanWidth * TILE_SIZE), viewHeight / (spanHeight * TILE_SIZE)) * FIT_COVER;

  return clampZoom(Math.max(ZOOM.default, cover));
}

/**
 * La boîte, en tuiles, des cases connues (`known`) à `reach` tuiles au plus
 * de (tx, ty) : ce que la caméra cadre. Rien de connu : une boîte vide.
 */
export function knownSpan(
  known: (tx: number, ty: number) => boolean,
  tx: number,
  ty: number,
  reach: number,
): { width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let y = ty - reach; y <= ty + reach; y += 1) {
    for (let x = tx - reach; x <= tx + reach; x += 1) {
      if (!known(x, y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return minX > maxX ? { width: 0, height: 0 } : { width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Pendant un recul, part du chemin entre le joueur et le point à montrer que la caméra parcourt. */
const FOCUS_SHARE = 0.4;

/** Au-delà de cette distance au point à montrer, en pixels monde, la caméra ne glisse pas : le joueur est ailleurs, occupé. */
const FOCUS_RANGE = 14 * TILE_SIZE;

/** En deçà de ces écarts à sa cible, le recul est posé : la carte ne glisse plus. */
const SETTLED_ZOOM = 0.01;
const SETTLED_SHIFT_PX = 2;

export interface ChunkBounds {
  minCx: number;
  minCy: number;
  maxCx: number;
  maxCy: number;
}

export class Camera {
  /** Centre de la caméra, en pixels monde. */
  public x = 0;
  public y = 0;
  public zoom = 1;
  public viewWidth = 1;
  public viewHeight = 1;

  /** Trauma courant, dans [0, 1]. */
  private trauma = 0;
  private shakeX = 0;
  private shakeY = 0;
  private leadX = 0;
  private leadY = 0;
  private peekX = 0;
  private peekY = 0;
  private peekElapsed = Infinity;
  /** Part du coup d'œil dans le centre affiché, dans [0, 1]. */
  private peekWeight = 0;

  /** Le point regardé ailleurs (`lookAt`), et s'il l'est encore. */
  private lookX = 0;
  private lookY = 0;
  private looking = false;
  /** Part du regard ailleurs dans le centre affiché, dans [0, 1]. */
  private lookWeight = 0;

  /** Zoom visé pendant un recul, et ms pendant lesquelles il est tenu. */
  private zoomTarget = 1;
  private zoomHold = 0;
  /** Le point à montrer pendant un recul, et le décalage courant vers lui. */
  private focus: { x: number; y: number } | null = null;
  private focusShiftX = 0;
  private focusShiftY = 0;
  /** Le recul est encore en route vers sa cible, ou en revient. */
  private zoomDrifting = false;

  /** Le niveau de zoom choisi par le joueur, vers lequel `zoom` glisse. */
  private levelTarget: number = ZOOM.default;
  /** Le niveau de départ : le zoom par défaut, ou celui qui cadre la zone explorée (`fit`). */
  private home: number = ZOOM.default;
  /** Le joueur a-t-il choisi son niveau — un zoom, ou un niveau mémorisé ? Alors `fit` ne le touche plus. */
  private chosen = false;
  /** Un zoom du joueur est en route : il glisse à son rythme, et ce n'est pas une dérive. */
  private levelEasing = false;
  /** Le point de l'écran, en pixels CSS, qui reste immobile pendant le zoom du joueur ; `null` : le centre. */
  private anchor: { x: number; y: number } | null = null;
  /** Décalage du centre par rapport au suivi d'Adam, en pixels monde : ce qu'a laissé un zoom ancré. */
  private panX = 0;
  private panY = 0;
  /** Le décalage revient à zéro en glissant : le retour sur Adam. */
  private panHome = false;

  public resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
  }

  public centerOn(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /**
   * Rattrape (x, y) en `deltaMs`. `vx, vy` est la vitesse de la cible en
   * pixels par milliseconde : elle décide de l'avance.
   */
  public follow(x: number, y: number, vx: number, vy: number, deltaMs: number): void {
    const lead = 1 - Math.exp(-deltaMs / LEAD_MS);

    this.leadX += (vx * LEAD_DISTANCE_MS - this.leadX) * lead;
    this.leadY += (vy * LEAD_DISTANCE_MS - this.leadY) * lead;

    this.zoomHold = Math.max(0, this.zoomHold - deltaMs);

    const zooming = this.zoomHold > 0;
    const zoomTo = this.goal();
    const ease = 1 - Math.exp(-deltaMs / ZOOM_MS);
    const levelEase = 1 - Math.exp(-deltaMs / LEVEL_MS);
    const before = this.zoom;

    this.zoom += (zoomTo - this.zoom) * (this.levelEasing ? levelEase : ease);
    if (Math.abs(zoomTo - this.zoom) < 0.001) {
      this.zoom = zoomTo;
      this.levelEasing = false;
      this.anchor = null;
    }
    if (this.anchor) this.hold(this.anchor, before);

    if (this.panHome) {
      this.panX -= this.panX * levelEase;
      this.panY -= this.panY * levelEase;
      if (Math.hypot(this.panX, this.panY) < 0.5) this.panHome = false;
    } else if (Math.hypot(vx, vy) > WALKING) {
      const relax = Math.exp(-deltaMs / PAN_RELAX_MS);

      this.panX *= relax;
      this.panY *= relax;
    }
    this.clampPan();
    const toFocusX = zooming && this.focus ? this.focus.x - x : 0;
    const toFocusY = zooming && this.focus ? this.focus.y - y : 0;
    const shifting = Math.hypot(toFocusX, toFocusY) <= FOCUS_RANGE;
    const shiftToX = shifting ? toFocusX * FOCUS_SHARE : 0;
    const shiftToY = shifting ? toFocusY * FOCUS_SHARE : 0;

    this.focusShiftX += (shiftToX - this.focusShiftX) * ease;
    this.focusShiftY += (shiftToY - this.focusShiftY) * ease;
    this.zoomDrifting =
      (!this.levelEasing && Math.abs(zoomTo - this.zoom) > SETTLED_ZOOM) ||
      Math.hypot(shiftToX - this.focusShiftX, shiftToY - this.focusShiftY) > SETTLED_SHIFT_PX;

    const catchUp = 1 - Math.exp(-deltaMs / FOLLOW_MS);
    const targetX = x + this.leadX + this.focusShiftX + this.panX;
    const targetY = y + this.leadY + this.focusShiftY + this.panY;

    this.x += (targetX - this.x) * catchUp;
    this.y += (targetY - this.y) * catchUp;

    // Trop loin (téléportation, premier cadre) : on saute au lieu de glisser.
    if (Math.abs(targetX - this.x) > this.viewWidth || Math.abs(targetY - this.y) > this.viewHeight) {
      this.centerOn(targetX, targetY);
    }

    // Adam se remet en marche : la caméra quitte le point regardé et revient sur lui.
    if (this.looking && Math.hypot(vx, vy) > WALKING) this.looking = false;
    if (!this.looking && this.lookWeight > 0) {
      const away = Math.hypot(this.lookX - this.x, this.lookY - this.y);

      // De très loin, elle saute : glisser à travers la carte bakerait tout le sol du trajet.
      this.lookWeight *= away > 2 * Math.max(this.viewWidth, this.viewHeight) / this.zoom ? 0 : Math.exp(-deltaMs / LOOK_BACK_MS);
      if (this.lookWeight < 0.002) this.lookWeight = 0;
    }

    this.peekElapsed += deltaMs;
    this.peekWeight = peekWeightAt(this.peekElapsed);
    this.trauma = Math.max(0, this.trauma - deltaMs / TRAUMA_DECAY_MS);

    const amplitude = this.trauma * this.trauma * MAX_SHAKE_PX;

    this.shakeX = (Math.random() * 2 - 1) * amplitude;
    this.shakeY = (Math.random() * 2 - 1) * amplitude;
  }

  /** Glisse vers (x, y) monde, s'y attarde, puis revient sur le joueur. */
  public peek(x: number, y: number): void {
    this.peekX = x;
    this.peekY = y;
    this.peekElapsed = 0;
  }

  /**
   * Pose la caméra d'un coup sur (x, y) monde, et l'y laisse jusqu'à ce
   * qu'Adam marche ou qu'on revienne sur lui (`resetZoom`).
   */
  public lookAt(x: number, y: number): void {
    this.lookX = x;
    this.lookY = y;
    this.looking = true;
    this.lookWeight = 1;
  }

  /**
   * La carte glisse-t-elle d'elle-même — un recul ou un coup d'œil qui part
   * ou revient ? Le suivi du joueur n'en est pas : c'est lui qui bouge.
   */
  public get drifting(): boolean {
    return (
      this.zoomDrifting ||
      (this.peekWeight > 0 && this.peekWeight < 1) ||
      (!this.looking && this.lookWeight > 0)
    );
  }

  /** Centre affiché : celui du suivi, ou le point regardé ailleurs, tiré vers le coup d'œil en cours. */
  public get centerX(): number {
    const x = this.x + (this.lookX - this.x) * this.lookWeight;

    return x + (this.peekX - x) * this.peekWeight;
  }

  public get centerY(): number {
    const y = this.y + (this.lookY - this.y) * this.lookWeight;

    return y + (this.peekY - y) * this.peekWeight;
  }

  /**
   * Recule jusqu'à `zoom` (moins de 1) et y reste `holdMs`, en glissant un
   * peu vers `focus` (pixels monde) s'il est donné, puis revient tout seul
   * au niveau du joueur. Un joueur déjà plus loin que `zoom` ne bouge pas.
   */
  public zoomOut(zoom: number, holdMs: number, focus: { x: number; y: number } | null = null): void {
    this.zoomTarget = zoom;
    this.zoomHold = Math.max(this.zoomHold, holdMs);
    this.focus = focus;
  }

  /** Le niveau de zoom choisi par le joueur. */
  public get level(): number {
    return this.levelTarget;
  }

  /** Le joueur a-t-il choisi son niveau ? Seul ce niveau-là se mémorise. */
  public get levelChosen(): boolean {
    return this.chosen;
  }

  /** La caméra est-elle à son niveau de départ, centrée sur Adam ? */
  public get atHome(): boolean {
    return (
      Math.abs(this.levelTarget - this.home) < 1e-3 &&
      Math.hypot(this.panX, this.panY) < 1 &&
      !this.looking &&
      this.lookWeight === 0
    );
  }

  /**
   * Zoome au niveau `level` (ramené dans les bornes), autour du point écran
   * `anchor` (pixels CSS) qui reste sous le curseur ou les doigts — le
   * centre de l'écran si `null`. `immediate` : sans glisser (le pinch, qui
   * suit déjà le doigt).
   */
  public zoomTo(level: number, anchor: { x: number; y: number } | null = null, immediate = false): void {
    this.chosen = true;
    this.levelTarget = clampZoom(level);
    this.anchor = anchor;
    this.panHome = false;
    if (!immediate) {
      this.levelEasing = true;
      return;
    }

    const before = this.zoom;

    this.zoom = this.goal();
    this.levelEasing = false;
    if (anchor) this.hold(anchor, before);
    this.anchor = null;
    this.clampPan();
  }

  /** Multiplie le niveau de zoom par `factor`, autour de `anchor` : cf. `zoomTo`. */
  public zoomBy(factor: number, anchor: { x: number; y: number } | null = null, immediate = false): void {
    this.zoomTo(this.levelTarget * factor, anchor, immediate);
  }

  /** Revient en glissant au niveau de départ, centré sur Adam. */
  public resetZoom(): void {
    this.looking = false;
    this.zoomTo(this.home);
    this.panHome = true;
  }

  /** Reprend un niveau mémorisé, sans glisser : au chargement. C'est un choix du joueur. */
  public restoreLevel(level: number): void {
    this.chosen = true;
    this.levelTarget = clampZoom(level);
    this.zoom = this.goal();
  }

  /**
   * Le niveau qui cadre la zone explorée (`fitZoom`) devient le niveau de
   * départ ; tant que le joueur n'a pas choisi le sien, la caméra s'y pose,
   * sans glisser.
   */
  public fit(level: number): void {
    this.home = clampZoom(level);
    if (this.chosen) return;
    this.levelTarget = this.home;
    this.zoom = this.goal();
    this.clampPan();
  }

  /** Le zoom vers lequel glisser : le niveau du joueur, ou le recul s'il montre plus large. */
  private goal(): number {
    return this.zoomHold > 0 ? Math.min(this.levelTarget, this.zoomTarget) : this.levelTarget;
  }

  /**
   * Le zoom vient de passer de `before` à `this.zoom` : décale le centre
   * pour que le point monde sous `anchor` y soit encore.
   */
  private hold(anchor: { x: number; y: number }, before: number): void {
    const shift = 1 / before - 1 / this.zoom;
    const dx = (anchor.x - this.viewWidth / 2) * shift;
    const dy = (anchor.y - this.viewHeight / 2) * shift;

    this.x += dx;
    this.y += dy;
    this.panX += dx;
    this.panY += dy;
  }

  /** Le décalage ne pousse jamais Adam à moins de `PAN_MARGIN` du bord de l'écran. */
  private clampPan(): void {
    const maxX = Math.max(0, this.viewWidth / (2 * this.zoom) - PAN_MARGIN);
    const maxY = Math.max(0, this.viewHeight / (2 * this.zoom) - PAN_MARGIN);

    this.panX = Math.min(maxX, Math.max(-maxX, this.panX));
    this.panY = Math.min(maxY, Math.max(-maxY, this.panY));
  }

  /** Ajoute du trauma : 0.2 pour un coup, 0.6 pour un effondrement. */
  public shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Décalage à appliquer au conteneur monde pour que (x, y) tombe au centre. */
  public offsetX(): number {
    return this.viewWidth / 2 - this.centerX * this.zoom + this.shakeX;
  }

  public offsetY(): number {
    return this.viewHeight / 2 - this.centerY * this.zoom + this.shakeY;
  }

  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.offsetX()) / this.zoom,
      y: (screenY - this.offsetY()) / this.zoom,
    };
  }

  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * this.zoom + this.offsetX(),
      y: worldY * this.zoom + this.offsetY(),
    };
  }

  /**
   * Chunks intersectant le viewport, avec une marge d'un chunk.
   *
   * La marge évite qu'un chunk apparaisse au moment précis où il entre à
   * l'écran : il est baké un cran à l'avance, hors du champ.
   */
  public visibleChunks(margin = 1): ChunkBounds {
    return this.visibleCells(CHUNK_SIZE, margin);
  }

  /** Cellules carrées de `size` pixels monde intersectant le viewport, marge comprise. */
  public visibleCells(size: number, margin = 1): ChunkBounds {
    const halfW = this.viewWidth / (2 * this.zoom);
    const halfH = this.viewHeight / (2 * this.zoom);

    return {
      minCx: floorDiv(this.centerX - halfW, size) - margin,
      minCy: floorDiv(this.centerY - halfH, size) - margin,
      maxCx: floorDiv(this.centerX + halfW, size) + margin,
      maxCy: floorDiv(this.centerY + halfH, size) + margin,
    };
  }
}

/** Poids du coup d'œil `elapsed` ms après son début : monte, tient, redescend, adouci. */
function peekWeightAt(elapsed: number): number {
  const ease = (t: number): number => t * t * (3 - 2 * t);

  if (elapsed < PEEK_GO_MS) return ease(elapsed / PEEK_GO_MS);
  if (elapsed < PEEK_GO_MS + PEEK_HOLD_MS) return 1;
  if (elapsed < PEEK_GO_MS + PEEK_HOLD_MS + PEEK_BACK_MS) {
    return ease(1 - (elapsed - PEEK_GO_MS - PEEK_HOLD_MS) / PEEK_BACK_MS);
  }
  return 0;
}
