/**
 * Le moteur audio : un `AudioContext`, un volume maître, et deux règles.
 *
 * 1. Rien ne joue avant un geste du joueur. Les navigateurs mobiles refusent
 *    de démarrer l'audio sans lui ; `unlock()` est branché sur le premier
 *    `pointerdown` et fait tout partir — la musique comprise.
 * 2. Le moteur ne connaît pas le monde. Il expose `play(name)` ; c'est le
 *    câblage (`main.ts`) qui abonne chaque événement de simulation à un son.
 *
 * La nuit a sa propre humeur (`nightMood.ts`) : le moteur la tient même
 * avant le premier geste, et l'applique dès qu'il a un contexte — le
 * morceau de nuit, puis celui du combat pendant une vague (`music.ts`).
 * Musique coupée, c'est la couche de tension synthétique (`nightLayer.ts`)
 * qui dit la nuit, si le son est activé ; musique allumée, elle se tait :
 * sa pulsation se battrait avec la batterie du combat.
 *
 * Le réglage muet, celui de la musique et les deux volumes (musique,
 * bruitages) survivent au rechargement (`localStorage`) : couper le son
 * dans un jeu mobile est une décision qu'on ne veut pas reprendre à chaque
 * partie. Couper la musique laisse les bruitages. En pause, la musique
 * recule sans s'arrêter (`setPaused`).
 *
 * Un son joue son échantillon enregistré s'il est décodé (`samples.ts`,
 * préchargé au premier geste), sa synthèse (`synth.ts`) sinon.
 *
 * La voix d'un habitant tapé (`speak`) passe par sa propre prise, branchée
 * sur les bruitages — muet et volume la tiennent comme le reste : une seule
 * à la fois, chaque tap coupe la précédente en un éclair. Dix taps rapides
 * font dix débuts de « Hé ho ! », jamais dix voix l'une sur l'autre.
 *
 * Onglet caché, le contexte est suspendu (`setHidden`) : plus de musique en
 * arrière-plan, et elle reprend où elle en était au retour.
 */

import { Music } from './music.ts';
import { NightLayer } from './nightLayer.ts';
import {
  DAY_MOOD,
  DUSK_RAMP_S,
  MUSIC_FADE_S,
  TENSION_FADE_S,
  musicState,
  nightLevels,
  nightMood,
  type NightMoment,
} from './nightMood.ts';
import { SampleBank, type PickedSample } from './samples.ts';
import { SOUNDS, type SoundName, type VoiceName } from './synth.ts';

const MUTE_KEY = 'adam:muted';
const MUSIC_KEY = 'adam:music';
const MUSIC_VOLUME_KEY = 'adam:music-volume';
const SFX_VOLUME_KEY = 'adam:sfx-volume';

/** Le bus des bruitages, à plein volume du joueur : un peu sous le maître. */
const SFX_GAIN = 0.8;

/** Deux sons identiques à moins de cet intervalle : le second est ignoré. */
const DEDUPE_MS = 35;

/** Un deuil : la musique se tait si longtemps, puis une note grave ; les morts qui suivent, tout de suite après, n'y changent rien. */
const MOURN_MS = 2000;
const MOURN_COOLDOWN_MS = 10000;

