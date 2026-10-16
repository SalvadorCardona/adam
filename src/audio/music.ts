/**
 * Musique de fond : trois boucles servies depuis `public/audio/music/`.
 *
 * - le jour, le thème orchestral mélancolique (violoncelle, harpe, cordes) ;
 * - la nuit calme, dès le crépuscule : cordes en sourdine, violoncelle seul,
 *   harpe, dans la relative mineure du thème du jour ;
 * - le combat, tant que des mutants sont dehors : la même nuit jouée par
 *   l'orchestre entier — ostinato des violoncelles et contrebasses, cordes
 *   en trémolo, timbales, cuivres graves, la même harpe.
 *
 * Nuit et combat sont composés ensemble (`src/tools/music.ts`) : même tempo,
 * même grille, même longueur. Le combat part calé sur la position de la
 * nuit, si bien que passer de l'une à l'autre sonne comme une couche qui
 * s'ajoute ou se retire. Chaque changement de morceau est un fondu enchaîné
 * (`MUSIC_FADE_S`), jamais une coupure ; demander le morceau qui joue déjà
 * ne fait rien. Une boucle partie continue de tourner, muette, quand on en
 * change : elle reprend sans redémarrer.
 *
 * Deux encodages par boucle : Ogg Vorbis d'abord, AAC (`.m4a`) pour
 * Safari, qui ne décode pas toujours le Vorbis. `trackUrls()` met en tête
 * celui que le navigateur annonce savoir lire ; si le décodage échoue
 * quand même, on passe au suivant.
 *
 * Le thème du jour est demandé dès le chargement de la page
 * (`prefetchMusic`), sans attendre : l'écran titre ne l'attend pas. La nuit
 * et le combat ne sont téléchargés qu'à la première tombée de la nuit. En
 * attendant qu'ils arrivent, le thème du jour passe derrière un passe-bas et
 * baisse (« de l'autre côté du mur ») ; dès qu'ils sont décodés, le fondu
 * part vers eux.
 *
 * La boucle passe par un `AudioBufferSourceNode` (`loop = true`), pas par un
 * `<audio loop>` qui laisse un blanc au raccord selon les navigateurs.
 *
 * Le volume (réglage du joueur) et la pause (`setDucked`) agissent sur un
 * seul gain de sortie, sous tous les morceaux.
 *
 * Si le chargement ou le décodage échoue, le jeu continue sans ce morceau :
 * les bruitages suffisent, une erreur à l'écran n'aiderait personne.
 */

import { MUSIC_DAY, MUSIC_NIGHT, type MusicState } from './nightMood.ts';

const BASE = `${import.meta.env.BASE_URL}audio/music/`;
const OGG = 'audio/ogg; codecs="vorbis"';
const AAC = 'audio/mp4; codecs="mp4a.40.2"';

/**
 * Chaque morceau : ses deux encodages, sa durée exacte et son niveau.
 *
 * La durée exacte compte : la fin est déjà fondue dans le début, mais le
 * Vorbis décodé compte quelques échantillons de plus, et un décodeur AAC
 * peut ajouter son rembourrage — boucler sur la longueur du buffer ferait
 * entendre ce petit trou à chaque tour. Le thème du jour fait 4 811 751
 * échantillons à 44,1 kHz, nuit et combat 2 565 818 (16 mesures à 66 BPM).
 *
 * Les niveaux égalisent les morceaux à l'oreille, sous les bruitages : le
 * thème du jour (−11,3 LUFS) est mixé plus fort que la nuit (−17,3) et le
 * combat (−15,6) ; une fois baissés, les trois tournent autour de −17 LUFS.
 */
const SONGS: Record<MusicState, { readonly file: string; readonly loopEndS: number; readonly level: number }> = {
  day: { file: 'adam-melancolique-loop', loopEndS: 4_811_751 / 44_100, level: MUSIC_DAY.volume },
  night: { file: 'adam-night-loop', loopEndS: 2_565_818 / 44_100, level: 1 },
  combat: { file: 'adam-combat-loop', loopEndS: 2_565_818 / 44_100, level: 0.85 },
};

const MUSIC_STATES = ['day', 'night', 'combat'] as const satisfies readonly MusicState[];

/** Pause : la musique ne s'arrête pas, elle recule — à ce niveau, en une demi-seconde. */
const DUCKED = 0.3;
const DUCK_S = 0.5;

