/**
 * Le brouillard de guerre : ce que la colonie a exploré, ce qu'elle voit en
 * ce moment, et ce dont elle se souvient.
 *
 * Trois états par case (`Sight`) :
 * - **inexplorée** : jamais couverte par une source de vision ;
 * - **explorée** : couverte un jour, plus maintenant — on y garde une
 *   capture figée ;
 * - **visible** : au moins une source la couvre en ce moment.
 *
 * **Incrémental.** Chaque source (Adam, un habitant, un bâtiment) a un
 * disque posé sur la grille : un compteur par case dit combien la couvrent.
 * Une source qui ne change pas de tuile ne coûte qu'une comparaison ; une
 * qui bouge retire son ancien disque (−1) et pose le nouveau (+1), rang par
 * rang, chunk par chunk. Une case passe visible quand son compteur quitte
 * zéro, explorée pour toujours du même coup. `revision` monte à chaque case
 * qui change d'état : le rendu ne redessine le voile que là-dessus.
 *
 * **La capture** — ce qu'on a vu la dernière fois — est en copie sur
 * écriture : rien n'est photographié quand une case sort de la vue. C'est
 * quand quelque chose y change hors de vue (un arbre coupé, une pousse qui
 * grandit) que l'état d'avant est rangé dans `looks` ; le rendu montre
 * alors la capture plutôt que la carte. Une case revue oublie sa capture.
 * Les bases mutantes, peu nombreuses, sont copiées entières dans `bases`
 * dès qu'elles sortent de la vue (`World.watchSight`).
 *
 * Seuls les cases explorées et les captures se sauvegardent : les compteurs
 * se refont des sources au premier tick. Rien ici ne dépend du rendu.
 */

import { CHUNK_TILES, coordKey, floorDiv } from '../core/grid.ts';
import type { TileLook } from './resources.ts';
import type { EnemyBase } from './types.ts';

export type Sight = 'unexplored' | 'explored' | 'visible';

/** Les cases d'un chunk, ligne par ligne : `ly * CHUNK_TILES + lx`. */
export interface FogChunk {
  /** 1 : explorée. */
  readonly explored: Uint8Array;
  /** Combien de sources couvrent la case : visible au-dessus de zéro. */
  readonly seen: Uint16Array;
}

/** Le disque d'une source, tel qu'il est posé sur la grille. */
interface Stamp {
  tx: number;
  ty: number;
  radius: number;
  /** La passe qui l'a vue pour la dernière fois : une source absente d'une passe est retirée. */
  pass: number;
}

/** Le brouillard tel qu'il est sauvegardé. */
export interface SavedFog {
  /**
   * Cases explorées, par chunk `"cx,cy"` : des longueurs de plages qui
   * alternent, inexplorées d'abord, sur les cases du chunk ligne par ligne.
   */
  explored: Record<string, number[]>;
  /** Captures des cases changées hors de vue : `"tx,ty"` → ce qu'on y a vu. */
  looks: Record<string, TileLook>;
  /** Les bases mutantes telles qu'on les a vues la dernière fois, hors de vue. */
  bases: EnemyBase[];
}

const AREA = CHUNK_TILES * CHUNK_TILES;

export class FogOfWar {
  /** Faux : réglage de débogage, toute la carte se voit (cf. `World.sightAt`). Les compteurs tournent quand même. */
  public enabled = true;

  /** Monte à chaque case qui change d'état. */
  public revision = 0;

  /** Monte à chaque case explorée pour la première fois : la carte du monde refait son fond sur lui. */
  public exploredRevision = 0;

  /** Les cases explorées, comptées à mesure. */
  private explored = 0;

  /** Captures des ressources, en copie sur écriture. */
  public readonly looks = new Map<string, TileLook>();

  /** Les bases mutantes vues pour la dernière fois, hors de vue. */
  public readonly bases = new Map<number, EnemyBase>();

  private readonly chunks = new Map<string, FogChunk>();
  /**
   * Les plages de chaque chunk telles que `toJSON` les a encodées : une case
   * explorée de plus jette celles de son chunk. Une sauvegarde ne ré-encode
   * que les chunks qui ont changé depuis la précédente.
   */
  private readonly runs = new Map<FogChunk, readonly number[]>();
  private readonly sources = new Map<number, Stamp>();
  /** Le dernier chunk lu par `sight` : les lectures voisines n'ont pas de clé à fabriquer. */
  private lastCx = NaN;
  private lastCy = NaN;
  private lastChunk: FogChunk | undefined;
  private pass = 0;

  /** Prévenu quand une case revue oublie sa capture : le rendu de ses ressources est à refaire. */
  private readonly onForget: (tx: number, ty: number) => void;

