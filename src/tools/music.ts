/**
 * Les deux boucles de la nuit, composées ici, note à note, pour orchestre, et
 * rendues en WAV :
 *
 *   npm run music:night -- <dossier>
 *
 * Elles prolongent le thème du jour (`adam-melancolique-loop` : fa♯ majeur,
 * ~66 BPM, violoncelle, harpe, cordes) : même tempo, sa relative mineure
 * (mi♭ / ré♯ mineur), les mêmes timbres.
 *
 * - `night.wav` : la nuit calme — cordes en sourdine, contrebasses qui
 *   tiennent, violoncelle seul qui chante, la harpe en arpèges, une timbale
 *   sourde au premier temps ;
 * - `combat.wav` : la même grille, tendue — violoncelles et contrebasses en
 *   ostinato, cordes en trémolo, timbales et grosse caisse lointaines,
 *   cuivres graves discrets, et la même harpe que la nuit.
 *
 * Trois variantes de chaque (`VARIANTS`) : la première est celle du jeu, les
 * deux autres vont dans `docs/music-candidates/` pour qu'on puisse en
 * préférer une. Nuit et combat d'une même variante vont ensemble.
 *
 * Même tempo, même grille, même longueur à l'échantillon près : le jeu lance
 * le combat calé sur la position de la nuit (`music.ts`), et le fondu
 * enchaîné sonne comme un orchestre qui se lève, pas comme un autre morceau.
 *
 * La boucle est rendue « en anneau » : la queue d'une note qui dépasse la fin
 * repart au début, et la réverbération est calculée sur trois tours pour ne
 * garder que celui du milieu. Le raccord ne s'entend pas.
 *
 * Tout est déterministe (bruit tiré d'un PRNG à graine) : relancer l'outil
 * redonne les mêmes octets. Les commandes ffmpeg affichées à la fin écrivent
 * les `.ogg` et `.m4a` de `public/audio/music/` et des candidates.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [directory = 'music'] = process.argv.slice(2);
const out = resolve(directory);

const RATE = 44_100;
const BPM = 66;
const BEAT = 60 / BPM;
const BARS = 16;
const LENGTH = Math.round(BARS * 4 * BEAT * RATE);

interface Chord {
  readonly root: number;
  readonly minor: boolean;
}

/**
 * La grille, deux mesures par accord : mi♭ m, si, fa♯, do♯, mi♭ m, si, sol♯ m,
 * la♯ — i, VI, III, VII, puis iv et la dominante qui ramène au début. Midi
 * des fondamentales, autour du do 3.
 */
const CHORDS: readonly Chord[] = [
  { root: 51, minor: true },
  { root: 47, minor: false },
  { root: 54, minor: false },
  { root: 49, minor: false },
  { root: 51, minor: true },
  { root: 47, minor: false },
  { root: 56, minor: true },
  { root: 46, minor: false },
];

/**
 * Le chant du violoncelle seul, la nuit : [midi, durée en temps], `0` pour
 * un silence. Quatre temps par mesure, seize mesures ; la dernière note, le
 * ré, appelle le mi♭ du début.
 */
const CELLO: readonly (readonly [number, number])[] = [
  [58, 2], [54, 1], [53, 1], [51, 4],
  [54, 2], [51, 1], [54, 1], [59, 3], [0, 1],
  [58, 2], [61, 1], [58, 1], [54, 4],
  [56, 2], [53, 2], [49, 3], [0, 1],
  [58, 2], [61, 1], [58, 1], [54, 2], [63, 2],
  [63, 2], [61, 1], [59, 1], [54, 4],
  [59, 2], [58, 1], [56, 1], [51, 3], [0, 1],
  [53, 2], [58, 1], [62, 1], [62, 3], [0, 1],
];

/**
 * Une variante : ce qui change d'une écoute à l'autre, la grille et le
 * tempo restant les mêmes.
 */
interface Variant {
  readonly name: string;
  readonly seed: number;
  /** La nuit : le violoncelle (tout du long, dès la mi-boucle, une octave plus bas) et la densité de la harpe. */
  readonly cello: 'full' | 'late' | 'low';
  readonly harp: number;
  /** Le combat : le rythme de l'ostinato, celui des timbales, le poids des cuivres. */
  readonly ostinato: 'sixteenths' | 'gallop' | 'eighths';
  readonly timpani: 'halves' | 'beats' | 'sparse';
  readonly brass: number;
}

