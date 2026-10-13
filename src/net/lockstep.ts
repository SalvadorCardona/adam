/**
 * Jouer à deux : la partie de l'hôte, rejouée chez l'ami au tick près.
 *
 * La simulation est déterministe — une seed, des commandes horodatées, et la
 * partie se rejoue à l'identique (`sim/commands.ts`). L'hôte fait autorité :
 * sa partie avance, et il envoie à l'ami, par le serveur qui ne fait que
 * relayer, ce qu'il faut pour la rejouer :
 *
 * 1. à l'arrivée de l'ami, l'**image** de la partie (`key`) : l'état complet,
 *    celui de la sauvegarde, pris juste après le tick où l'ami est entré ;
 * 2. puis les **pas** (`f`) : une plage de ticks, les commandes passées à
 *    chacun — les siennes et celles de l'ami — et, une fois par seconde,
 *    l'**empreinte** du monde (`World.checksum`). Dix paquets par seconde,
 *    quelques dizaines d'octets chacun quand personne ne fait rien.
 *
 * L'ami ne fait pas autorité : ses commandes partent à l'hôte (`c`), qui les
 * applique à son prochain tick, enveloppées (`asPartner`) et validées
 * (`parsePartnerCommand`), puis les lui renvoie dans ses pas. L'ami tient
 * quelques ticks d'avance (`bufferTicks`) pour absorber la gigue du réseau,
 * rattrape en accéléré s'il prend du retard, et compare chaque empreinte :
 * une différence, c'est qu'il a divergé — il se recale sur une image neuve
 * (`onDesync`). C'est toute la réconciliation : jamais de correction au coup
 * par coup, l'hôte a toujours raison.
 *
 * Ce module ne connaît ni le DOM ni le WebSocket : il lit et écrit des
 * messages, et les tests le branchent sur deux mondes.
 */

import type { Command } from '../sim/commands.ts';
import { PARTNER_COMMANDS, parsePartnerCommand } from '../sim/partner.ts';
import { SAVE_VERSION, type WorldState } from '../sim/save.ts';
import type { World } from '../sim/world.ts';

/** La durée d'un tick, en millisecondes : 20 par seconde, comme la boucle du jeu. */
const STEP_MS = 50;

export const LOCKSTEP = {
  /** L'hôte envoie ses pas par paquets de deux ticks — dix par seconde —, tout de suite quand une commande est passée. */
  frameTicks: 2,
  /** Une empreinte par seconde de jeu. */
  checkTicks: 20,
  /** Ce que l'ami garde d'avance pour absorber la gigue : 150 ms. */
  bufferTicks: 3,
  /** Au-delà de ce retard en plus de sa réserve, l'ami joue une fois et demie plus vite, le temps de rattraper. */
  lagTicks: 6,
  /** Au-delà de ce retard (cinq secondes), il rattrape d'un coup : mieux vaut un saut qu'une minute en accéléré. */
  jumpTicks: 100,
  /** Ce qu'on rattrape au plus dans une même image, pour ne jamais geler l'écran. */
  maxTicksPerFrame: 200,
  /** L'axe du joystick de l'ami, arrondi au seizième : un doigt qui tremble n'envoie rien. */
  axisSteps: 16,
  /** Et pas plus d'un envoi d'axe toutes les 66 ms — quinze par seconde. S'arrêter part tout de suite. */
  moveMs: 66,
  /** L'ami déconnecté reste ce temps avant de partir : une reconnexion (page rechargée, réseau qui hoquette) ne le fait pas disparaître. */
  graceMs: 8000,
} as const;

/** Ce que l'hôte envoie à l'ami. */
export type HostMessage =
  /** L'image de la partie : `v`, la version de la sauvegarde — deux versions du jeu ne rejouent pas pareil. */
  | { readonly t: 'key'; readonly v: number; readonly state: WorldState }
  /**
   * Les ticks `a` à `b` compris ; `c`, les commandes passées, avec leur tick ;
   * `h`, l'empreinte du monde après un tick de la plage.
   */
  | {
      readonly t: 'f';
      readonly a: number;
      readonly b: number;
      readonly c?: readonly (readonly [number, Command])[];
      readonly h?: readonly [number, number];
    };