const FADE_IN_S = 1;
const FADE_OUT_S = 0.3;

/** Les encodages d'un morceau à essayer, celui que le navigateur dit savoir lire d'abord. */
function trackUrls(file: string): string[] {
  const tracks = [
    { url: `${BASE}${file}.ogg`, type: OGG },
    { url: `${BASE}${file}.m4a`, type: AAC },
  ];
  const probe = typeof document === 'undefined' ? null : document.createElement('audio');
  const playable = tracks.filter((track) => probe?.canPlayType(track.type) !== '');

  return [...playable, ...tracks.filter((track) => !playable.includes(track))].map((track) => track.url);
}

/**
 * Le morceau qu'on entendra vraiment : celui qu'on demande s'il est prêt,
 * sinon le plus proche qui l'est — le combat retombe sur la nuit, la nuit
 * sur le jour (passé derrière le mur). `null` si rien n'est prêt.
 */
export function playableState(wanted: MusicState, ready: (state: MusicState) => boolean): MusicState | null {
  const fallbacks: Record<MusicState, readonly MusicState[]> = {
    day: ['day'],
    night: ['night', 'day'],
    combat: ['combat', 'night', 'day'],
  };

  return fallbacks[wanted].find(ready) ?? null;
}

/** Les octets du thème du jour, demandés une seule fois. */
let prefetched: Promise<ArrayBuffer | null> | null = null;

function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  return fetch(url)
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null);
}

/** Lance le téléchargement du thème du jour en tâche de fond, sans rien attendre. */
export function prefetchMusic(): void {
  const [first] = trackUrls(SONGS.day.file);

  if (first) prefetched ??= fetchBytes(first);
}

/** Un morceau : son buffer une fois décodé, son niveau (fondu), sa lecture en cours. */
interface Song {
  buffer: AudioBuffer | null;
  loading: Promise<AudioBuffer | null> | null;
  readonly level: GainNode;
  /** La lecture en cours et l'instant (horloge du contexte) où la boucle a commencé ; `null` quand rien ne joue. */
  voice: { source: AudioBufferSourceNode; startedAt: number } | null;
}

export class Music {
  private readonly ctx: AudioContext;
  /** Volume du joueur × pause : sous tous les morceaux. */
  private readonly out: GainNode;
  /** Le passe-bas du thème du jour, fermé tant qu'il remplace la nuit qui n'est pas encore là. */
  private readonly filter: BiquadFilterNode;
  private readonly songs: Record<MusicState, Song>;
  /** Le morceau demandé par le jeu. */
  private state: MusicState = 'day';
  /**
   * Le dernier mélange posé — le morceau qu'on entend et s'il fait nuit —,
   * `null` avant le premier : un mélange identique ne repose aucune rampe.
   */
  private mixed: string | null = null;
  /** Vrai entre `start()` et `stop()` : un chargement ne joue que si on la veut encore. */
  private wanted = false;
  private volume = 1;
  private ducked = false;

  public constructor(ctx: AudioContext, destination: AudioNode, volume: number) {
    this.ctx = ctx;
    this.volume = volume;
    this.out = ctx.createGain();
    this.out.gain.value = volume;
    this.out.connect(destination);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = MUSIC_DAY.cutoff;
    this.filter.connect(this.out);

    const song = (input: AudioNode): Song => {
      const level = ctx.createGain();

      level.gain.value = 0;
      level.connect(input);
      return { buffer: null, loading: null, level, voice: null };
    };

    this.songs = { day: song(this.filter), night: song(this.out), combat: song(this.out) };
  }

  /** Le volume du joueur, de 0 à 1. */
  public setVolume(volume: number): void {
    this.volume = volume;
    this.applyOut();
  }