const VARIANTS: readonly Variant[] = [
  { name: 'ostinato', seed: 7, cello: 'full', harp: 0.75, ostinato: 'sixteenths', timpani: 'halves', brass: 1 },
  { name: 'galop', seed: 13, cello: 'late', harp: 0.9, ostinato: 'gallop', timpani: 'beats', brass: 1.5 },
  { name: 'sombre', seed: 29, cello: 'low', harp: 0.5, ostinato: 'eighths', timpani: 'sparse', brass: 0.7 },
];

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
const chordAt = (bar: number): Chord => CHORDS[Math.floor(bar / 2) % CHORDS.length]!;
const third = (chord: Chord): number => (chord.minor ? 3 : 4);

/** Les trois notes de l'accord, resserrées entre sol 3 et fa♯ 4 : la place des altos et des seconds violons. */
function voicing(chord: Chord): number[] {
  return [0, third(chord), 7].map((interval) => {
    let note = chord.root + interval;

    while (note < 55) note += 12;
    while (note >= 67) note -= 12;
    return note;
  });
}

function prng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;

    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

class Track {
  public readonly left = new Float32Array(LENGTH);
  public readonly right = new Float32Array(LENGTH);
  public readonly send = new Float32Array(LENGTH);

  /** Ajoute `sample()` sur `duration` secondes à partir de `at`, en anneau. `sample` est appelée à chaque échantillon, dans l'ordre. */
  public add(at: number, duration: number, pan: number, reverb: number, sample: (t: number) => number): void {
    const start = Math.round(at * RATE);
    const count = Math.round(duration * RATE);
    const left = Math.cos(((pan + 1) * Math.PI) / 4);
    const right = Math.sin(((pan + 1) * Math.PI) / 4);

    for (let i = 0; i < count; i++) {
      const index = (start + i) % LENGTH;
      const value = sample(i / RATE);

      this.left[index]! += value * left;
      this.right[index]! += value * right;
      this.send[index]! += value * reverb;
    }
  }

  /**
   * Une salle de concert : huit filtres en peigne amortis et quatre
   * passe-tout par côté (Freeverb), la droite décalée de la gauche, un
   * pré-délai. Calculée sur trois tours de boucle : on ne garde que le
   * deuxième, déjà rempli par la queue du premier.
   */
  public reverb(amount: number, size = 0.86): void {
    const predelay = Math.round(0.025 * RATE);

    for (const [side, spread] of [[this.left, 0], [this.right, 23]] as const) {
      const wet = new Float32Array(LENGTH);

      for (const base of [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]) {
        const delay = base + spread;
        const line = new Float32Array(delay);
        let cursor = 0;
        let low = 0;

        for (let pass = 0; pass < 3; pass++) {
          for (let i = 0; i < LENGTH; i++) {
            const delayed = line[cursor]!;

            low = delayed * 0.65 + low * 0.35;
            line[cursor] = this.send[(i - predelay + LENGTH) % LENGTH]! * 0.015 + low * size;
            cursor = (cursor + 1) % delay;
            if (pass === 1) wet[i]! += delayed;
          }
        }
      }

      for (const base of [556, 441, 341, 225]) {
        const delay = base + spread;
        const line = new Float32Array(delay);
        const source = Float32Array.from(wet);
        let cursor = 0;

        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < LENGTH; i++) {
            const delayed = line[cursor]!;
            const input = source[i]!;

            line[cursor] = input + delayed * 0.5;
            cursor = (cursor + 1) % delay;
            if (pass === 1) wet[i] = delayed - input;
          }
        }
      }

