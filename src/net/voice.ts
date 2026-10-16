/**
 * Le vocal : parler à son ami pendant la partie, de navigateur à navigateur
 * (WebRTC). Le son ne passe jamais par notre serveur : il ne relaie que la
 * **signalisation** (offre, réponse, candidats ICE), sur le WebSocket de la
 * partie (`ClientMessage` / `ServerMessage` de type `voice`), aux membres de
 * la même salle. Rien ici ne touche à la simulation ni au lockstep.
 *
 * Les états d'un joueur :
 *
 * - `off` : hors du vocal — le défaut. Le micro n'est demandé qu'à
 *   `join()`, jamais avant, jamais en solo (ce module n'existe que branché
 *   sur une session à deux) ;
 * - `joining` : on attend l'autorisation du micro ;
 * - `on` : dans le vocal, micro ouvert ou coupé (`muted`).
 *
 * Maillage simple, sans autorité : chacun se connecte à chaque autre membre
 * du vocal. Un arrivant dit `join` à la salle ; ceux qui y sont répondent
 * `here` à lui seul ; des deux côtés on connaît alors l'autre, et c'est
 * l'id de compte **le plus petit** qui envoie l'offre — pas de collision
 * d'offres possible.
 *
 * Le navigateur est derrière `VoiceEnv` (`voiceBrowser.ts`) : ce module-ci
 * est pur, et les tests le branchent sur des faux.
 */

/** Ce que l'on se dit pour s'organiser, dans `data` d'un message `voice`. */
export type VoiceSignal =
  /** Un arrivant : le vocal le sait, et lui répond `here`. */
  | { readonly k: 'join'; readonly muted: boolean }
  | { readonly k: 'here'; readonly muted: boolean }
  | { readonly k: 'leave' }
  | { readonly k: 'offer'; readonly sdp: string }
  | { readonly k: 'answer'; readonly sdp: string }
  | { readonly k: 'ice'; readonly candidate: unknown }
  | { readonly k: 'mute'; readonly muted: boolean };

/** Un message reçu du serveur, s'il a la forme d'un signal ; `null` sinon. */
export function parseVoiceSignal(data: unknown): VoiceSignal | null {
  if (typeof data !== 'object' || data === null) return null;

  const signal = data as Record<string, unknown>;

  switch (signal['k']) {
    case 'join':
    case 'here':
    case 'mute':
      return typeof signal['muted'] === 'boolean' ? (data as VoiceSignal) : null;
    case 'leave':
      return data as VoiceSignal;
    case 'offer':
    case 'answer':
      return typeof signal['sdp'] === 'string' ? (data as VoiceSignal) : null;
    case 'ice':
      return typeof signal['candidate'] === 'object' && signal['candidate'] !== null ? (data as VoiceSignal) : null;
    default:
      return null;
  }
}

export const VOICE = {
  /** Au-dessus de ce niveau (de 0 à 1, valeur efficace de l’onde), quelqu’un parle. */
  speakingLevel: 0.04,
  /** Un indicateur reste allumé ce temps après la dernière crête : il ne clignote pas entre deux mots. */
  holdMs: 300,
  /** On mesure le son dix fois par seconde. */
  pollMs: 100,
  /** Le volume des autres au départ, et sa plage. */
  defaultVolume: 1,
} as const;

/** Pourquoi le vocal ne démarre pas, ou ne tient pas avec quelqu'un. */
export type VoiceProblem =
  /** Le navigateur ne sait pas (pas de WebRTC, ou page non sécurisée). */
  | { readonly kind: 'unsupported' }
  /** L'autorisation du micro est refusée. */
  | { readonly kind: 'denied' }
  /** Aucun micro n'est branché. */
  | { readonly kind: 'noMic' }
  /** Le micro est là mais ne s'ouvre pas (pris par une autre application, panne…). */
  | { readonly kind: 'micFailed' }
  /** La connexion avec ce joueur n'a pas pu s'établir : réseau, pare-feu… */
  | { readonly kind: 'peer'; readonly nickname: string };

/** L'erreur d'un `getUserMedia`, ramenée à ce que le joueur doit savoir. */
export function micProblem(error: unknown): VoiceProblem {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';

  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return { kind: 'denied' };
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return { kind: 'noMic' };

  return { kind: 'micFailed' };
}