  /** En pause, la musique recule sans s'arrêter ; elle revient à la reprise. */
  public setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.applyOut();
  }

  /**
   * Le jeu demande un morceau : fondu enchaîné sur `fadeS` secondes. Le
   * même morceau qu'avant ne fait rien — pas de redémarrage. La première
   * nuit fait télécharger la nuit et le combat.
   */
  public setState(state: MusicState, fadeS: number): void {
    if (state === this.state) return;
    this.state = state;
    if (!this.wanted) return;
    if (state !== 'day') {
      this.load('night');
      this.load('combat');
    }
    this.mix(fadeS);
  }

  public start(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.load('day');
    if (this.state !== 'day') {
      this.load('night');
      this.load('combat');
    }
    this.mixed = null;
    this.mix(FADE_IN_S);
  }

  public stop(): void {
    this.wanted = false;
    this.mixed = null;

    const now = this.ctx.currentTime;

    // Un fondu court plutôt qu'un arrêt net, qui claquerait.
    for (const song of Object.values(this.songs)) {
      ramp(song.level.gain, 0, now, FADE_OUT_S);
      song.voice?.source.stop(now + FADE_OUT_S);
      song.voice = null;
    }
  }

  private applyOut(): void {
    const now = this.ctx.currentTime;

    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(this.volume * (this.ducked ? DUCKED : 1), now, DUCK_S / 3);
  }

  /**
   * Monte le morceau qu'on peut entendre, éteint les autres. Le passe-bas du
   * jour se ferme dès qu'il ne fait plus jour : sur le thème qui s'efface,
   * ou sur celui qui tient la place d'une nuit pas encore arrivée.
   */
  private mix(fadeS: number): void {
    const heard = playableState(this.state, (state) => this.songs[state].buffer !== null);
    const night = this.state !== 'day';
    const mixed = `${heard}:${night}`;

    if (mixed === this.mixed) return;
    this.mixed = mixed;

    const now = this.ctx.currentTime;

    ramp(this.filter.frequency, night ? MUSIC_NIGHT.cutoff : MUSIC_DAY.cutoff, now, fadeS);

    for (const state of MUSIC_STATES) {
      const song = this.songs[state];
      const level = state === 'day' && night ? MUSIC_NIGHT.volume : SONGS[state].level;

      if (state === heard && !song.voice && song.buffer) this.play(state, song.buffer);
      ramp(song.level.gain, state === heard ? level : 0, now, fadeS);
    }
  }

  private play(state: MusicState, buffer: AudioBuffer): void {
    const song = this.songs[state];
    const source = this.ctx.createBufferSource();
    const loopEnd = Math.min(SONGS[state].loopEndS, buffer.duration);
    const now = this.ctx.currentTime;
    // Nuit et combat ont la même mesure : celui qui part se cale sur l'autre.
    const partner = state === 'night' ? this.songs.combat.voice : state === 'combat' ? this.songs.night.voice : null;
    const offset = partner ? (now - partner.startedAt) % loopEnd : 0;

    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = loopEnd;
    source.connect(song.level);
    source.start(now, offset);
    song.voice = { source, startedAt: now - offset };
  }

  /** Charge un morceau une seule fois ; à son arrivée, le mélange se refait si on l'attendait. */
  private load(state: MusicState): void {
    const song = this.songs[state];

    if (song.buffer || song.loading) return;
    song.loading = this.decode(state).then((buffer) => {
      song.buffer = buffer;
      // Pas de musique, pas d'erreur : un prochain `start()` retentera.
      if (!buffer) song.loading = null;
      else if (this.wanted) this.mix(state === 'day' ? FADE_IN_S : Math.max(FADE_IN_S, 2));
      return buffer;
    });
  }

  private async decode(state: MusicState): Promise<AudioBuffer | null> {
    if (state === 'day') prefetchMusic();

    for (const [index, url] of trackUrls(SONGS[state].file).entries()) {
      // Le premier encodage du jour a déjà été demandé ; le préchargement ne
      // sert qu'une fois, un nouvel essai refait la requête.
      const early = state === 'day' && index === 0 ? prefetched : null;
      const bytes = early ? await early : await fetchBytes(url);

      if (early) prefetched = null;
      if (!bytes) continue;

      try {
        return await this.ctx.decodeAudioData(bytes);
      } catch {
        // Encodage annoncé mais pas décodé : le suivant.
      }
    }

    return null;
  }
}

/**
 * Une rampe linéaire depuis la valeur courante : jamais de saut, même si un
 * fondu précédent est encore en cours (une vague repoussée en pleine montée
 * du combat). `cancelAndHoldAtTime` fige la valeur interpolée ; Firefox ne
 * l'a pas, et retombe sur la valeur lue.
 */
function ramp(param: AudioParam, value: number, now: number, durationS: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(now);
  } else {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
  }
  param.linearRampToValueAtTime(value, now + Math.max(durationS, 0.01));
}