      for (let i = 0; i < LENGTH; i++) side[i]! += wet[i]! * amount;
    }
  }

  /**
   * Normalise la crête à `peak` et écrit le WAV 16 bits stéréo. `drive` > 0
   * arrondit d'abord les crêtes (tangente hyperbolique) : les coups des
   * timbales ne dictent plus seuls le volume.
   */
  public write(file: string, peak: number, drive = 0): void {
    let max = 0;

    for (let i = 0; i < LENGTH; i++) max = Math.max(max, Math.abs(this.left[i]!), Math.abs(this.right[i]!));

    const shape = (value: number): number =>
      drive > 0 ? (Math.tanh((value / max) * drive) / Math.tanh(drive)) * peak : (value / max) * peak;
    const bytes = Buffer.alloc(44 + LENGTH * 4);

    bytes.write('RIFF', 0);
    bytes.writeUInt32LE(36 + LENGTH * 4, 4);
    bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(2, 22);
    bytes.writeUInt32LE(RATE, 24);
    bytes.writeUInt32LE(RATE * 4, 28);
    bytes.writeUInt16LE(4, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(LENGTH * 4, 40);
    for (let i = 0; i < LENGTH; i++) {
      bytes.writeInt16LE(Math.round(shape(this.left[i]!) * 32767), 44 + i * 4);
      bytes.writeInt16LE(Math.round(shape(this.right[i]!) * 32767), 46 + i * 4);
    }
    writeFileSync(file, bytes);
  }
}

/** Attaque et relâche linéaires, tenue entre les deux. */
function envelope(t: number, duration: number, attack: number, release: number): number {
  if (t < attack) return t / attack;
  if (t > duration - release) return Math.max(0, (duration - t) / release);
  return 1;
}

/** Le coefficient d'un passe-bas à un pôle coupant à `cutoff` Hz. */
const lowpass = (cutoff: number): number => 1 - Math.exp((-2 * Math.PI * Math.min(cutoff, RATE * 0.45)) / RATE);

/** Une dent de scie sans repliement (PolyBLEP) : la vibration d'une corde frottée ou d'une lèvre dans l'embouchure. */
function saw(): (frequency: number) => number {
  let phase = 0;

  return (frequency) => {
    const step = frequency / RATE;

    phase += step;
    if (phase >= 1) phase -= 1;

    let value = 2 * phase - 1;

    if (phase < step) {
      const x = phase / step;

      value -= x + x - x * x - 1;
    } else if (phase > 1 - step) {
      const x = (phase - 1) / step;

      value -= x * x + x + x + 1;
    }

    return value;
  };
}

interface Bow {
  /** Instrumentistes au pupitre : chacun un peu désaccordé, son vibrato à lui. */
  readonly desks: number;
  /** Ouverture du timbre, en multiples de la fréquence (la sourdine la ferme). */
  readonly bright: number;
  readonly attack: number;
  readonly release: number;
  /** Profondeur du vibrato (fraction de la fréquence). */
  readonly vibrato: number;
  /** Coups d'archet par seconde (trémolo), `0` pour un archet tenu. */
  readonly tremolo: number;
  /** Une note piquée : attaque sèche, extinction rapide à ce taux. */
  readonly spiccato: number;
}

const LEGATO: Bow = { desks: 4, bright: 5, attack: 0.9, release: 1.4, vibrato: 0.004, tremolo: 0, spiccato: 0 };

/**
 * Un pupitre de cordes : des dents de scie désaccordées, chacune son
 * vibrato (qui n'arrive qu'après l'attaque, comme sous l'archet), passées
 * dans deux passe-bas, et une bosse du corps de l'instrument vers 3 kHz.
 */
function strings(random: () => number, frequency: number, duration: number, bow: Bow): (t: number) => number {
  const desks = Array.from({ length: bow.desks }, () => ({
    osc: saw(),
    detune: (random() - 0.5) * 0.008,
    rate: 4.6 + random() * 1.2,
    phase: random() * Math.PI * 2,
    bowPhase: random(),
  }));
  const cut = lowpass(Math.max(700, Math.min(6000, frequency * bow.bright)));
  const body = lowpass(3200);
  let low1 = 0;
  let low2 = 0;
  let air = 0;

  return (t) => {
    const swell = Math.min(1, t / 0.6);
    let value = 0;

    for (const desk of desks) {
      const vibrato = 1 + bow.vibrato * swell * Math.sin(2 * Math.PI * desk.rate * t + desk.phase);
      let voice = desk.osc(frequency * (1 + desk.detune) * vibrato);

      if (bow.tremolo > 0) voice *= 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * (bow.tremolo * t + desk.bowPhase)));
      value += voice;
    }

    low1 += (value / desks.length - low1) * cut;
    low2 += (low1 - low2) * cut;
    air += (low2 - air) * body;

    const shape =
      bow.spiccato > 0
        ? Math.min(1, t / 0.008) * Math.exp(-t * bow.spiccato)
        : envelope(t, duration, bow.attack, bow.release);

    return (low2 + 0.35 * (low2 - air)) * shape;
  };
}

