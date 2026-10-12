/**
 * Les échantillons enregistrés : les jingles (marimba, kalimba, petits
 * cuivres, générés avec Lyria 3) et les bruitages réels CC0, servis depuis
 * `public/audio/sfx/` — sources et licences dans son `CREDITS.md`.
 *
 * Même modèle que la musique (`music.ts`) : Ogg Vorbis d'abord, AAC
 * (`.m4a`) pour Safari, celui que le navigateur annonce savoir lire en
 * tête ; un décodage raté passe à l'encodage suivant. Rien n'est demandé au
 * chargement de la page : `preload()` part au premier geste, quand le
 * contexte existe, un fichier après l'autre pour ne pas disputer le réseau
 * à la musique. Décodé une fois, un buffer reste en cache.
 *
 * Tant qu'un son n'est pas décodé — réseau lent, fichier absent, décodage en
 * échec —, `pick()` répond `null` et le moteur retombe sur la synthèse de
 * `synth.ts`. Le jeu n'attend jamais un fichier pour faire du bruit.
 */

import type { SoundName } from './synth.ts';

export interface SampleSpec {
  /** Les fichiers, sans extension ; plusieurs = des variantes tirées au hasard. */
  readonly files: readonly string[];
  /** Gain sur le bus des bruitages : les fichiers sont tous à −16 LUFS, c'est ici qu'on équilibre. */
  readonly gain: number;
  /** Variation de vitesse (et donc de hauteur) de ±`spread` à chaque lecture. */
  readonly spread?: number;
}

/**
 * Un son par entrée, dans l'ordre du préchargement : les bruitages
 * fréquents d'abord. Les gains ont été réglés contre la musique (0,5 le
 * jour) : les impacts répétés restent sous les jingles, et les jingles
 * longs (colonie, vague repoussée, aube) sous l'alarme et le cor, qui
 * portent l'information.
 */
export const SAMPLES = {
  chop: { files: ['chop_1', 'chop_2', 'chop_3'], gain: 0.45, spread: 0.08 },
  rock: { files: ['rock_1', 'rock_2', 'rock_3'], gain: 0.45, spread: 0.08 },
  deliver: { files: ['deliver'], gain: 0.5, spread: 0.05 },
  pickup: { files: ['pickup'], gain: 0.55, spread: 0.05 },
  // Les voix des habitants : trois prises par sexe, et un léger écart de hauteur à chaque tap.
  heyHo: { files: ['heho_1', 'heho_2', 'heho_3'], gain: 0.6, spread: 0.04 },
  hey: { files: ['he_1', 'he_2', 'he_3'], gain: 0.6, spread: 0.04 },
  open: { files: ['open'], gain: 0.45 },
  tap: { files: ['tap'], gain: 0.35, spread: 0.05 },
  deny: { files: ['deny'], gain: 0.55 },
  arrow: { files: ['arrow_1', 'arrow_2', 'arrow_3'], gain: 0.4, spread: 0.08 },
  hit: { files: ['hit_1', 'hit_2', 'hit_3'], gain: 0.55, spread: 0.08 },
  die: { files: ['die'], gain: 0.5, spread: 0.06 },
  dizzy: { files: ['dizzy'], gain: 0.5 },
  thud: { files: ['thud'], gain: 0.6, spread: 0.06 },
  repair: { files: ['repair'], gain: 0.55, spread: 0.05 },
  bite: { files: ['bite'], gain: 0.6, spread: 0.06 },
  faint: { files: ['faint'], gain: 0.6 },
  gloop: { files: ['gloop'], gain: 0.4, spread: 0.1 },
  countdown: { files: ['countdown'], gain: 0.55 },
  brute: { files: ['brute'], gain: 0.75 },
  collapse: { files: ['collapse'], gain: 0.75 },
  horn: { files: ['horn'], gain: 0.85 },
  alarm: { files: ['alarm'], gain: 0.85 },
  build: { files: ['build'], gain: 0.55 },
  upgrade: { files: ['upgrade'], gain: 0.55 },
  objective: { files: ['objective'], gain: 0.6 },
  eureka: { files: ['eureka'], gain: 0.55 },
  baby: { files: ['baby'], gain: 0.55 },
  dawn: { files: ['dawn'], gain: 0.45 },
  victory: { files: ['victory'], gain: 0.45 },
  colony: { files: ['colony'], gain: 0.4 },
  defeat: { files: ['defeat'], gain: 0.6 },
} as const satisfies Record<SoundName, SampleSpec>;