  public constructor(onForget: (tx: number, ty: number) => void = () => {}) {
    this.onForget = onForget;
  }

  /** Les cases d'un chunk, ou `undefined` s'il n'a jamais été vu. */
  public chunk(cx: number, cy: number): FogChunk | undefined {
    return this.chunks.get(coordKey(cx, cy));
  }

  /** L'état de la case, réglage de débogage ignoré. */
  public sight(tx: number, ty: number): Sight {
    const cx = floorDiv(tx, CHUNK_TILES);
    const cy = floorDiv(ty, CHUNK_TILES);
    if (cx !== this.lastCx || cy !== this.lastCy) {
      this.lastCx = cx;
      this.lastCy = cy;
      this.lastChunk = this.chunks.get(coordKey(cx, cy));
    }

    const chunk = this.lastChunk;

    if (!chunk) return 'unexplored';

    const index = (ty - cy * CHUNK_TILES) * CHUNK_TILES + (tx - cx * CHUNK_TILES);

    if (chunk.seen[index]! > 0) return 'visible';
    return chunk.explored[index] ? 'explored' : 'unexplored';
  }

  /** Ouvre une passe : chaque source présente s'y déclare (`source`), `end()` retire les autres. */
  public begin(): void {
    this.pass += 1;
  }

  /** La source `id` (un nombre propre à chaque source) voit à `radius` tuiles de la tuile (tx, ty). Ne coûte rien si elle n'a pas bougé. */
  public source(id: number, tx: number, ty: number, radius: number): void {
    const stamp = this.sources.get(id);

    if (stamp && stamp.tx === tx && stamp.ty === ty && stamp.radius === radius) {
      stamp.pass = this.pass;
      return;
    }
    if (stamp) this.paint(stamp.tx, stamp.ty, stamp.radius, -1);
    this.paint(tx, ty, radius, 1);
    this.sources.set(id, { tx, ty, radius, pass: this.pass });
  }

  /** Ferme la passe : les sources qui ne s'y sont pas déclarées — rentrées, abattues — cessent de voir. */
  public end(): void {
    for (const [id, stamp] of this.sources) {
      if (stamp.pass === this.pass) continue;
      this.paint(stamp.tx, stamp.ty, stamp.radius, -1);
      this.sources.delete(id);
    }
  }

  /** Nombre de sources de vision — le panneau de debug l'affiche. */
  public get sourceCount(): number {
    return this.sources.size;
  }

  /** Explore le disque sans le rendre visible : une ancienne sauvegarde, une partie de test. */
  public reveal(tx: number, ty: number, radius: number): void {
    this.span(tx, ty, radius, (chunk, from, to) => {
      for (let index = from; index <= to; index += 1) {
        if (chunk.explored[index]) continue;
        chunk.explored[index] = 1;
        this.runs.delete(chunk);
        this.revision += 1;
        this.exploredRevision += 1;
        this.explored += 1;
      }
    });
  }

  /** Nombre de cases explorées — le défi du jour, la fontaine, le panneau de debug le lisent. Tenu à jour case par case. */
  public exploredCount(): number {
    return this.explored;
  }

  /** Pose (+1) ou retire (−1) le disque d'une source. */
  private paint(tx: number, ty: number, radius: number, delta: 1 | -1): void {
    this.span(tx, ty, radius, (chunk, from, to, cx, cy) => {
      for (let index = from; index <= to; index += 1) {
        if (delta > 0) {
          if (chunk.seen[index]!++ > 0) continue;
          if (!chunk.explored[index]) {
            this.exploredRevision += 1;
            this.explored += 1;
            chunk.explored[index] = 1;
            this.runs.delete(chunk);
          }
          this.revision += 1;
          if (this.looks.size > 0) {
            this.forget(cx * CHUNK_TILES + (index % CHUNK_TILES), cy * CHUNK_TILES + Math.floor(index / CHUNK_TILES));
          }
        } else if (--chunk.seen[index]! === 0) {
          this.revision += 1;
        }
      }
    });
  }

  /** Une case revue : sa capture ne sert plus, la carte en direct reprend. */
  private forget(tx: number, ty: number): void {
    if (this.looks.delete(coordKey(tx, ty))) this.onForget(tx, ty);
  }