/**
 * Une corde de harpe pincée (Karplus-Strong) : un bruit filtré qui tourne
 * dans une ligne de la longueur d'une période, adouci à chaque tour. Le
 * bruit vient du PRNG : deux rendus donnent les mêmes octets.
 */
function harp(random: () => number, frequency: number, duration: number): (t: number) => number {
  // La moyenne de deux échantillons retarde d'un demi : la ligne est raccourcie d'autant.
  const period = RATE / frequency - 0.5;
  const size = Math.floor(period) + 2;
  const line = new Float32Array(size);
  const frac = period - Math.floor(period);
  const loss = Math.pow(0.5, 1 / (frequency * Math.max(0.5, 3.2 - frequency / 400)));
  let smooth = 0;

  for (let i = 0; i < size; i++) {
    smooth = smooth * 0.55 + (random() * 2 - 1) * 0.45;
    line[i] = smooth;
  }

  let cursor = 0;
  let last = 0;

  return (t) => {
    const back = (cursor - Math.floor(period) + size) % size;
    const before = (back - 1 + size) % size;
    const delayed = line[back]! * (1 - frac) + line[before]! * frac;
    const value = ((delayed + last) / 2) * loss;

    last = delayed;
    line[cursor] = value;
    cursor = (cursor + 1) % size;
    return value * envelope(t, duration, 0.001, 0.3);
  };
}

/** Une timbale : les modes d'une membrane tendue, qui tombent un peu à la frappe, et le feutre de la mailloche. */
function timpani(random: () => number, frequency: number, decay: number): (t: number) => number {
  const modes = [
    [1, 1, 1],
    [1.504, 0.5, 1.4],
    [1.742, 0.3, 1.8],
    [2.0, 0.22, 2.2],
    [2.245, 0.12, 2.8],
  ] as const;
  const felt = lowpass(500);
  let thump = 0;

  return (t) => {
    const fall = 1 + 0.03 * Math.exp(-t * 25);
    let value = 0;

    for (const [ratio, level, speed] of modes) {
      value += level * Math.sin(2 * Math.PI * frequency * ratio * fall * t) * Math.exp(-t * decay * speed);
    }
    thump += ((random() * 2 - 1) - thump) * felt;
    return (value + thump * 2.5 * Math.exp(-t * 40)) * Math.min(1, t / 0.003);
  };
}

/** La grosse caisse d'orchestre, au fond de la salle : une peau très grave, un souffle feutré. */
function bassDrum(random: () => number): (t: number) => number {
  const felt = lowpass(180);
  let thump = 0;

  return (t) => {
    const skin = Math.sin(2 * Math.PI * 46 * t) + 0.5 * Math.sin(2 * Math.PI * 71 * t) * Math.exp(-t * 4);

    thump += ((random() * 2 - 1) - thump) * felt;
    return (skin * Math.exp(-t * 2.2) + thump * 3 * Math.exp(-t * 12)) * Math.min(1, t / 0.01);
  };
}

/** Un cuivre grave (cor, trombone) : le timbre s'ouvre avec le souffle, puis se referme. */
function brass(frequency: number, duration: number): (t: number) => number {
  const voices = [saw(), saw()];
  let low1 = 0;
  let low2 = 0;

  return (t) => {
    const breath = envelope(t, duration, duration * 0.45, duration * 0.4);
    const cut = lowpass(frequency * (1.5 + 3.5 * breath));
    const value = (voices[0]!(frequency * 0.998) + voices[1]!(frequency * 1.002)) / 2;

    low1 += (value - low1) * cut;
    low2 += (low1 - low2) * cut;
    return low2 * breath;
  };
}