/** Ce que l'ami envoie à l'hôte : une commande, que l'hôte validera. */
export type GuestMessage = { readonly t: 'c'; readonly c: unknown };

const isTick = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * Un message de l'hôte, s'il en a la forme ; `null` sinon. L'état d'une image
 * se valide ensuite comme une sauvegarde (`deserialize`), et les commandes se
 * rejouent telles quelles : l'hôte les a déjà appliquées.
 */
export function parseHostMessage(data: unknown): HostMessage | null {
  if (typeof data !== 'object' || data === null) return null;

  const message = data as Record<string, unknown>;

  if (message['t'] === 'key') {
    return typeof message['v'] === 'number' && typeof message['state'] === 'object' && message['state'] !== null ? (data as HostMessage) : null;
  }
  if (message['t'] !== 'f') return null;

  const { a, b, c, h } = message;

  if (!isTick(a) || !isTick(b) || b < a) return null;
  if (c !== undefined && !(Array.isArray(c) && c.every((entry) => Array.isArray(entry) && entry.length === 2 && isTick(entry[0]) && typeof entry[1] === 'object' && entry[1] !== null))) {
    return null;
  }
  if (h !== undefined && !(Array.isArray(h) && h.length === 2 && isTick(h[0]) && typeof h[1] === 'number')) return null;

  return data as HostMessage;
}

/* ------------------------------------------------------------------ hôte */

/**
 * Le côté de l'hôte : il accueille l'ami dans la partie, lui envoie l'image
 * puis les pas, et applique ses commandes. `afterTick` se branche après
 * chaque `world.tick()` de la boucle du jeu.
 */
export class HostSync {
  private readonly world: World;
  private readonly send: (message: HostMessage, to?: number) => void;
  private readonly now: () => number;
  /** L'ami dans la salle (son compte), et son pseudo. */
  private guest: { id: number; nickname: string } | null = null;
  /** Quand l'ami déconnecté partira, s'il ne revient pas. */
  private leaveAt: number | null = null;
  /** L'ami attend son image. */
  private keyed = false;
  /** Le journal déjà lu : les commandes d'après sont celles du dernier tick. */
  private cursor: number;
  /** Le premier tick du paquet en cours ; `null` tant que l'ami n'a pas son image. */
  private from: number | null = null;
  private pending: [number, Command][] = [];
  private check: [number, number] | null = null;

  public constructor(world: World, send: (message: HostMessage, to?: number) => void, now: () => number = () => performance.now()) {
    this.world = world;
    this.send = send;
    this.now = now;
    this.cursor = world.commandLog().length;
  }

  /** L'ami est-il dans la partie, connecté ? */
  public get connected(): boolean {
    return this.guest !== null && this.leaveAt === null;
  }

  /** L'ami entre — ou revient : son personnage le retrouve tel qu'il l'a laissé, et une image neuve part après le tick. */
  public guestIn(id: number, nickname: string): void {
    this.guest = { id, nickname };
    this.leaveAt = null;
    this.keyed = true;
    this.from = null;
    this.world.push({ type: 'partnerJoin', name: nickname });
  }

  /** L'ami s'est déconnecté : son personnage s'arrête, et part s'il ne revient pas à temps. */
  public guestOut(id: number): void {
    if (this.guest?.id !== id || this.leaveAt !== null) return;
    this.leaveAt = this.now() + LOCKSTEP.graceMs;
    this.keyed = false;
    this.from = null;
    this.world.push({ type: 'asPartner', command: { type: 'setMoveAxis', x: 0, y: 0 } });
  }

