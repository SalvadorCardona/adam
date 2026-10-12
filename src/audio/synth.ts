/**
 * Synthèse des effets sonores : le repli.
 *
 * Chaque son a d'abord un échantillon enregistré (`samples.ts` : jingles
 * acoustiques et bruitages réels, plus proches de la DA vectorielle « post-apo
 * joyeux » que des bips de console). Mais un fichier peut tarder — réseau
 * lent — ou ne pas se décoder : en attendant, le son est fabriqué ici à la
 * volée, avec des oscillateurs et du bruit filtré, sans rien télécharger.
 *
 * Chaque fonction reçoit le contexte, la destination et l'instant de départ,
 * et branche ce qu'il faut. Les nœuds se libèrent seuls à la fin (`stop`).
 *
 * Les voix des habitants (« Hé ho ! », « Hé ! ») aussi : une dent de scie à
 * la hauteur d'une voix, filtrée sur les formants de la voyelle — une voix
 * de dessin animé, le temps que la vraie arrive.
 */

import type { Sex } from '../data/inhabitants.ts';

export type SoundName =
  | 'chop'
  | 'deny'
  | 'rock'
  | 'deliver'
  | 'repair'
  | 'build'
  | 'upgrade'
  | 'arrow'
  | 'hit'
  | 'die'
  | 'dizzy'
  | 'thud'
  | 'collapse'
  | 'alarm'
  | 'baby'
  | 'defeat'
  | 'open'
  | 'tap'
  | 'countdown'
  | 'bite'
  | 'faint'
  | 'horn'
  | 'gloop'
  | 'victory'
  | 'brute'
  | 'dawn'
  | 'pickup'
  | 'eureka'
  | 'objective'
  | 'colony'
  | 'heyHo'
  | 'hey';

/** Ce que dit un habitant qu'on tape : un homme « Hé ho ! » d'une voix grave, une femme « Hé ! » d'une voix aiguë. */
export const VOICES = { male: 'heyHo', female: 'hey' } as const satisfies Record<Sex, SoundName>;

export type VoiceName = (typeof VOICES)[Sex];

/** Une seconde de bruit blanc, partagée par tous les sons qui en ont besoin. */
let noiseBuffer: AudioBuffer | null = null;

function noise(ctx: AudioContext): AudioBufferSourceNode {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);

    const data = noiseBuffer.getChannelData(0);

    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();

  source.buffer = noiseBuffer;
  return source;
}

interface Env {
  attack?: number;
  decay: number;
  peak?: number;
}

/** Une enveloppe attaque/déclin sur un gain, de `at` à `at + attack + decay`. */
function envelope(ctx: AudioContext, at: number, env: Env): GainNode {
  const gain = ctx.createGain();
  const attack = env.attack ?? 0.005;
  const peak = env.peak ?? 1;

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + env.decay);
  return gain;
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  type: OscillatorType,
  from: number,
  to: number,
  env: Env,
): void {
  const osc = ctx.createOscillator();
  const gain = envelope(ctx, at, env);
  const end = at + (env.attack ?? 0.005) + env.decay;

  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, end);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(end + 0.02);
}

function burst(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  filter: BiquadFilterType,
  from: number,
  to: number,
  env: Env,
): void {
  const source = noise(ctx);
  const biquad = ctx.createBiquadFilter();
  const gain = envelope(ctx, at, env);
  const end = at + (env.attack ?? 0.005) + env.decay;

  biquad.type = filter;
  biquad.Q.value = 1.2;
  biquad.frequency.setValueAtTime(from, at);
  if (to !== from) biquad.frequency.exponentialRampToValueAtTime(to, end);
  source.connect(biquad).connect(gain).connect(out);
  source.start(at);
  source.stop(end + 0.02);
}

/**
 * Une voyelle dite : une dent de scie à `pitch` Hz, qui glisse de `glide`,
 * filtrée sur ses deux premiers formants `f1` et `f2` (Hz).
 */