/**
 * Les cordes de fond : altos et violons sur l'accord, contrebasses sur la
 * fondamentale. `bow` dit comment on les joue — en sourdine la nuit, en
 * trémolo au combat.
 */
function bed(track: Track, random: () => number, gain: number, bow: Bow, bass: number): void {
  for (let bar = 0; bar < BARS; bar += 2) {
    const chord = chordAt(bar);
    const at = bar * 4 * BEAT;
    const duration = 8 * BEAT + bow.release;

    for (const [index, note] of voicing(chord).entries()) {
      const voice = strings(random, hz(note), duration, bow);

      track.add(at, duration, [-0.45, 0.45, 0][index]!, 0.6, (t) => voice(t) * gain);
    }

    if (bass > 0) {
      const voice = strings(random, hz(chord.root - 12), duration, { ...LEGATO, bright: 4, release: bow.release });

      track.add(at, duration, 0.25, 0.4, (t) => voice(t) * gain * bass);
    }
  }
}

/**
 * La harpe, commune à la nuit et au combat : l'arpège montant puis
 * redescendant de chaque accord, en croches, comme celle du thème du jour.
 * Tirée de la même graine des deux côtés, elle joue les mêmes notes : au
 * fondu, elle passe d'un morceau à l'autre sans bouger.
 */
function harpLine(track: Track, seed: number, density: number, gain: number): void {
  const random = prng(seed);

  for (let bar = 0; bar < BARS; bar++) {
    const chord = chordAt(bar);
    const base = chord.root + 12;
    const figure = [0, 7, 12, 12 + third(chord), 19, 12 + third(chord), 12, 7];

    for (const [eighth, interval] of figure.entries()) {
      // Le premier temps de chaque accord sonne toujours ; les autres croches, selon la densité.
      if ((eighth > 0 || bar % 2 === 1) && random() > density) continue;

      const voice = harp(random, hz(base + interval), 3);

      track.add((bar * 4 + eighth / 2) * BEAT, 3, -0.5 + eighth * 0.12, 0.5, (t) => voice(t) * gain);
    }
  }
}

function composeNight(variant: Variant): Track {
  const track = new Track();
  const random = prng(variant.seed);

  // Cordes en sourdine : timbre fermé, vibrato à peine.
  bed(track, random, 0.11, { ...LEGATO, bright: 2.6, vibrato: 0.003, attack: 1.6, release: 2 }, 1.1);
  harpLine(track, variant.seed + 1, variant.harp, 0.55);

  // Le violoncelle seul, au milieu de la scène, un peu à gauche.
  let beat = 0;

  for (const [note, beats] of CELLO) {
    const late = variant.cello === 'late' && beat < BARS * 2;

    if (note > 0 && !late) {
      const duration = beats * BEAT + 0.5;
      const voice = strings(random, hz(note - (variant.cello === 'low' ? 12 : 0)), duration, {
        desks: 1,
        bright: 6,
        attack: 0.25,
        release: 0.5,
        vibrato: 0.007,
        tremolo: 0,
        spiccato: 0,
      });

      track.add(beat * BEAT, duration, -0.15, 0.45, (t) => voice(t) * 0.2);
    }
    beat += beats;
  }

  // Une timbale sourde au premier temps des mesures paires, sur la fondamentale.
  for (let bar = 0; bar < BARS; bar += 2) {
    const voice = timpani(random, hz(chordAt(bar).root - 12), 1.6);

    track.add(bar * 4 * BEAT, 3, 0.1, 0.5, (t) => voice(t) * 0.35);
  }

  track.reverb(0.9, 0.87);
  return track;
}

/** Les coups de l'ostinato dans une mesure, en temps : doubles croches, galop (une croche, deux doubles), croches. */
function ostinatoSteps(kind: Variant['ostinato']): number[] {
  const perBeat = { sixteenths: [0, 0.25, 0.5, 0.75], gallop: [0, 0.5, 0.75], eighths: [0, 0.5] }[kind];

  return [0, 1, 2, 3].flatMap((beat) => perBeat.map((step) => beat + step));
}

