/**
 * Les deux boucles de la nuit, composées ici, note à note, et rendues en WAV :
 *
 *   npm run music:night -- <dossier>
 *
 * - `night.wav` : la nuit calme — nappe de cordes, basse qui tient, kalimba
 *   clairsemé, un battement de cœur sourd au premier temps ;
 * - `combat.wav` : la même grille, plus tendue — basse en croches, ostinato
 *   piqué, grosse caisse, caisse claire, charleston qui passe aux doubles
 *   croches à mi-boucle, roulement de toms toutes les quatre mesures.
 *
 * Même tempo, même grille, même longueur au échantillon près : le jeu lance
 * le combat calé sur la position de la nuit (`music.ts`), et le fondu
 * enchaîné sonne comme une couche qui s'ajoute, pas comme un autre morceau.
 *
 * La boucle est rendue « en anneau » : la queue d'une note qui dépasse la fin
 * repart au début, et l'écho est calculé sur trois tours pour ne garder que
 * celui du milieu. Le raccord ne s'entend pas.
 *
 * Tout est déterministe (bruit tiré d'un PRNG à graine) : relancer l'outil
 * redonne les mêmes octets. Les commandes ffmpeg affichées à la fin écrivent
 * les `.ogg` et `.m4a` de `public/audio/music/`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [directory = 'music'] = process.argv.slice(2);
const out = resolve(directory);

const RATE = 44_100;
const BPM = 80;
const BEAT = 60 / BPM;
const BARS = 16;
const LENGTH = Math.round(BARS * 4 * BEAT * RATE);

/** La grille, deux mesures par accord : la, fa, do, sol, la, fa, ré, mi. Midi des fondamentales. */
const CHORDS: readonly { root: number; minor: boolean }[] = [
  { root: 57, minor: true },
  { root: 53, minor: false },
  { root: 48, minor: false },
  { root: 55, minor: false },
  { root: 57, minor: true },
  { root: 53, minor: false },
  { root: 50, minor: true },
  { root: 52, minor: false },
];

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
const chordAt = (bar: number): { root: number; minor: boolean } => CHORDS[Math.floor(bar / 2) % CHORDS.length]!;
const triad = ({ root, minor }: { root: number; minor: boolean }): number[] => [root, root + (minor ? 3 : 4), root + 7];

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

  /** Ajoute `sample(t)` sur `duration` secondes à partir de `at`, en anneau. */
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
   * Un écho de salle (quatre filtres en peigne, deux passe-tout), calculé sur
   * trois tours de boucle : on ne garde que le deuxième, déjà rempli par la
   * queue du premier.
   */
  public reverb(amount: number): void {
    const combs = [1557, 1617, 1491, 1422];
    const allpasses = [225, 556];
    const wet = new Float32Array(LENGTH);

    for (const [c, delay] of combs.entries()) {
      const line = new Float32Array(delay);
      let cursor = 0;
      let low = 0;

      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < LENGTH; i++) {
          const delayed = line[cursor]!;

          low = delayed * 0.7 + low * 0.3;
          line[cursor] = this.send[i]! + low * (0.84 + c * 0.005);
          cursor = (cursor + 1) % delay;
          if (pass === 1) wet[i]! += delayed / combs.length;
        }
      }
    }

    for (const delay of allpasses) {
      const line = new Float32Array(delay);
      let cursor = 0;
      const source = Float32Array.from(wet);

      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < LENGTH; i++) {
          const delayed = line[cursor]!;
          const input = source[i]!;

          line[cursor] = input + delayed * 0.5;
          cursor = (cursor + 1) % delay;
          if (pass === 1) wet[i] = delayed - input * 0.5;
        }
      }
    }

    // Une stéréo d'écho : la droite un peu en retard sur la gauche.
    const offset = Math.round(0.011 * RATE);

    for (let i = 0; i < LENGTH; i++) {
      this.left[i]! += wet[i]! * amount;
      this.right[i]! += wet[(i - offset + LENGTH) % LENGTH]! * amount;
    }
  }

  /**
   * Normalise la crête à `peak` et écrit le WAV 16 bits stéréo. `drive` > 0
   * arrondit d'abord les crêtes (tangente hyperbolique) : les coups de la
   * batterie ne dictent plus seuls le volume, le combat sonne plus fort.
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

/** Une voix de nappe : trois ondes légèrement désaccordées, peu d'harmoniques, un vibrato lent. */
function padVoice(frequency: number, duration: number): (t: number) => number {
  return (t) => {
    let value = 0;

    for (const detune of [-0.004, 0, 0.005]) {
      const f = frequency * (1 + detune) * (1 + 0.002 * Math.sin(2 * Math.PI * 4.5 * t));

      value += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) + 0.12 * Math.sin(6 * Math.PI * f * t);
    }

    return (value / 3) * envelope(t, duration, 1.4, 1.8);
  };
}