/** La constante de temps du fondu qui coupe une voix quand une autre commence, en secondes : un clic évité, pas un chevauchement. */
const VOICE_CUT_S = 0.015;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  /** La prise de la voix en cours : la couper fait taire la voix, échantillon ou synthèse. */
  private voice: GainNode | null = null;
  private music: Music | null = null;
  private samples: SampleBank | null = null;
  private mood = DAY_MOOD;
  /** La mairie en danger, de 0 à 1 : le battement sourd de la nuit s'en nourrit. */
  private danger = 0;
  /** La couche de tension : elle n'existe que la nuit, son activé. */
  private tension: NightLayer | null = null;
  private readonly lastPlayed = new Map<SoundName, number>();
  private mutedFlag: boolean;
  private musicFlag: boolean;
  private musicLevel: number;
  private sfxLevel: number;
  private paused = false;
  private mourning = false;
  private mournedAt = -Infinity;
  private hidden = false;

  public constructor() {
    this.mutedFlag = readFlag(MUTE_KEY, false);
    this.musicFlag = readFlag(MUSIC_KEY, true);
    this.musicLevel = readLevel(MUSIC_VOLUME_KEY);
    this.sfxLevel = readLevel(SFX_VOLUME_KEY);
  }

  public get muted(): boolean {
    return this.mutedFlag;
  }

  /** Vrai si la musique de fond est voulue (réglage du joueur, indépendant du muet). */
  public get musicOn(): boolean {
    return this.musicFlag;
  }

  /** Volume de la musique choisi par le joueur, de 0 à 1. */
  public get musicVolume(): number {
    return this.musicLevel;
  }

  /** Volume des bruitages choisi par le joueur, de 0 à 1. */
  public get sfxVolume(): number {
    return this.sfxLevel;
  }

  /** Vrai une fois le contexte créé et démarré par un geste. */
  public get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /**
   * Crée et démarre le contexte. À appeler depuis un gestionnaire d'entrée
   * utilisateur ; ailleurs, le navigateur le laissera suspendu.
   */
  public unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext;

      if (!Ctor) return;

      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.mutedFlag ? 0 : 1;
      this.master.connect(this.ctx.destination);

      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = SFX_GAIN * this.sfxLevel;
      this.sfx.connect(this.master);

      const ctx = this.ctx;

      // Les échantillons ne se demandent qu'ici : l'écran titre ne les attend pas.
      this.samples = new SampleBank({ decode: (bytes) => ctx.decodeAudioData(bytes) });
      void this.samples.preload();

      this.music = new Music(this.ctx, this.master, this.musicLevel);
      // Une partie rechargée en pleine nuit : la nuit est déjà là, sans rampe.
      this.music.setState(musicState(this.mood), 0);
      this.music.setDucked(this.paused);
      this.syncTension(DUSK_RAMP_S);
    }

    if (this.hidden) return;
    if (this.ctx.state !== 'running') void this.ctx.resume();
    if (this.musicFlag) this.music?.start();
  }

  /** L'onglet passe en arrière-plan ou en revient : tout se suspend, puis reprend où il en était. */
  public setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  public toggleMusic(): boolean {
    this.musicFlag = !this.musicFlag;
    writeFlag(MUSIC_KEY, this.musicFlag);
    if (this.musicFlag) this.music?.start();
    else this.music?.stop();
    this.syncTension(DUSK_RAMP_S);
    return this.musicFlag;
  }

  /** Le volume de la musique, de 0 à 1, gardé pour la prochaine partie. */
  public setMusicVolume(volume: number): void {
    this.musicLevel = clampLevel(volume);
    writeValue(MUSIC_VOLUME_KEY, String(this.musicLevel));
    this.music?.setVolume(this.musicLevel);
  }

  /** Le volume des bruitages, de 0 à 1, gardé pour la prochaine partie. */
  public setSfxVolume(volume: number): void {
    this.sfxLevel = clampLevel(volume);
    writeValue(SFX_VOLUME_KEY, String(this.sfxLevel));
    if (this.sfx && this.ctx) this.sfx.gain.setTargetAtTime(SFX_GAIN * this.sfxLevel, this.ctx.currentTime, 0.02);
  }

  /** Le jeu se met en pause ou reprend : la musique recule, puis revient. */
  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.music?.setDucked(paused || this.mourning);
  }

  /** Un habitant est mort : la musique baisse 2 s, puis une note grave. Plusieurs morts rapprochées ne le font qu'une fois. */
  public mourn(): void {
    if (!this.ctx || this.mutedFlag || this.ctx.state !== 'running') return;

    const now = performance.now();

    if (now - this.mournedAt < MOURN_COOLDOWN_MS) return;
    this.mournedAt = now;
    this.mourning = true;
    this.music?.setDucked(true);
    window.setTimeout(() => {
      this.mourning = false;
      this.music?.setDucked(this.paused);
      this.play('toll');
    }, MOURN_MS);
  }

  /** `pitch` : un facteur de vitesse de lecture (1 = la hauteur de l'échantillon) ; la synthèse de repli l'ignore. */
  public play(name: SoundName, pitch = 1): void {
    if (!this.ctx || !this.sfx || this.mutedFlag || this.ctx.state !== 'running') return;

    const now = performance.now();
    const last = this.lastPlayed.get(name) ?? -Infinity;

    if (now - last < DEDUPE_MS) return;
    this.lastPlayed.set(name, now);

    this.emit(name, this.sfx, pitch);
  }

  /** Un habitant qu'on tape répond : sa voix coupe celle d'avant. */
  public speak(name: VoiceName): void {
    if (!this.ctx || !this.sfx || this.mutedFlag || this.ctx.state !== 'running') return;

    this.voice?.gain.setTargetAtTime(0, this.ctx.currentTime, VOICE_CUT_S);
    this.voice = this.ctx.createGain();
    this.voice.connect(this.sfx);
    this.emit(name, this.voice);
  }

  /** L'échantillon du son vers `out`, ou sa synthèse s'il n'est pas décodé. */
  private emit(name: SoundName, out: AudioNode, pitch = 1): void {
    if (!this.ctx) return;

    const sample = this.samples?.pick(name);

    if (sample) this.playSample(sample, out, pitch);
    else SOUNDS[name](this.ctx, out, this.ctx.currentTime);
  }

  private playSample({ buffer, gain, rate }: PickedSample, out: AudioNode, pitch = 1): void {
    if (!this.ctx) return;

    const source = this.ctx.createBufferSource();
    const level = this.ctx.createGain();

    source.buffer = buffer;
    source.playbackRate.value = rate * pitch;
    level.gain.value = gain;
    source.connect(level).connect(out);
    source.start(this.ctx.currentTime);
  }

  /**
   * Un moment de la nuit : crépuscule, vague, vague repoussée, aube. Le
   * morceau suit (jour, nuit, combat), en fondu ; un moment qui ne change
   * pas de morceau ne relance rien.
   */
  public setDanger(danger: number): void {
    this.danger = danger;
  }

  public night(moment: NightMoment): void {
    const wasNight = this.mood.night;

    this.mood = nightMood(this.mood, moment, this.ctx?.currentTime ?? 0);

    const state = musicState(this.mood);

    this.music?.setState(state, MUSIC_FADE_S[state]);
    if (this.mood.night !== wasNight) this.syncTension(this.mood.night ? DUSK_RAMP_S : TENSION_FADE_S);
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.mutedFlag);
    return this.mutedFlag;
  }

  public setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    writeFlag(MUTE_KEY, muted);

    if (this.master && this.ctx) {
      // Une rampe courte : couper net fait claquer les haut-parleurs.
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
    this.syncTension(muted ? TENSION_FADE_S : DUSK_RAMP_S);
  }

  /** Crée la couche de tension s'il fait nuit, le son activé et la musique coupée ; l'éteint sinon. */
  private syncTension(fadeS: number): void {
    const wanted = this.mood.night && !this.mutedFlag && !this.musicFlag && this.ctx !== null && this.master !== null;

    if (wanted && !this.tension && this.ctx && this.master) {
      this.tension = new NightLayer(this.ctx, this.master, (now) => nightLevels(this.mood, now, this.danger));
      this.tension.start(fadeS);
    } else if (!wanted && this.tension) {
      this.tension.stop(fadeS);
      this.tension = null;
    }
  }

  public destroy(): void {
    this.music?.stop();
    this.tension?.stop(0);
    this.tension = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);

    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  writeValue(key, String(value));
}

/** Un volume gardé, de 0 à 1 ; plein volume s'il n'y en a pas, ou s'il est illisible. */
function readLevel(key: string): number {
  try {
    const value = window.localStorage.getItem(key);
    const level = value === null ? NaN : Number(value);

    return Number.isFinite(level) ? clampLevel(level) : 1;
  } catch {
    return 1;
  }
}

function clampLevel(volume: number): number {
  return Math.min(1, Math.max(0, volume));
}

function writeValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Mode privé ou stockage plein : le réglage ne survit pas, tant pis.
  }
}
