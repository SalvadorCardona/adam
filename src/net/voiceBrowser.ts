/**
 * Le vocal, côté navigateur : `getUserMedia` (écho, bruit et gain réglés par
 * le navigateur), `RTCPeerConnection`, et un `AnalyserNode` par flux pour
 * savoir qui parle. Tout ce que `voice.ts` demande à `VoiceEnv`, rien de plus.
 * Hors du solo : ce module n'est chargé que pour une partie à deux.
 */

import { iceServers } from './iceServers.ts';
import type { LinkState, VoiceEnv, VoiceLink, VoiceMic, VoicePlayback } from './voice.ts';

/** Les réglages du micro : annulation d'écho, réduction de bruit et contrôle automatique du gain. */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: false,
};

/** Le niveau sonore (valeur efficace, de 0 à 1) d'un flux, mesuré sans le jouer. */
class Meter {
  private readonly source: MediaStreamAudioSourceNode;
  private readonly analyser: AnalyserNode;
  private readonly samples: Float32Array<ArrayBuffer>;

  public constructor(context: AudioContext, stream: MediaStream) {
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 512;
    this.samples = new Float32Array(this.analyser.fftSize);
    this.source = context.createMediaStreamSource(stream);
    // Branché à l'analyseur seulement : la sortie, c'est l'élément audio.
    this.source.connect(this.analyser);
  }

  public level(): number {
    this.analyser.getFloatTimeDomainData(this.samples);

    let sum = 0;

    for (const sample of this.samples) sum += sample * sample;

    return Math.sqrt(sum / this.samples.length);
  }

  public stop(): void {
    this.source.disconnect();
  }
}

/** Les états d'une `RTCPeerConnection`, ramenés aux trois du vocal. */
function linkState(state: RTCPeerConnectionState): LinkState | null {
  if (state === 'connected') return 'connected';
  if (state === 'failed') return 'failed';
  if (state === 'new' || state === 'connecting') return 'connecting';

  // `disconnected` se rétablit souvent seul ; `closed` est notre fait.
  return null;
}

class BrowserLink implements VoiceLink {
  public onCandidate: ((candidate: unknown) => void) | null = null;
  public onStream: ((stream: unknown) => void) | null = null;
  public onState: ((state: LinkState) => void) | null = null;

  private readonly connection: RTCPeerConnection;
  /** Des candidats arrivés avant l'offre ou la réponse attendent la description distante. */
  private pending: RTCIceCandidateInit[] = [];
  private remote = false;

  public constructor(stream: MediaStream) {
    this.connection = new RTCPeerConnection({ iceServers: iceServers(import.meta.env) as RTCIceServer[] });
    for (const track of stream.getAudioTracks()) this.connection.addTrack(track, stream);
    this.connection.onicecandidate = (event) => {
      if (event.candidate) this.onCandidate?.(event.candidate.toJSON());
    };
    this.connection.ontrack = (event) => {
      this.onStream?.(event.streams[0] ?? new MediaStream([event.track]));
    };
    this.connection.onconnectionstatechange = () => {
      const state = linkState(this.connection.connectionState);

      if (state) this.onState?.(state);
    };
  }

  public async offer(): Promise<string> {
    const offer = await this.connection.createOffer();

    await this.connection.setLocalDescription(offer);

    return this.connection.localDescription?.sdp ?? offer.sdp ?? '';
  }

  public async accept(offer: string): Promise<string> {
    await this.connection.setRemoteDescription({ type: 'offer', sdp: offer });
    await this.flush();

    const answer = await this.connection.createAnswer();

    await this.connection.setLocalDescription(answer);

    return this.connection.localDescription?.sdp ?? answer.sdp ?? '';
  }

  public async receiveAnswer(answer: string): Promise<void> {
    await this.connection.setRemoteDescription({ type: 'answer', sdp: answer });
    await this.flush();
  }

  public async addCandidate(candidate: unknown): Promise<void> {
    if (this.remote) await this.connection.addIceCandidate(candidate as RTCIceCandidateInit);
    else this.pending.push(candidate as RTCIceCandidateInit);
  }

  public close(): void {
    this.connection.onicecandidate = null;
    this.connection.ontrack = null;
    this.connection.onconnectionstatechange = null;
    this.connection.close();
  }

  private async flush(): Promise<void> {
    this.remote = true;

    const pending = this.pending;

    this.pending = [];
    for (const candidate of pending) await this.connection.addIceCandidate(candidate).catch(() => undefined);
  }
}

export class BrowserVoiceEnv implements VoiceEnv {
  private context: AudioContext | null = null;

  public get supported(): boolean {
    return (
      typeof RTCPeerConnection !== 'undefined' &&
      typeof AudioContext !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function'
    );
  }

  public async openMic(): Promise<VoiceMic> {
    const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    const context = this.audio();
    const meter = new Meter(context, stream);

    void context.resume().catch(() => undefined);

    const mic: VoiceMic = {
      setEnabled: (enabled) => {
        for (const track of stream.getAudioTracks()) track.enabled = enabled;
      },
      level: () => meter.level(),
      stop: () => {
        meter.stop();
        for (const track of stream.getTracks()) track.stop();
      },
    };

    streamOf.set(mic, stream);

    return mic;
  }

  public createLink(mic: VoiceMic): VoiceLink {
    return new BrowserLink(streamOf.get(mic) ?? new MediaStream());
  }

  public playback(stream: unknown): VoicePlayback {
    const media = stream as MediaStream;
    const element = new Audio();
    const meter = new Meter(this.audio(), media);

    element.srcObject = media;
    element.autoplay = true;
    void element.play().catch(() => undefined);

    return {
      setVolume: (volume) => {
        element.volume = Math.min(1, Math.max(0, volume));
      },
      level: () => meter.level(),
      stop: () => {
        meter.stop();
        element.pause();
        element.srcObject = null;
      },
    };
  }

  public every(run: () => void, ms: number): () => void {
    const timer = setInterval(run, ms);

    return () => clearInterval(timer);
  }

  public now(): number {
    return performance.now();
  }

  private audio(): AudioContext {
    this.context ??= new AudioContext();

    return this.context;
  }
}

/** Le flux de chaque micro ouvert, pour l'offrir à une liaison. */
const streamOf = new WeakMap<VoiceMic, MediaStream>();