/* ------------------------------------------------------------ le navigateur */

/** Le micro ouvert. */
export interface VoiceMic {
  /** Le micro laisse passer le son, ou non (coupé : rien ne part, la connexion reste). */
  setEnabled(enabled: boolean): void;
  /** Le niveau sonore en cours, de 0 à 1. */
  level(): number;
  stop(): void;
}

/** Le son d'un autre joueur, tel qu'il arrive. */
export interface VoicePlayback {
  setVolume(volume: number): void;
  level(): number;
  stop(): void;
}

export type LinkState = 'connecting' | 'connected' | 'failed';

/** Une connexion directe avec un autre joueur (une `RTCPeerConnection`). */
export interface VoiceLink {
  /** Prépare une offre et la donne (SDP). */
  offer(): Promise<string>;
  /** Reçoit une offre et rend la réponse. */
  accept(offer: string): Promise<string>;
  receiveAnswer(answer: string): Promise<void>;
  addCandidate(candidate: unknown): Promise<void>;
  onCandidate: ((candidate: unknown) => void) | null;
  /** Le flux de l'autre joueur est arrivé. */
  onStream: ((stream: unknown) => void) | null;
  onState: ((state: LinkState) => void) | null;
  close(): void;
}

/** Tout ce que le vocal demande au navigateur. */
export interface VoiceEnv {
  readonly supported: boolean;
  openMic(): Promise<VoiceMic>;
  createLink(mic: VoiceMic): VoiceLink;
  playback(stream: unknown): VoicePlayback;
  /** Appelle `run` toutes les `ms` ; rend de quoi l'arrêter. */
  every(run: () => void, ms: number): () => void;
  now(): number;
}

/* --------------------------------------------------------------- le vocal */

export type VoiceStatus = 'off' | 'joining' | 'on';

/** Un autre joueur dans le vocal. */
export interface VoicePeer {
  readonly id: number;
  readonly nickname: string;
  readonly state: LinkState;
  /** Il a coupé son micro. */
  readonly muted: boolean;
  /** Son niveau dépasse le seuil : son pseudo s'allume. */
  readonly speaking: boolean;
}

/** Ce que l'interface lit : une photo, remplacée à chaque changement. */
export interface VoiceView {
  readonly status: VoiceStatus;
  readonly muted: boolean;
  /** Je parle (micro ouvert et niveau au-dessus du seuil). */
  readonly speaking: boolean;
  readonly volume: number;
  readonly peers: readonly VoicePeer[];
}

interface Member {
  id: number;
  nickname: string;
  muted: boolean;
  state: LinkState;
  speaking: boolean;
  /** Le dernier instant où son niveau dépassait le seuil. */
  loudAt: number;
  link: VoiceLink | null;
  playback: VoicePlayback | null;
}

export class VoiceChat {
  private readonly selfId: number;
  private readonly env: VoiceEnv;
  private readonly signal: (data: VoiceSignal, to?: number) => void;
  private readonly listeners = new Set<(view: VoiceView) => void>();
  private readonly problems = new Set<(problem: VoiceProblem) => void>();
  private readonly members = new Map<number, Member>();
  private mic: VoiceMic | null = null;
  private status: VoiceStatus = 'off';
  private muted = false;
  private speaking = false;
  private loudAt = Number.NEGATIVE_INFINITY;
  private volume: number = VOICE.defaultVolume;
  private stopPolling: (() => void) | null = null;
  /** Chaque `join()` a son numéro : un `leave()` pendant l'attente du micro annule le `join` en cours. */
  private attempt = 0;
  private current: VoiceView;

  /** `signal` : envoie un signal à tous les autres membres de la salle, ou à `to` seulement. */
  public constructor(selfId: number, env: VoiceEnv, signal: (data: VoiceSignal, to?: number) => void) {
    this.selfId = selfId;
    this.env = env;
    this.signal = signal;
    this.current = this.build();
  }

  public get view(): VoiceView {
    return this.current;
  }