/** Un kalimba : fondamentale, partiels inharmoniques qui s'éteignent vite. */
function kalimba(frequency: number): (t: number) => number {
  return (t) =>
    Math.exp(-t * 3) * Math.sin(2 * Math.PI * frequency * t) +
    0.35 * Math.exp(-t * 9) * Math.sin(2 * Math.PI * frequency * 2.76 * t) +
    0.12 * Math.exp(-t * 18) * Math.sin(2 * Math.PI * frequency * 5.4 * t);
}

/** Une corde piquée : une dent de scie adoucie (cinq harmoniques), courte. */
function pluck(frequency: number, decay: number): (t: number) => number {
  return (t) => {
    let value = 0;

    for (let h = 1; h <= 5; h++) value += Math.sin(2 * Math.PI * frequency * h * t) / h;
    return value * Math.exp(-t * decay) * Math.min(1, t / 0.004);
  };
}

/** Une grosse caisse : un sinus qui tombe de `from` à 42 Hz. */
function kick(from: number, decay: number): (t: number) => number {
  return (t) => {
    const phase = 2 * Math.PI * (42 * t + ((from - 42) / 30) * (1 - Math.exp(-t * 30)));

    return Math.sin(phase) * Math.exp(-t * decay) * Math.min(1, t / 0.002);
  };
}

/** Du bruit filtré : passe-bas à un pôle, ou passe-haut (différence) pour le charleston. */
function noise(random: () => number, decay: number, highpass: boolean): (t: number) => number {
  let last = 0;
  let low = 0;

  return (t) => {
    const white = random() * 2 - 1;
    const value = highpass ? white - last : (low = low * 0.6 + white * 0.4);

    last = white;
    return value * Math.exp(-t * decay);
  };
}

/** La base commune : nappe et basse tenue. `bright` ouvre la nappe d'une octave. */
function bed(track: Track, gain: number, bright: boolean): void {
  for (let bar = 0; bar < BARS; bar += 2) {
    const chord = chordAt(bar);
    const at = bar * 4 * BEAT;
    const duration = 8 * BEAT + 1.8;

    for (const [index, note] of triad(chord).entries()) {
      const voice = padVoice(hz(note - 12 + (bright && index > 0 ? 12 : 0)), duration);

      track.add(at, duration, [-0.5, 0.1, 0.5][index]!, 0.5, (t) => voice(t) * gain);
    }

    const bass = padVoice(hz(chord.root - 24), duration);

    track.add(at, duration, 0, 0.1, (t) => bass(t) * gain * 1.1);
  }
}

function composeNight(): Track {
  const track = new Track();
  const random = prng(7);

  bed(track, 0.16, false);

  // Le kalimba : des croches tirées au sort dans l'accord, plus rares au début de chaque phrase.
  for (let bar = 0; bar < BARS; bar++) {
    const notes = triad(chordAt(bar)).map((note) => note + 12);

    for (let eighth = 0; eighth < 8; eighth++) {
      if (random() > (bar % 4 === 0 ? 0.25 : 0.4)) continue;

      const note = notes[Math.floor(random() * notes.length)]! + (random() < 0.25 ? 12 : 0);
      const voice = kalimba(hz(note));

      track.add((bar * 4 + eighth / 2) * BEAT, 2.5, random() * 1.2 - 0.6, 0.6, (t) => voice(t) * 0.11);
    }
  }

  // Un cœur sourd : deux coups rapprochés au premier temps de chaque mesure.
  for (let bar = 0; bar < BARS; bar++) {
    for (const [offset, level] of [[0, 0.35], [0.28, 0.22]] as const) {
      const voice = kick(70, 9);

      track.add((bar * 4 + offset) * BEAT, 0.6, 0, 0.05, (t) => voice(t) * level);
    }
  }

  track.reverb(0.55);
  return track;
}