const FORMATS = [
  { ext: 'ogg', type: 'audio/ogg; codecs="vorbis"' },
  { ext: 'm4a', type: 'audio/mp4; codecs="mp4a.40.2"' },
] as const;

/** Les extensions à essayer, celle que le navigateur dit savoir lire d'abord. */
export function sampleFormats(): string[] {
  const probe = typeof document === 'undefined' ? null : document.createElement('audio');
  const playable = FORMATS.filter((format) => probe?.canPlayType(format.type) !== '');

  return [...playable, ...FORMATS.filter((format) => !playable.includes(format))].map((format) => format.ext);
}

function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  return fetch(url)
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null);
}

export interface PickedSample {
  readonly buffer: AudioBuffer;
  readonly gain: number;
  readonly rate: number;
}

/** Ce dont la banque a besoin du dehors ; tout sauf `decode` a sa valeur par défaut (les tests les remplacent). */
export interface SampleBankOptions {
  /** Le `decodeAudioData` du contexte. */
  readonly decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  /** Les octets d'une URL, `null` en cas d'échec. */
  readonly fetcher?: (url: string) => Promise<ArrayBuffer | null>;
  /** Les extensions, dans l'ordre d'essai. */
  readonly formats?: readonly string[];
  readonly base?: string;
}

export class SampleBank {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  private readonly fetcher: (url: string) => Promise<ArrayBuffer | null>;
  private readonly formats: readonly string[];
  private readonly base: string;
  private loading: Promise<void> | null = null;

  public constructor(options: SampleBankOptions) {
    this.decode = options.decode;
    this.fetcher = options.fetcher ?? fetchBytes;
    this.formats = options.formats ?? sampleFormats();
    this.base = options.base ?? `${import.meta.env.BASE_URL}audio/sfx/`;
  }

  /** Charge tous les fichiers, un à la fois ; un second appel rend la même promesse. */
  public preload(): Promise<void> {
    this.loading ??= (async () => {
      for (const spec of Object.values(SAMPLES) as SampleSpec[]) {
        for (const file of spec.files) await this.load(file);
      }
    })();
    return this.loading;
  }

  /** Un échantillon décodé pour ce son (une variante au hasard), ou `null` : place à la synthèse. */
  public pick(name: SoundName, random: () => number = Math.random): PickedSample | null {
    const spec: SampleSpec = SAMPLES[name];
    const ready = spec.files.flatMap((file) => this.buffers.get(file) ?? []);

    if (ready.length === 0) return null;

    const buffer = ready[Math.min(ready.length - 1, Math.floor(random() * ready.length))];
    const spread = spec.spread ?? 0;
    const rate = 1 + (random() * 2 - 1) * spread;

    return buffer ? { buffer, gain: spec.gain, rate } : null;
  }

  private async load(file: string): Promise<void> {
    if (this.buffers.has(file)) return;

    for (const ext of this.formats) {
      const bytes = await this.fetcher(`${this.base}${file}.${ext}`);

      if (!bytes) continue;

      try {
        this.buffers.set(file, await this.decode(bytes));
        return;
      } catch {
        // Encodage annoncé mais pas décodé : le suivant.
      }
    }
    // Ni l'un ni l'autre : ce son restera synthétisé.
  }
}