  /** Le vocal existe-t-il dans ce navigateur ? Sinon le bouton le dit au clic. */
  public get supported(): boolean {
    return this.env.supported;
  }

  /** `listener` reçoit la photo à chaque changement ; rend de quoi se désabonner. */
  public subscribe(listener: (view: VoiceView) => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  /** `listener` reçoit chaque problème (micro refusé, connexion impossible avec…). */
  public onProblem(listener: (problem: VoiceProblem) => void): () => void {
    this.problems.add(listener);

    return () => this.problems.delete(listener);
  }

  /** Rejoint le vocal : c'est ici, et seulement ici, que le micro est demandé. */
  public async join(): Promise<void> {
    if (this.status !== 'off') return;
    if (!this.env.supported) {
      this.problem({ kind: 'unsupported' });
      return;
    }
    this.attempt += 1;

    const attempt = this.attempt;

    this.status = 'joining';
    this.emit();

    let mic: VoiceMic;

    try {
      mic = await this.env.openMic();
    } catch (error) {
      if (attempt !== this.attempt) return;
      this.status = 'off';
      this.emit();
      this.problem(micProblem(error));
      return;
    }
    // On a quitté pendant l'attente de l'autorisation : le micro qui arrive s'éteint aussitôt.
    if (attempt !== this.attempt) {
      mic.stop();
      return;
    }
    this.mic = mic;
    this.muted = false;
    this.status = 'on';
    this.stopPolling = this.env.every(() => this.poll(), VOICE.pollMs);
    this.signal({ k: 'join', muted: false });
    this.emit();
  }

  /** Quitte le vocal : plus de micro, plus de son, et les autres le savent. */
  public leave(): void {
    if (this.status === 'off') return;
    if (this.status === 'on') this.signal({ k: 'leave' });
    this.shutdown();
  }

  /** Coupe ou rouvre le micro ; sans effet hors du vocal. */
  public setMuted(muted: boolean): void {
    if (this.status !== 'on' || this.muted === muted) return;
    this.muted = muted;
    this.mic?.setEnabled(!muted);
    if (muted) this.speaking = false;
    this.signal({ k: 'mute', muted });
    this.emit();
  }

  public toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  /** Le volume des autres joueurs, de 0 à 1. */
  public setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : VOICE.defaultVolume));
    for (const member of this.members.values()) member.playback?.setVolume(this.volume);
    this.emit();
  }

  /** Un autre joueur a quitté la partie (sa connexion à la salle est tombée) : sa liaison vocale aussi. */
  public peerGone(id: number): void {
    if (this.drop(id)) this.emit();
  }

  /** Plus personne : l'hôte est parti, ou la connexion à la salle est perdue. */
  public allGone(): void {
    if (this.members.size === 0) return;
    for (const id of [...this.members.keys()]) this.drop(id);
    this.emit();
  }

  /** La partie se ferme : le vocal aussi, sans rien envoyer. */
  public close(): void {
    this.shutdown();
  }

  /** Un signal de `from` est arrivé par la salle. */
  public receive(from: number, nickname: string, data: unknown): void {
    const message = parseVoiceSignal(data);

    if (this.status !== 'on' || !message || from === this.selfId) return;

    switch (message.k) {
      case 'join':
        // Il arrive (ou revient) : une ancienne liaison avec lui est périmée.
        this.drop(from);
        this.signal({ k: 'here', muted: this.muted }, from);
        this.meet(from, nickname, message.muted);
        break;
      case 'here':
        this.meet(from, nickname, message.muted);
        break;
      case 'leave':
        this.drop(from);
        break;
      case 'mute': {
        const member = this.members.get(from);

        if (member) {
          member.muted = message.muted;
          if (message.muted) member.speaking = false;
        }
        break;
      }
      case 'offer':
        void this.answer(from, nickname, message.sdp);
        return;
      case 'answer':
        void this.members.get(from)?.link?.receiveAnswer(message.sdp).catch(() => this.fail(from));
        return;
      case 'ice':
        void this.members.get(from)?.link?.addCandidate(message.candidate).catch(() => undefined);
        return;
    }
    this.emit();
  }

  /* ------------------------------------------------------------- privé */

  /** On connaît cet autre joueur du vocal : le plus petit id lance l'offre. */
  private meet(id: number, nickname: string, muted: boolean): void {
    const member = this.member(id, nickname);

    member.muted = muted;
    if (this.selfId < id && !member.link) void this.offerTo(member);
  }

  private member(id: number, nickname: string): Member {
    let member = this.members.get(id);

    if (!member) {
      member = { id, nickname, muted: false, state: 'connecting', speaking: false, loudAt: Number.NEGATIVE_INFINITY, link: null, playback: null };
      this.members.set(id, member);
    }

    return member;
  }

  private open(member: Member): VoiceLink | null {
    if (!this.mic) return null;

    const link = this.env.createLink(this.mic);

    link.onCandidate = (candidate) => {
      if (member.link === link) this.signal({ k: 'ice', candidate }, member.id);
    };
    link.onStream = (stream) => {
      if (member.link !== link) return;
      member.playback?.stop();
      member.playback = this.env.playback(stream);
      member.playback.setVolume(this.volume);
    };
    link.onState = (state) => {
      if (member.link !== link || member.state === state) return;
      member.state = state;
      if (state === 'failed') this.fail(member.id);
      else this.emit();
    };
    member.link = link;

    return link;
  }

  private async offerTo(member: Member): Promise<void> {
    const link = this.open(member);

    if (!link) return;
    try {
      this.signal({ k: 'offer', sdp: await link.offer() }, member.id);
    } catch {
      this.fail(member.id);
    }
  }

  private async answer(from: number, nickname: string, sdp: string): Promise<void> {
    const member = this.member(from, nickname);

    // Une nouvelle offre remplace la liaison précédente avec lui.
    member.link?.close();
    member.link = null;

    const link = this.open(member);

    if (!link) return;
    try {
      this.signal({ k: 'answer', sdp: await link.accept(sdp) }, from);
    } catch {
      this.fail(from);
    }
    this.emit();
  }

  /** La liaison avec ce joueur est tombée : on le dit, il reste listé (en échec) jusqu'à son départ. */
  private fail(id: number): void {
    const member = this.members.get(id);

    if (!member || this.status !== 'on') return;
    member.state = 'failed';
    member.speaking = false;
    member.link?.close();
    member.link = null;
    member.playback?.stop();
    member.playback = null;
    this.problem({ kind: 'peer', nickname: member.nickname });
    this.emit();
  }

  private drop(id: number): boolean {
    const member = this.members.get(id);

    if (!member) return false;
    member.link?.close();
    member.playback?.stop();
    this.members.delete(id);

    return true;
  }

  private shutdown(): void {
    this.attempt += 1;
    this.stopPolling?.();
    this.stopPolling = null;
    for (const id of [...this.members.keys()]) this.drop(id);
    this.mic?.stop();
    this.mic = null;
    this.status = 'off';
    this.muted = false;
    this.speaking = false;
    this.emit();
  }

  /** Mesure les niveaux et allume (ou éteint) les indicateurs. */
  private poll(): void {
    const now = this.env.now();
    let changed = false;

    const mine = !this.muted && (this.mic?.level() ?? 0) > VOICE.speakingLevel;

    if (mine) this.loudAt = now;

    const speaking = !this.muted && now - this.loudAt <= VOICE.holdMs;

    if (speaking !== this.speaking) {
      this.speaking = speaking;
      changed = true;
    }
    for (const member of this.members.values()) {
      if (member.playback && !member.muted && member.playback.level() > VOICE.speakingLevel) member.loudAt = now;

      const heard = !member.muted && member.state === 'connected' && now - member.loudAt <= VOICE.holdMs;

      if (heard !== member.speaking) {
        member.speaking = heard;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  private problem(problem: VoiceProblem): void {
    for (const listener of this.problems) listener(problem);
  }

  private build(): VoiceView {
    return {
      status: this.status,
      muted: this.muted,
      speaking: this.speaking,
      volume: this.volume,
      peers: [...this.members.values()].map(({ id, nickname, state, muted, speaking }) => ({ id, nickname, state, muted, speaking })),
    };
  }

  private emit(): void {
    this.current = this.build();
    for (const listener of this.listeners) listener(this.current);
  }
}