function composeCombat(): Track {
  const track = new Track();
  const random = prng(11);

  bed(track, 0.11, true);

  for (let bar = 0; bar < BARS; bar++) {
    const chord = chordAt(bar);
    const notes = triad(chord);
    const start = bar * 4 * BEAT;
    const fill = bar % 4 === 3;

    // Basse en croches : fondamentale, octave une fois sur quatre.
    for (let eighth = 0; eighth < 8; eighth++) {
      const voice = pluck(hz(chord.root - 24 + (eighth % 4 === 3 ? 12 : 0)), 7);

      track.add(start + (eighth / 2) * BEAT, 0.6, 0, 0.05, (t) => voice(t) * 0.22);
    }

    // L'ostinato piqué : l'accord arpégé en doubles croches, motif 1-3-5-3.
    for (let sixteenth = 0; sixteenth < 16; sixteenth++) {
      const note = notes[[0, 1, 2, 1][sixteenth % 4]!]! + (sixteenth >= 8 && bar % 2 === 1 ? 12 : 0);
      const voice = pluck(hz(note), 16);
      const accent = sixteenth % 4 === 0 ? 1 : 0.6;

      track.add(start + (sixteenth / 4) * BEAT, 0.4, sixteenth % 2 === 0 ? -0.35 : 0.35, 0.3, (t) => voice(t) * 0.07 * accent);
    }

    // Grosse caisse : 1, le « et » de 2, 3.
    for (const beat of fill ? [0, 2] : [0, 1.5, 2]) {
      const voice = kick(130, 7);

      track.add(start + beat * BEAT, 0.5, 0, 0.05, (t) => voice(t) * 0.55);
    }

    // Caisse claire sur 2 et 4 : un ton grave et un souffle.
    for (const beat of fill ? [1] : [1, 3]) {
      const body = kick(220, 25);
      const snap = noise(random, 14, false);

      track.add(start + beat * BEAT, 0.4, 0.05, 0.35, (t) => body(t) * 0.18 + snap(t) * 0.22);
    }

    // Charleston : croches puis doubles croches à mi-boucle, accent sur le temps.
    const steps = bar < BARS / 2 ? 8 : 16;

    for (let step = 0; step < steps; step++) {
      const voice = noise(random, 45, true);
      const level = step % (steps / 4) === 0 ? 0.07 : 0.045;

      track.add(start + ((step * 4) / steps) * BEAT, 0.12, 0.3, 0.1, (t) => voice(t) * level);
    }

    // Roulement de toms sur la fin de la quatrième mesure.
    if (fill) {
      for (let step = 0; step < 6; step++) {
        const voice = kick(160 - step * 15, 10);

        track.add(start + (2.5 + step / 4) * BEAT, 0.5, -0.4 + step * 0.16, 0.3, (t) => voice(t) * 0.35);
      }
    }
  }

  track.reverb(0.3);
  return track;
}

mkdirSync(out, { recursive: true });
composeNight().write(`${out}/night.wav`, 0.84);
composeCombat().write(`${out}/combat.wav`, 0.84, 1.5);

const music = resolve('public/audio/music');

console.log(`${LENGTH} échantillons à ${RATE} Hz par boucle (${(LENGTH / RATE).toFixed(3)} s).`);
console.log(
  ['night', 'combat']
    .flatMap((name) => [
      `ffmpeg -y -i ${out}/${name}.wav -c:a libvorbis -q:a 2 ${music}/adam-${name}-loop.ogg`,
      `ffmpeg -y -i ${out}/${name}.wav -c:a aac -b:a 96k ${music}/adam-${name}-loop.m4a`,
    ])
    .join('\n'),
);