  /**
   * Le disque de rayon `radius` autour de (tx, ty), en segments d'une ligne
   * dans un seul chunk : `visit(chunk, premier index, dernier index, cx, cy)`.
   * Une case est dans le disque si son centre est à moins de `radius + ½`.
   */
  private span(
    tx: number,
    ty: number,
    radius: number,
    visit: (chunk: FogChunk, from: number, to: number, cx: number, cy: number) => void,
  ): void {
    const reach = radius + 0.5;
    const rows = Math.floor(reach);

    for (let dy = -rows; dy <= rows; dy += 1) {
      const half = Math.floor(Math.sqrt(reach * reach - dy * dy));
      const y = ty + dy;
      const cy = floorDiv(y, CHUNK_TILES);
      const row = (y - cy * CHUNK_TILES) * CHUNK_TILES;
      const last = tx + half;
      let x = tx - half;

      while (x <= last) {
        const cx = floorDiv(x, CHUNK_TILES);
        const left = cx * CHUNK_TILES;
        const end = Math.min(last, left + CHUNK_TILES - 1);

        visit(this.ensure(cx, cy), row + x - left, row + end - left, cx, cy);
        x = end + 1;
      }
    }
  }

  private ensure(cx: number, cy: number): FogChunk {
    const key = coordKey(cx, cy);
    let chunk = this.chunks.get(key);

    if (!chunk) {
      chunk = { explored: new Uint8Array(AREA), seen: new Uint16Array(AREA) };
      this.chunks.set(key, chunk);
      this.lastCx = NaN;
    }
    return chunk;
  }

  /* ------------------------------------------------------------ sauvegarde */

  public toJSON(): SavedFog {
    const explored: Record<string, number[]> = {};

    for (const [key, chunk] of this.chunks) {
      let runs = this.runs.get(chunk);

      if (!runs) {
        runs = encodeRuns(chunk.explored);
        this.runs.set(chunk, runs);
      }
      // Un chunk tout inexploré n'apprend rien à la sauvegarde.
      if (runs.length > 1) explored[key] = [...runs];
    }

    return {
      explored,
      looks: Object.fromEntries([...this.looks].map(([key, look]) => [key, { ...look }])),
      bases: [...this.bases.values()].map((base) => ({ ...base })),
    };
  }

  /** Les cases explorées et les captures d'une sauvegarde ; les sources se redéclarent au tick suivant. */
  public restore(saved: SavedFog): void {
    for (const [id, stamp] of this.sources) {
      this.paint(stamp.tx, stamp.ty, stamp.radius, -1);
      this.sources.delete(id);
    }
    this.chunks.clear();
    this.runs.clear();
    this.lastCx = NaN;
    this.explored = 0;
    for (const [key, runs] of Object.entries(saved.explored)) {
      const [cx, cy] = key.split(',').map(Number) as [number, number];
      const chunk = this.ensure(cx, cy);
      let index = 0;
      let value = 0;

      for (const length of runs) {
        if (value) {
          chunk.explored.fill(1, index, Math.min(AREA, index + length));
          this.explored += Math.max(0, Math.min(AREA, index + length) - index);
        }
        index += length;
        value = 1 - value;
      }
    }
    this.looks.clear();
    for (const [key, look] of Object.entries(saved.looks)) this.looks.set(key, { ...look });
    this.bases.clear();
    for (const base of saved.bases) this.bases.set(base.id, { ...base });
    this.revision += 1;
    this.exploredRevision += 1;
  }

  /** Le rectangle de chunks qui contient tout ce qui a été vu, en tuiles ; `null` si rien. */
  public bounds(): { minTx: number; minTy: number; maxTx: number; maxTy: number } | null {
    let box: { minTx: number; minTy: number; maxTx: number; maxTy: number } | null = null;

    for (const key of this.chunks.keys()) {
      const [cx, cy] = key.split(',').map(Number) as [number, number];
      const minTx = cx * CHUNK_TILES;
      const minTy = cy * CHUNK_TILES;

      box = box
        ? { minTx: Math.min(box.minTx, minTx), minTy: Math.min(box.minTy, minTy), maxTx: Math.max(box.maxTx, minTx + CHUNK_TILES - 1), maxTy: Math.max(box.maxTy, minTy + CHUNK_TILES - 1) }
        : { minTx, minTy, maxTx: minTx + CHUNK_TILES - 1, maxTy: minTy + CHUNK_TILES - 1 };
    }
    return box;
  }
}

/** Les cases explorées d'un chunk en longueurs de plages qui alternent, inexplorées d'abord. */
function encodeRuns(explored: Uint8Array): number[] {
  const runs: number[] = [];
  let value = 0;
  let length = 0;

  for (let index = 0; index < AREA; index += 1) {
    if (explored[index] === value) {
      length += 1;
      continue;
    }
    runs.push(length);
    value = explored[index]!;
    length = 1;
  }
  runs.push(length);
  return runs;
}