  /** On cesse d'héberger (session fermée) : l'ami part tout de suite. */
  public stop(): void {
    if (this.guest) this.world.push({ type: 'partnerLeave' });
    this.guest = null;
    this.leaveAt = null;
    this.keyed = false;
    this.from = null;
  }

  /** Un message de l'ami : une commande, qui ne passe que si elle est des siennes. */
  public receive(data: unknown, from: number | undefined): void {
    if (!this.connected || from !== this.guest?.id) return;
    if (typeof data !== 'object' || data === null || (data as Record<string, unknown>)['t'] !== 'c') return;

    const command = parsePartnerCommand((data as Record<string, unknown>)['c']);

    if (command) this.world.push({ type: 'asPartner', command });
  }

  /** Après chaque tick de l'hôte : ce tick part dans les pas de l'ami — ou, s'il vient d'entrer, son image. */
  public afterTick(): void {
    const log = this.world.commandLog();
    const tick = this.world.tickCount;
    const entries = log.slice(this.cursor).map(({ tick: at, command }) => [at, command] as [number, Command]);

    this.cursor = log.length;

    if (this.leaveAt !== null && this.now() >= this.leaveAt) {
      this.guest = null;
      this.leaveAt = null;
      this.world.push({ type: 'partnerLeave' });
    }
    if (!this.connected) return;

    if (this.keyed) {
      // L'ami entre au tick où `partnerJoin` est passée : l'image le montre déjà.
      if (!this.world.partner) return;
      this.keyed = false;
      this.from = tick + 1;
      this.pending = [];
      this.check = null;
      this.send({ t: 'key', v: SAVE_VERSION, state: this.world.snapshot() }, this.guest?.id);
      return;
    }
    if (this.from === null) return;

    this.pending.push(...entries);
    if (tick % LOCKSTEP.checkTicks === 0) this.check = [tick, this.world.checksum()];
    if (entries.length > 0 || tick - this.from + 1 >= LOCKSTEP.frameTicks) this.flush(tick);
  }

  private flush(tick: number): void {
    if (this.from === null) return;
    this.send(
      {
        t: 'f',
        a: this.from,
        b: tick,
        ...(this.pending.length > 0 && { c: this.pending }),
        ...(this.check && { h: this.check }),
      },
      this.guest?.id,
    );
    this.from = tick + 1;
    this.pending = [];
    this.check = null;
  }
}

/* ------------------------------------------------------------------- ami */

/**
 * Le côté de l'ami : il rejoue les pas de l'hôte à vingt ticks par seconde,
 * quelques ticks derrière lui, vérifie les empreintes, et envoie ses
 * commandes au lieu de les appliquer. `advance` remplace la boucle du jeu.
 */
export class GuestSync {
  private readonly world: World;
  private readonly send: (message: GuestMessage) => void;
  private readonly now: () => number;
  /** Le dernier tick reçu de l'hôte : on ne joue pas au-delà. */
  private known: number;
  private readonly commands = new Map<number, Command[]>();
  private readonly checks = new Map<number, number>();
  private accumulator = 0;
  private lastMove = -Infinity;
  private sentMove: [number, number] = [0, 0];
  private pendingMove: [number, number] | null = null;
  /** Vrai dès qu'une empreinte a différé : ce monde n'est plus celui de l'hôte. */
  public desynced = false;
  public onDesync: (() => void) | null = null;

  public constructor(world: World, send: (message: GuestMessage) => void, now: () => number = () => performance.now()) {
    this.world = world;
    this.send = send;
    this.now = now;
    this.known = world.tickCount;
    // Ce que l'ami fait part à l'hôte : rien ne s'applique ici avant de revenir dans ses pas.
    world.relay = (command) => this.relay(command);
  }

  /** Les ticks reçus et pas encore joués. */
  public get lag(): number {
    return this.known - this.world.tickCount;
  }

  /** Où en est l'image entre deux ticks, pour le rendu (0 à 1). */
  public get alpha(): number {
    return Math.min(1, this.accumulator / STEP_MS);
  }

