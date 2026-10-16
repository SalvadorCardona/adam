import { describe, expect, it } from 'vitest';
import {
  VOICE,
  VoiceChat,
  micProblem,
  parseVoiceSignal,
  type LinkState,
  type VoiceEnv,
  type VoiceLink,
  type VoiceMic,
  type VoicePlayback,
  type VoiceProblem,
  type VoiceSignal,
} from './voice.ts';

class FakeMic implements VoiceMic {
  public enabled = true;
  public stopped = false;
  public loud = 0;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public level(): number {
    return this.enabled ? this.loud : 0;
  }

  public stop(): void {
    this.stopped = true;
  }
}

class FakePlayback implements VoicePlayback {
  public volume = -1;
  public stopped = false;

  private readonly source: FakeLink;

  public constructor(source: FakeLink) {
    this.source = source;
  }

  public setVolume(volume: number): void {
    this.volume = volume;
  }

  public level(): number {
    return this.source.remoteLoud;
  }

  public stop(): void {
    this.stopped = true;
  }
}

class FakeLink implements VoiceLink {
  public onCandidate: ((candidate: unknown) => void) | null = null;
  public onStream: ((stream: unknown) => void) | null = null;
  public onState: ((state: LinkState) => void) | null = null;
  public closed = false;
  public offered = false;
  public accepted: string | null = null;
  public answered: string | null = null;
  public candidates: unknown[] = [];
  /** Le niveau du son de l'autre bout, tel que la mesure le verrait. */
  public remoteLoud = 0;
  public failOffer = false;

  public offer(): Promise<string> {
    if (this.failOffer) return Promise.reject(new Error('offre impossible'));
    this.offered = true;

    return Promise.resolve('offre');
  }

  public accept(offer: string): Promise<string> {
    this.accepted = offer;

    return Promise.resolve('réponse');
  }

  public receiveAnswer(answer: string): Promise<void> {
    this.answered = answer;

    return Promise.resolve();
  }

  public addCandidate(candidate: unknown): Promise<void> {
    this.candidates.push(candidate);

    return Promise.resolve();
  }

  public close(): void {
    this.closed = true;
  }
}

class FakeEnv implements VoiceEnv {
  public supported = true;
  public clock = 0;
  public mic = new FakeMic();
  public opened = 0;
  public deny: Error | null = null;
  public readonly links: FakeLink[] = [];
  public readonly playbacks: FakePlayback[] = [];
  private tick: (() => void) | null = null;
  private resolveMic: (() => void) | null = null;
  public holdMic = false;

  public openMic(): Promise<VoiceMic> {
    this.opened += 1;
    if (this.deny) return Promise.reject(this.deny);
    if (this.holdMic) return new Promise((resolve) => (this.resolveMic = () => resolve(this.mic)));

    return Promise.resolve(this.mic);
  }

  public releaseMic(): void {
    this.resolveMic?.();
  }

  public createLink(): VoiceLink {
    const link = new FakeLink();

    this.links.push(link);

    return link;
  }

  public playback(): VoicePlayback {
    const playback = new FakePlayback(this.links.at(-1)!);

    this.playbacks.push(playback);

    return playback;
  }

  public every(run: () => void): () => void {
    this.tick = run;

    return () => (this.tick = null);
  }

  public now(): number {
    return this.clock;
  }

  /** Avance l'horloge et laisse le vocal mesurer. */
  public advance(ms: number): void {
    this.clock += ms;
    this.tick?.();
  }

  public get polling(): boolean {
    return this.tick !== null;
  }
}

interface Sent {
  readonly data: VoiceSignal;
  readonly to?: number;
}

function player(id: number): { chat: VoiceChat; env: FakeEnv; sent: Sent[]; problems: VoiceProblem[] } {
  const env = new FakeEnv();
  const sent: Sent[] = [];
  const problems: VoiceProblem[] = [];
  const chat = new VoiceChat(id, env, (data, to) => sent.push({ data, ...(to !== undefined && { to }) }));

  chat.onProblem((problem) => problems.push(problem));

  return { chat, env, sent, problems };
}

