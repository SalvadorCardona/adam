/**
 * L'ambiance de l'écran titre : un vent doux qui monte et retombe, et, quand le
 * crépuscule tombe, des grillons.
 *
 * Elle se branche sur le bus des bruitages (`AudioEngine.setAmbience`), donc le
 * muet et le volume des bruitages la tiennent comme le reste. Le vent est un
 * bruit bouclé, filtré, dont un oscillateur lent fait les rafales ; les grillons
 * sont des trains de stridulations (`cricket` de `synth.ts`) tirés au hasard,
 * d'autant plus rapprochés que le crépuscule est avancé (`setDusk`, de 0 à 1).
 */

import { cricket } from './synth.ts';

/** Le vent, à plein : bas, sous les jingles. */
const WIND_GAIN = 0.22;
/** Les grillons, au plus fort du crépuscule. */
const CRICKET_GAIN = 0.16;
/** Sous ce niveau de crépuscule, pas un grillon. */
const CRICKET_FROM = 0.15;
/** L'écart entre deux trains de grillons, en secondes : de la fin (crépuscule plein) au début. */
const CRICKET_GAP_S = { min: 0.35, max: 2.4 };
/** Le fondu d'entrée et de sortie, en secondes. */
const FADE_S = 1.5;

export class Ambience {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly crickets: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dusk = 0;
  private stopped = false;

  public constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_S);
    this.out.connect(destination);
    this.crickets = ctx.createGain();
    this.crickets.gain.value = 0;
    this.crickets.connect(this.out);
    this.wind();
    this.sing();
  }

  /** Le crépuscule, de 0 (plein jour) à 1 (le plus sombre) : les grillons s'éveillent. */
  public setDusk(level: number): void {
    this.dusk = Math.min(1, Math.max(0, level));
    this.crickets.gain.setTargetAtTime(CRICKET_GAIN * this.dusk, this.ctx.currentTime, 0.5);
  }

  /** Tout s'éteint en fondu, puis les nœuds se libèrent. */
  public stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;

    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + FADE_S);
    for (const source of this.sources) source.stop(now + FADE_S + 0.05);
    setTimeout(() => this.out.disconnect(), (FADE_S + 0.2) * 1000);
  }

  /** Un bruit bouclé, passé au filtre ; un oscillateur très lent en fait les rafales (volume et timbre). */
  private wind(): void {
    const { ctx } = this;
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const level = ctx.createGain();

    source.buffer = buffer;
    source.loop = true;
    filter.type = 'bandpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    level.gain.value = WIND_GAIN * 0.6;
    source.connect(filter).connect(level).connect(this.out);

    for (const [target, rate, depth] of [
      [level.gain, 0.11, WIND_GAIN * 0.4],
      [filter.frequency, 0.07, 260],
    ] as const) {
      const lfo = ctx.createOscillator();
      const swing = ctx.createGain();

      lfo.frequency.value = rate;
      swing.gain.value = depth;
      lfo.connect(swing).connect(target);
      lfo.start();
      this.sources.push(lfo);
    }
    source.start();
    this.sources.push(source);
  }

  /** Un train de grillons, puis le suivant : de plus en plus vite à mesure que la nuit vient. */
  private sing(): void {
    if (this.stopped) return;
    if (this.dusk >= CRICKET_FROM && this.ctx.state === 'running') cricket(this.ctx, this.crickets, this.ctx.currentTime + 0.02, 4200 + Math.random() * 500);
    const { min, max } = CRICKET_GAP_S;
    const gap = min + (max - min) * (1 - this.dusk) * (0.5 + Math.random() * 0.5);

    this.timer = setTimeout(() => this.sing(), gap * 1000);
  }
}