  /** Des pas de l'hôte. Une image en cours de partie ne se rejoue pas ici : `onDesync` recharge. */
  public receive(message: HostMessage): void {
    if (message.t === 'key') {
      this.diverged();
      return;
    }
    if (message.b <= this.known) return;
    for (const [tick, command] of message.c ?? []) {
      if (tick <= this.world.tickCount) continue;

      const list = this.commands.get(tick);

      if (list) list.push(command);
      else this.commands.set(tick, [command]);
    }
    if (message.h && message.h[0] > this.world.tickCount) this.checks.set(message.h[0], message.h[1]);
    this.known = message.b;
  }

  /**
   * Fait avancer la partie de `deltaMs` d'écran : vingt ticks par seconde,
   * jamais au-delà de ce que l'hôte a envoyé ; en retard, plus vite ; très
   * en retard, d'un coup. Renvoie le nombre de ticks joués.
   */
  public advance(deltaMs: number): number {
    this.flushMove();

    const lag = this.lag;
    let played = 0;

    if (lag > LOCKSTEP.jumpTicks) {
      while (this.lag > LOCKSTEP.bufferTicks && played < LOCKSTEP.maxTicksPerFrame) {
        this.step();
        played += 1;
      }
      this.accumulator = 0;
      return played;
    }

    const speed = lag > LOCKSTEP.bufferTicks + LOCKSTEP.lagTicks ? 1.5 : 1;

    this.accumulator += Math.min(deltaMs, 250) * speed;
    while (this.accumulator >= STEP_MS && this.lag > 0 && played < LOCKSTEP.maxTicksPerFrame) {
      this.step();
      this.accumulator -= STEP_MS;
      played += 1;
    }
    // À court de pas, l'ami attend l'hôte : le temps d'attente ne s'accumule pas, il ne repartirait qu'en rafale.
    if (this.lag === 0) this.accumulator = Math.min(this.accumulator, STEP_MS);

    return played;
  }

  /**
   * Une commande de l'ami. Celles qui ne sont pas des siennes ne partent pas
   * — et ne s'appliquent pas non plus : c'est la partie de l'hôte. L'axe du
   * joystick s'arrondit et se limite ; s'arrêter part tout de suite.
   */
  public relay(command: Command): void {
    if (!PARTNER_COMMANDS.has(command.type)) return;
    if (command.type !== 'setMoveAxis') {
      this.send({ t: 'c', c: command });
      return;
    }

    const steps = LOCKSTEP.axisSteps;
    const axis: [number, number] = [Math.round(command.x * steps) / steps, Math.round(command.y * steps) / steps];

    this.pendingMove = axis;
    if ((axis[0] === 0 && axis[1] === 0) || this.now() - this.lastMove >= LOCKSTEP.moveMs) this.flushMove();
  }

  private flushMove(): void {
    const axis = this.pendingMove;

    if (!axis) return;
    if (axis[0] === this.sentMove[0] && axis[1] === this.sentMove[1]) {
      this.pendingMove = null;
      return;
    }

    const stop = axis[0] === 0 && axis[1] === 0;

    if (!stop && this.now() - this.lastMove < LOCKSTEP.moveMs) return;
    this.pendingMove = null;
    this.sentMove = axis;
    this.lastMove = this.now();
    this.send({ t: 'c', c: { type: 'setMoveAxis', x: axis[0], y: axis[1] } });
  }

  private step(): void {
    const tick = this.world.tickCount + 1;

    for (const command of this.commands.get(tick) ?? []) this.world.replay(command);
    this.commands.delete(tick);
    this.world.tick();

    const expected = this.checks.get(tick);

    if (expected === undefined) return;
    this.checks.delete(tick);
    if (this.world.checksum() !== expected) this.diverged();
  }

  private diverged(): void {
    if (this.desynced) return;
    this.desynced = true;
    this.onDesync?.();
  }
}