/** Fait entendre à `to` ce que `from` a envoyé, comme le serveur le relaie (jamais à l'expéditeur). */
function deliver(from: { id: number; name: string; sent: Sent[] }, others: { id: number; chat: VoiceChat }[]): void {
  for (const message of from.sent.splice(0)) {
    for (const other of others) {
      if (other.id !== from.id && (message.to === undefined || message.to === other.id)) other.chat.receive(from.id, from.name, message.data);
    }
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('parseVoiceSignal', () => {
  it('reconnaît les signaux du vocal, et rien d’autre', () => {
    expect(parseVoiceSignal({ k: 'join', muted: false })).toEqual({ k: 'join', muted: false });
    expect(parseVoiceSignal({ k: 'leave' })).toEqual({ k: 'leave' });
    expect(parseVoiceSignal({ k: 'offer', sdp: 'v=0' })).toEqual({ k: 'offer', sdp: 'v=0' });
    expect(parseVoiceSignal({ k: 'ice', candidate: { candidate: 'x' } })).not.toBeNull();
    expect(parseVoiceSignal({ k: 'join' })).toBeNull();
    expect(parseVoiceSignal({ k: 'offer' })).toBeNull();
    expect(parseVoiceSignal({ k: 'ice', candidate: 3 })).toBeNull();
    expect(parseVoiceSignal({ k: 'autre' })).toBeNull();
    expect(parseVoiceSignal('join')).toBeNull();
    expect(parseVoiceSignal(null)).toBeNull();
  });
});

describe('micProblem', () => {
  it('ramène l’erreur du navigateur à ce que le joueur doit savoir', () => {
    expect(micProblem({ name: 'NotAllowedError' })).toEqual({ kind: 'denied' });
    expect(micProblem({ name: 'NotFoundError' })).toEqual({ kind: 'noMic' });
    expect(micProblem({ name: 'NotReadableError' })).toEqual({ kind: 'micFailed' });
    expect(micProblem(new Error('?'))).toEqual({ kind: 'micFailed' });
    expect(micProblem(undefined)).toEqual({ kind: 'micFailed' });
  });
});

describe('VoiceChat — rejoindre et quitter', () => {
  it('est hors du vocal au départ et ne demande jamais le micro avant join()', () => {
    const { chat, env, sent } = player(1);

    expect(chat.view.status).toBe('off');
    expect(env.opened).toBe(0);
    expect(sent).toEqual([]);
    chat.setMuted(true);
    chat.toggleMuted();
    expect(chat.view.muted).toBe(false);
    expect(sent).toEqual([]);
  });

  it('demande le micro au join, passe par « joining », puis annonce son arrivée', async () => {
    const { chat, env, sent } = player(1);
    const seen: string[] = [];

    chat.subscribe((view) => seen.push(view.status));
    env.holdMic = true;

    const joining = chat.join();

    expect(chat.view.status).toBe('joining');
    expect(env.opened).toBe(1);
    env.releaseMic();
    await joining;
    expect(chat.view.status).toBe('on');
    expect(seen).toEqual(['joining', 'on']);
    expect(sent).toEqual([{ data: { k: 'join', muted: false } }]);
    expect(env.polling).toBe(true);
  });

  it('refuse sans micro, sans autorisation, ou sans WebRTC, et reste hors du vocal', async () => {
    for (const [setup, expected] of [
      [(env: FakeEnv) => (env.deny = Object.assign(new Error('refusé'), { name: 'NotAllowedError' })), { kind: 'denied' }],
      [(env: FakeEnv) => (env.deny = Object.assign(new Error('absent'), { name: 'NotFoundError' })), { kind: 'noMic' }],
      [(env: FakeEnv) => (env.supported = false), { kind: 'unsupported' }],
    ] as const) {
      const { chat, env, sent, problems } = player(1);

      setup(env);
      await chat.join();
      expect(chat.view.status).toBe('off');
      expect(problems).toEqual([expected]);
      expect(sent).toEqual([]);
    }
  });

  it('un join() sans WebRTC ne demande pas le micro', async () => {
    const { chat, env } = player(1);

    env.supported = false;
    await chat.join();
    expect(env.opened).toBe(0);
  });

  it('quitter coupe le micro, prévient les autres et nettoie tout', async () => {
    const { chat, env, sent } = player(1);

    await chat.join();
    chat.receive(2, 'Lina', { k: 'here', muted: false });
    await flush();
    sent.length = 0;
    chat.leave();

    expect(chat.view.status).toBe('off');
    expect(chat.view.peers).toEqual([]);
    expect(env.mic.stopped).toBe(true);
    expect(env.links[0]!.closed).toBe(true);
    expect(env.polling).toBe(false);
    expect(sent).toEqual([{ data: { k: 'leave' } }]);
  });

  it('quitter pendant l’attente du micro éteint le micro qui arrive', async () => {
    const { chat, env, sent } = player(1);

    env.holdMic = true;

    const joining = chat.join();

    chat.leave();
    env.releaseMic();
    await joining;
    expect(chat.view.status).toBe('off');
    expect(env.mic.stopped).toBe(true);
    expect(sent).toEqual([]);
  });

  it('close() quitte sans rien envoyer : la partie est finie', async () => {
    const { chat, env, sent } = player(1);

    await chat.join();
    sent.length = 0;
    chat.close();
    expect(chat.view.status).toBe('off');
    expect(env.mic.stopped).toBe(true);
    expect(sent).toEqual([]);
  });
});

describe('VoiceChat — micro et volume', () => {
  it('couper le micro le coupe vraiment, le dit aux autres, et éteint son indicateur', async () => {
    const { chat, env, sent } = player(1);

    await chat.join();
    env.mic.loud = 0.5;
    env.advance(VOICE.pollMs);
    expect(chat.view.speaking).toBe(true);

    sent.length = 0;
    chat.setMuted(true);
    expect(env.mic.enabled).toBe(false);
    expect(chat.view.muted).toBe(true);
    expect(chat.view.speaking).toBe(false);
    expect(sent).toEqual([{ data: { k: 'mute', muted: true } }]);
    env.advance(VOICE.pollMs);
    expect(chat.view.speaking).toBe(false);

    chat.toggleMuted();
    expect(env.mic.enabled).toBe(true);
    expect(chat.view.muted).toBe(false);
  });

  it('règle le volume des autres, borné à l’intervalle 0–1, y compris pour ceux qui arrivent', async () => {
    const { chat, env } = player(1);

    await chat.join();
    chat.receive(2, 'Lina', { k: 'here', muted: false });
    await flush();
    env.links[0]!.onStream?.({});
    chat.setVolume(0.4);
    expect(env.playbacks[0]!.volume).toBe(0.4);
    chat.setVolume(7);
    expect(chat.view.volume).toBe(1);
    chat.setVolume(-3);
    expect(chat.view.volume).toBe(0);
    chat.setVolume(0.25);
    chat.receive(3, 'Max', { k: 'here', muted: false });
    await flush();
    env.links[1]?.onStream?.({});
    expect(env.playbacks.at(-1)!.volume).toBe(0.25);
  });

  it('allume son pseudo au-dessus du seuil et le garde un instant entre deux mots', async () => {
    const { chat, env } = player(1);

    await chat.join();
    env.mic.loud = VOICE.speakingLevel * 4;
    env.advance(VOICE.pollMs);
    expect(chat.view.speaking).toBe(true);

    env.mic.loud = 0;
    env.advance(VOICE.pollMs);
    expect(chat.view.speaking).toBe(true);
    env.advance(VOICE.holdMs);
    expect(chat.view.speaking).toBe(false);
  });
});

describe('VoiceChat — deux joueurs', () => {
  async function pair(): Promise<{ a: ReturnType<typeof player>; b: ReturnType<typeof player>; sync: () => Promise<void> }> {
    const a = player(1);
    const b = player(2);
    const a2 = { id: 1, name: 'Salva', sent: a.sent, chat: a.chat };
    const b2 = { id: 2, name: 'Lina', sent: b.sent, chat: b.chat };
    const sync = async (): Promise<void> => {
      for (let i = 0; i < 4; i += 1) {
        deliver(a2, [b2]);
        deliver(b2, [a2]);
        await flush();
      }
    };

    await a.chat.join();
    await b.chat.join();

    return { a, b, sync };
  }

  it('se trouvent, et le plus petit id envoie l’offre — une seule, jamais deux', async () => {
    const { a, b, sync } = await pair();

    await sync();
    expect(a.env.links).toHaveLength(1);
    expect(b.env.links).toHaveLength(1);
    expect(a.env.links[0]!.offered).toBe(true);
    expect(b.env.links[0]!.offered).toBe(false);
    expect(b.env.links[0]!.accepted).toBe('offre');
    expect(a.env.links[0]!.answered).toBe('réponse');
    expect(a.chat.view.peers.map((peer) => peer.nickname)).toEqual(['Lina']);
    expect(b.chat.view.peers.map((peer) => peer.nickname)).toEqual(['Salva']);
  });

  it('chacun entend l’autre parler, puis plus rien quand l’autre coupe son micro', async () => {
    const { a, b, sync } = await pair();

    await sync();
    a.env.links[0]!.onState?.('connected');
    a.env.links[0]!.onStream?.({});
    a.env.links[0]!.remoteLoud = 0.3;
    a.env.advance(VOICE.pollMs);
    expect(a.chat.view.peers[0]!.speaking).toBe(true);

    // Lina coupe son micro : Salva le sait aussitôt, et l'indicateur s'éteint chez lui.
    b.chat.setMuted(true);
    await sync();
    expect(a.chat.view.peers[0]!.muted).toBe(true);
    expect(a.chat.view.peers[0]!.speaking).toBe(false);
    a.env.advance(VOICE.pollMs);
    expect(a.chat.view.peers[0]!.speaking).toBe(false);

    b.chat.setMuted(false);
    await sync();
    a.env.advance(VOICE.pollMs);
    expect(a.chat.view.peers[0]!.speaking).toBe(true);
  });

  it('transmet les candidats ICE à la bonne liaison, et seulement à celui qu’ils visent', async () => {
    const { a, b, sync } = await pair();

    await sync();
    a.env.links[0]!.onCandidate?.({ candidate: 'cand-a' });
    expect(a.sent).toEqual([{ data: { k: 'ice', candidate: { candidate: 'cand-a' } }, to: 2 }]);
    await sync();
    expect(b.env.links[0]!.candidates).toEqual([{ candidate: 'cand-a' }]);
  });

  it('quitter le vocal ferme la liaison chez l’autre, qui reste dans le vocal', async () => {
    const { a, b, sync } = await pair();

    await sync();
    b.chat.leave();
    await sync();
    expect(a.chat.view.peers).toEqual([]);
    expect(a.env.links[0]!.closed).toBe(true);
    expect(a.chat.view.status).toBe('on');
  });

  it('revenir dans le vocal refait une liaison neuve', async () => {
    const { a, b, sync } = await pair();

    await sync();
    b.chat.leave();
    await sync();
    await b.chat.join();
    await sync();
    expect(a.env.links).toHaveLength(2);
    expect(a.env.links[0]!.closed).toBe(true);
    expect(a.chat.view.peers).toHaveLength(1);
    expect(b.chat.view.peers).toHaveLength(1);
  });

  it('un joueur qui quitte la partie (peerGone) retire sa liaison, la salle perdue (allGone) toutes', async () => {
    const { a, sync } = await pair();

    await sync();
    a.chat.peerGone(2);
    expect(a.chat.view.peers).toEqual([]);
    expect(a.env.links[0]!.closed).toBe(true);

    a.chat.receive(3, 'Max', { k: 'here', muted: false });
    a.chat.receive(4, 'Zoé', { k: 'here', muted: false });
    expect(a.chat.view.peers).toHaveLength(2);
    a.chat.allGone();
    expect(a.chat.view.peers).toEqual([]);
    expect(a.chat.view.status).toBe('on');
  });

  it('signale « connexion impossible avec <pseudo> » quand la liaison échoue', async () => {
    const { a, b, sync } = await pair();

    await sync();
    a.env.links[0]!.onState?.('failed');
    expect(a.problems).toEqual([{ kind: 'peer', nickname: 'Lina' }]);
    expect(a.chat.view.peers[0]!.state).toBe('failed');
    expect(a.env.links[0]!.closed).toBe(true);
    // Lina n'en sait rien tant que son navigateur ne l'a pas vu : son vocal tient.
    expect(b.chat.view.status).toBe('on');
  });

  it('signale aussi une offre qui ne peut pas se préparer', async () => {
    const a = player(1);

    await a.chat.join();
    // L'offre échoue dès qu'elle est demandée.
    const original = a.env.createLink.bind(a.env);

    a.env.createLink = () => {
      const link = original() as FakeLink;

      link.failOffer = true;

      return link;
    };
    a.chat.receive(2, 'Lina', { k: 'here', muted: false });
    await flush();
    expect(a.problems).toEqual([{ kind: 'peer', nickname: 'Lina' }]);
  });

  it('ignore ses propres signaux, les signaux illisibles, et tout ce qui arrive hors du vocal', async () => {
    const out = player(1);

    out.chat.receive(2, 'Lina', { k: 'join', muted: false });
    expect(out.chat.view.peers).toEqual([]);
    expect(out.sent).toEqual([]);

    await out.chat.join();
    out.sent.length = 0;
    out.chat.receive(1, 'Moi', { k: 'join', muted: false });
    out.chat.receive(2, 'Lina', { k: 'n’importe quoi' });
    out.chat.receive(2, 'Lina', 'texte');
    expect(out.chat.view.peers).toEqual([]);
    expect(out.sent).toEqual([]);
  });

  it('à trois, le maillage relie chacun à chacun', async () => {
    const players = [player(1), player(2), player(3)];
    const names = ['Salva', 'Lina', 'Max'];
    const bus = players.map((p, index) => ({ id: index + 1, name: names[index]!, sent: p.sent, chat: p.chat }));

    for (const p of players) await p.chat.join();
    for (let i = 0; i < 6; i += 1) {
      for (const from of bus) deliver(from, bus);
      await flush();
    }
    for (const p of players) expect(p.chat.view.peers).toHaveLength(2);
    // Trois paires, trois offres : une par paire.
    expect(players.reduce((total, p) => total + p.env.links.filter((link) => link.offered).length, 0)).toBe(3);
  });
});