function vowel(ctx: AudioContext, out: AudioNode, at: number, pitch: number, glide: number, f1: number, f2: number, decay: number): void {
  const osc = ctx.createOscillator();
  const gain = envelope(ctx, at, { attack: 0.03, decay, peak: 0.5 });
  const end = at + 0.03 + decay;

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(pitch, at);
  osc.frequency.exponentialRampToValueAtTime(pitch * glide, end);
  for (const [frequency, q, level] of [
    [f1, 6, 1],
    [f2, 10, 0.5],
  ] as const) {
    const formant = ctx.createBiquadFilter();
    const weight = ctx.createGain();

    formant.type = 'bandpass';
    formant.frequency.value = frequency;
    formant.Q.value = q;
    weight.gain.value = level;
    osc.connect(formant).connect(weight).connect(gain);
  }
  gain.connect(out);
  osc.start(at);
  osc.stop(end + 0.02);
}

/** Variation aléatoire de ±`spread` autour de 1 : deux coups de hache ne sonnent jamais pareil. */
function vary(spread: number): number {
  return 1 + (Math.random() * 2 - 1) * spread;
}

export const SOUNDS: Record<SoundName, (ctx: AudioContext, out: AudioNode, at: number) => void> = {
  /** Hache dans le bois : un claquement mat et une résonance basse. */
  chop(ctx, out, at) {
    const v = vary(0.12);

    burst(ctx, out, at, 'bandpass', 1400 * v, 500 * v, { decay: 0.09, peak: 0.9 });
    tone(ctx, out, at, 'triangle', 150 * v, 70 * v, { decay: 0.14, peak: 0.6 });
  },

  /** Pierre qui casse : plus sec, plus aigu, avec un second éclat. */
  rock(ctx, out, at) {
    const v = vary(0.1);

    burst(ctx, out, at, 'highpass', 2600 * v, 1200 * v, { decay: 0.06, peak: 0.8 });
    burst(ctx, out, at + 0.05, 'bandpass', 3200 * v, 900 * v, { decay: 0.08, peak: 0.5 });
    tone(ctx, out, at, 'square', 220 * v, 90 * v, { decay: 0.05, peak: 0.25 });
  },

  /** Un tap sur un bouton de l'interface : un « tic » bref et clair. */
  tap(ctx, out, at) {
    tone(ctx, out, at, 'sine', 900 * vary(0.05), 700, { decay: 0.04, peak: 0.2 });
  },

  /** Un objet posé sur le chantier. */
  deliver(ctx, out, at) {
    tone(ctx, out, at, 'square', 660, 880, { decay: 0.06, peak: 0.18 });
  },

  /** Un bois cloué sur un bâtiment abîmé : un petit coup de marteau, puis une note qui monte. */
  repair(ctx, out, at) {
    burst(ctx, out, at, 'bandpass', 1800 * vary(0.1), 900, { decay: 0.04, peak: 0.5 });
    tone(ctx, out, at + 0.04, 'triangle', 523, 784, { decay: 0.12, peak: 0.25 });
  },

  /** Chantier achevé : trois notes qui montent. */
  build(ctx, out, at) {
    for (const [i, f] of [523, 659, 784, 1047].entries()) {
      tone(ctx, out, at + i * 0.09, 'triangle', f, f, { decay: 0.18, peak: 0.35 });
    }
  },

  /** Bâtiment amélioré : deux coups de marteau sur du fer, puis les notes du chantier achevé, une octave plus haut. */
  upgrade(ctx, out, at) {
    for (const i of [0, 1]) {
      burst(ctx, out, at + i * 0.1, 'bandpass', 3600, 2400, { decay: 0.05, peak: 0.6 });
      tone(ctx, out, at + i * 0.1, 'square', 1250, 1180, { decay: 0.08, peak: 0.15 });
    }
    for (const [i, f] of [784, 1047, 1319].entries()) {
      tone(ctx, out, at + 0.24 + i * 0.08, 'triangle', f, f, { decay: 0.2, peak: 0.3 });
    }
  },

  /** Une flèche qui siffle. */
  arrow(ctx, out, at) {
    burst(ctx, out, at, 'bandpass', 2400 * vary(0.1), 700, { attack: 0.01, decay: 0.12, peak: 0.45 });
  },

  /** Flèche dans un mutant. */
  hit(ctx, out, at) {
    tone(ctx, out, at, 'square', 320 * vary(0.1), 160, { decay: 0.07, peak: 0.3 });
    burst(ctx, out, at, 'lowpass', 1800, 400, { decay: 0.08, peak: 0.6 });
  },

  /** Un mutant qui tombe : un râle qui descend. */
  die(ctx, out, at) {
    tone(ctx, out, at, 'sawtooth', 260 * vary(0.08), 55, { attack: 0.02, decay: 0.32, peak: 0.28 });
    burst(ctx, out, at + 0.05, 'lowpass', 900, 200, { decay: 0.25, peak: 0.4 });
  },

  /** Un mutant assommé : un « boing » qui tangue, et deux petits gazouillis d'étoiles. */
  dizzy(ctx, out, at) {
    tone(ctx, out, at, 'sine', 520, 180, { attack: 0.01, decay: 0.3, peak: 0.3 });
    tone(ctx, out, at + 0.26, 'triangle', 1319, 1568, { decay: 0.07, peak: 0.16 });
    tone(ctx, out, at + 0.36, 'triangle', 1175, 1397, { decay: 0.07, peak: 0.16 });
  },

  /** Un coup de mutant sur un mur. */
  thud(ctx, out, at) {
    tone(ctx, out, at, 'sine', 90, 45, { decay: 0.18, peak: 0.8 });
    burst(ctx, out, at, 'lowpass', 600, 150, { decay: 0.1, peak: 0.5 });
  },

  /** Un bâtiment qui s'effondre. */
  collapse(ctx, out, at) {
    burst(ctx, out, at, 'lowpass', 1200, 80, { attack: 0.02, decay: 0.7, peak: 1 });
    tone(ctx, out, at, 'triangle', 110, 30, { decay: 0.6, peak: 0.6 });
  },

  /** Une vague approche : deux tons alternés, deux fois. */
  alarm(ctx, out, at) {
    for (let i = 0; i < 4; i += 1) {
      const f = i % 2 === 0 ? 440 : 554;

      tone(ctx, out, at + i * 0.16, 'square', f, f, { attack: 0.01, decay: 0.13, peak: 0.16 });
    }
  },

  /** Une naissance : un carillon doux. */
  baby(ctx, out, at) {
    for (const [i, f] of [659, 880, 1319].entries()) {
      tone(ctx, out, at + i * 0.12, 'sine', f, f, { attack: 0.01, decay: 0.4, peak: 0.3 });
    }
  },

  /** La mairie est tombée. */
  defeat(ctx, out, at) {
    for (const [i, f] of [392, 349, 311, 262].entries()) {
      tone(ctx, out, at + i * 0.28, 'triangle', f, f * 0.98, { attack: 0.02, decay: 0.3, peak: 0.4 });
    }
  },

  /** Compte à rebours d'une vague : un bip sec, grave, qui ne se confond pas avec l'alarme. */
  countdown(ctx, out, at) {
    tone(ctx, out, at, 'square', 330, 330, { attack: 0.005, decay: 0.09, peak: 0.14 });
    tone(ctx, out, at, 'triangle', 165, 160, { decay: 0.12, peak: 0.3 });
  },

  /** Une pince ou un croc sur Adam : un claquement sec et un petit cri qui monte. */
  bite(ctx, out, at) {
    const v = vary(0.1);

    burst(ctx, out, at, 'highpass', 3000 * v, 1800 * v, { decay: 0.04, peak: 0.7 });
    tone(ctx, out, at + 0.03, 'square', 420 * v, 620 * v, { decay: 0.08, peak: 0.16 });
  },

  /** Adam tombe dans les pommes : une glissade qui descend, sans drame. */
  faint(ctx, out, at) {
    tone(ctx, out, at, 'triangle', 660, 180, { attack: 0.02, decay: 0.5, peak: 0.35 });
    tone(ctx, out, at + 0.12, 'sine', 330, 110, { decay: 0.45, peak: 0.25 });
  },

  /** Une vague s'annonce : un cor grave qui enfle, et un grondement sous lui. */
  horn(ctx, out, at) {
    tone(ctx, out, at, 'sawtooth', 73, 69, { attack: 0.25, decay: 1.1, peak: 0.3 });
    tone(ctx, out, at, 'triangle', 110, 104, { attack: 0.2, decay: 1, peak: 0.35 });
    burst(ctx, out, at, 'lowpass', 220, 60, { attack: 0.3, decay: 1.1, peak: 0.5 });
  },

  /** Les flaques des mutants qui bouillonnent : des bulles qui remontent et éclatent. */
  gloop(ctx, out, at) {
    for (let i = 0; i < 4; i += 1) {
      const v = vary(0.15);

      tone(ctx, out, at + i * 0.09 * v, 'sine', 180 * v, 520 * v, { attack: 0.01, decay: 0.08, peak: 0.35 });
    }
  },

  /** Vague repoussée : une petite fanfare qui monte et se pose. */
  victory(ctx, out, at) {
    for (const [i, f] of [392, 523, 659, 784].entries()) {
      tone(ctx, out, at + i * 0.11, 'square', f, f, { attack: 0.01, decay: 0.16, peak: 0.14 });
    }
    tone(ctx, out, at + 0.44, 'triangle', 1047, 1047, { attack: 0.01, decay: 0.5, peak: 0.35 });
  },

  /** Un gros mutant dans la vague : un accent grave qui s'effondre de 110 à 40 Hz. */
  brute(ctx, out, at) {
    tone(ctx, out, at, 'sawtooth', 110, 40, { attack: 0.02, decay: 0.58, peak: 0.28 });
    tone(ctx, out, at, 'sine', 110, 40, { attack: 0.02, decay: 0.58, peak: 0.5 });
  },

  /** L'aube : la, do dièse, mi, un petit arpège majeur — « on a tenu ». */
  dawn(ctx, out, at) {
    for (const [i, f] of [440, 554.37, 659.25].entries()) {
      tone(ctx, out, at + i * 0.12, 'triangle', f, f, { attack: 0.01, decay: i === 2 ? 0.45 : 0.11, peak: 0.28 });
    }
  },

  /** Une recherche aboutit : une bulle qui monte, puis trois notes claires en tierce — « eurêka ». */
  eureka(ctx, out, at) {
    tone(ctx, out, at, 'sine', 420, 1260, { attack: 0.01, decay: 0.16, peak: 0.22 });
    for (const [i, f] of [784, 988, 1175].entries()) {
      tone(ctx, out, at + 0.16 + i * 0.09, 'triangle', f, f, { attack: 0.01, decay: 0.28, peak: 0.26 });
    }
  },

  /** Un objectif réussi : un arpège joyeux qui monte, et une cloche au bout. */
  objective(ctx, out, at) {
    for (const [i, f] of [523, 659, 784, 1047, 1319].entries()) {
      tone(ctx, out, at + i * 0.07, 'triangle', f, f, { decay: 0.2, peak: 0.3 });
    }
    tone(ctx, out, at + 0.36, 'sine', 2093, 2093, { attack: 0.01, decay: 0.6, peak: 0.18 });
  },

  /** La colonie vivra : une petite fanfare, deux accords et une tenue. */
  colony(ctx, out, at) {
    for (const [i, chord] of [[392, 494, 587], [440, 554, 659], [523, 659, 784, 1047]].entries()) {
      const start = at + i * 0.26;
      const decay = i === 2 ? 1.1 : 0.22;

      for (const f of chord) tone(ctx, out, start, 'triangle', f, f, { attack: 0.01, decay, peak: 0.22 });
    }
  },

  /** Du butin ramassé : deux notes vives. */
  pickup(ctx, out, at) {
    tone(ctx, out, at, 'triangle', 988, 988, { decay: 0.06, peak: 0.3 });
    tone(ctx, out, at + 0.06, 'triangle', 1319, 1319, { decay: 0.12, peak: 0.3 });
  },

  /** Un clic sur un emplacement refusé : deux notes courtes qui descendent, « non-non ». */
  deny(ctx, out, at) {
    tone(ctx, out, at, 'square', 330, 330, { decay: 0.06, peak: 0.12 });
    tone(ctx, out, at + 0.08, 'square', 247, 247, { decay: 0.08, peak: 0.12 });
  },

  /** Une fenêtre qui s'ouvre. */
  open(ctx, out, at) {
    tone(ctx, out, at, 'square', 880, 1320, { decay: 0.05, peak: 0.12 });
  },

  /** Un homme qu'on tape : « Hé ho ! », grave — un « é » qui monte, un « o » qui retombe. */
  heyHo(ctx, out, at) {
    const v = vary(0.05);

    vowel(ctx, out, at, 125 * v, 1.1, 400, 2000, 0.16);
    vowel(ctx, out, at + 0.24, 115 * v, 0.85, 450, 850, 0.26);
  },

  /** Une femme qu'on tape : « Hé ! », aigu, qui monte. */
  hey(ctx, out, at) {
    vowel(ctx, out, at, 235 * vary(0.05), 1.12, 470, 2300, 0.2);
  },
};