function composeCombat(variant: Variant): Track {
  const track = new Track();
  const random = prng(variant.seed + 100);
  const tremolo: Bow = { ...LEGATO, bright: 6, attack: 0.4, release: 1, vibrato: 0.003, tremolo: 2 * (BPM / 60) * 4 };

  bed(track, random, 0.09, tremolo, 0);
  harpLine(track, variant.seed + 1, variant.harp, 0.4);

  const steps = ostinatoSteps(variant.ostinato);
  const drop = variant.ostinato === 'eighths' ? 12 : 0;

  for (let bar = 0; bar < BARS; bar++) {
    const chord = chordAt(bar);
    const start = bar * 4 * BEAT;
    const fill = bar % 4 === 3;

    // Violoncelles et contrebasses en ostinato : la fondamentale, l'octave en fin de temps.
    for (const step of steps) {
      const up = step % 1 === 0.75 ? 12 : 0;
      const accent = step % 1 === 0 ? 1 : 0.65;

      for (const [octave, pan, level] of [[-12, -0.3, 0.17], [-24, 0.3, 0.13]] as const) {
        const voice = strings(random, hz(chord.root + octave - drop + up), 0.5, {
          ...LEGATO,
          desks: 3,
          bright: 7,
          spiccato: 9,
        });

        track.add(start + step * BEAT, 0.5, pan, 0.25, (t) => voice(t) * level * accent);
      }
    }

    // Timbales : fondamentale et quinte, un roulement qui monte à la fin de chaque phrase.
    const hits = { halves: [0, 2], beats: [0, 1, 2, 3], sparse: bar % 2 === 0 ? [0] : [] }[variant.timpani];

    for (const beat of hits) {
      const voice = timpani(random, hz(chord.root - 12 + (beat === 2 ? 7 : 0)), 1.4);

      track.add(start + beat * BEAT, 2.5, 0.15, 0.35, (t) => voice(t) * (beat === 0 ? 0.5 : 0.36));
    }

    if (fill) {
      for (let step = 0; step < 8; step++) {
        const voice = timpani(random, hz(chord.root - 12 + 7), 2.5);

        track.add(start + (2 + step / 4) * BEAT, 1.2, 0.15, 0.4, (t) => voice(t) * (0.12 + step * 0.03));
      }
    }

    // La grosse caisse, au fond : le premier temps de chaque mesure.
    const drum = bassDrum(random);

    track.add(start, 2, -0.1, 0.8, (t) => drum(t) * 0.35);
  }

  // Cuivres graves : la quinte puis la fondamentale de chaque accord, qui s'enflent et retombent.
  for (let bar = 0; bar < BARS; bar += 2) {
    const chord = chordAt(bar);

    for (const [interval, pan] of [[-5, -0.35], [0, 0.35]] as const) {
      const duration = 7 * BEAT;
      const voice = brass(hz(chord.root - 12 + interval + 12), duration);

      track.add((bar * 4 + 1) * BEAT, duration, pan, 0.7, (t) => voice(t) * 0.07 * variant.brass);
    }
  }

  track.reverb(0.7, 0.85);
  return track;
}

mkdirSync(out, { recursive: true });

const music = resolve('public/audio/music');
const candidates = resolve('docs/music-candidates');
const commands: string[] = [];

for (const [index, variant] of VARIANTS.entries()) {
  const suffix = index === 0 ? '' : `-${index + 1}-${variant.name}`;

  composeNight(variant).write(`${out}/night${suffix}.wav`, 0.84);
  composeCombat(variant).write(`${out}/combat${suffix}.wav`, 0.84, 1.2);

  for (const name of ['night', 'combat']) {
    const target = index === 0 ? `${music}/adam-${name}-loop` : `${candidates}/adam-${name}-loop${suffix}`;

    commands.push(
      `ffmpeg -y -i ${out}/${name}${suffix}.wav -c:a libvorbis -q:a 2 ${target}.ogg`,
      `ffmpeg -y -i ${out}/${name}${suffix}.wav -c:a aac -b:a 72k ${target}.m4a`,
    );
  }
}

console.log(`${LENGTH} échantillons à ${RATE} Hz par boucle (${(LENGTH / RATE).toFixed(3)} s).`);
console.log(commands.join('\n'));
