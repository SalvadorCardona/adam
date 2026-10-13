import { describe, expect, it } from 'vitest';
import { TEST_SCENARIOS } from '../data/testScenario.ts';
import { deserialize } from '../sim/save.ts';
import { stageScenario } from '../sim/testScenario.ts';
import type { World } from '../sim/world.ts';
import { GuestSync, HostSync, LOCKSTEP, parseHostMessage, type GuestMessage, type HostMessage } from './lockstep.ts';

const GUEST_ID = 7;

/**
 * Deux écrans reliés par un faux réseau : chaque message arrive après
 * `latency` ms, plus une gigue tirée d'une suite fixe. L'hôte tourne à 20
 * ticks par seconde ; l'ami avance par images de 16 ms.
 */
class Link {
  public clock = 0;
  public readonly host: World;
  public readonly hostSync: HostSync;
  public guest: World | null = null;
  public guestSync: GuestSync | null = null;
  public readonly toGuest: { at: number; message: HostMessage }[] = [];
  public readonly toHost: { at: number; message: GuestMessage }[] = [];
  public bytesToGuest = 0;
  public framesToGuest = 0;
  public keysToGuest = 0;
  /** L'empreinte de l'hôte après chaque tick, pour la comparer à celle de l'ami au même tick. */
  public readonly hostChecks = new Map<number, number>();
  private jitter = 0;

  public readonly latency: number;

  public constructor(latency: number) {
    this.latency = latency;
    this.host = stageScenario(TEST_SCENARIOS.base);
    this.hostSync = new HostSync(
      this.host,
      (message) => {
        const text = JSON.stringify(message);

        if (message.t === 'f') {
          this.bytesToGuest += text.length;
          this.framesToGuest += 1;
        } else {
          this.keysToGuest += 1;
        }
        this.toGuest.push({ at: this.clock + this.delay(), message: JSON.parse(text) as HostMessage });
      },
      () => this.clock,
    );
  }

  private delay(): number {
    this.jitter = (this.jitter * 7 + 13) % 41;
    return this.latency + this.jitter;
  }

  /** Avance de `ms` millisecondes : l'hôte tique à son rythme, l'ami rejoue ce qu'il a reçu. */
  public run(ms: number, eachTick: (tick: number) => void = () => {}): void {
    for (let elapsed = 0; elapsed < ms; elapsed += 16) {
      const before = Math.floor(this.clock / 50);

      this.clock += 16;
      for (let tick = before; tick < Math.floor(this.clock / 50); tick += 1) {
        eachTick(this.host.tickCount + 1);
        this.host.tick();
        this.hostSync.afterTick();
        this.hostChecks.set(this.host.tickCount, this.host.checksum());
      }
      this.deliver();
      this.guestSync?.advance(16);
    }
  }

  private deliver(): void {
    for (const queue of [this.toGuest, this.toHost] as const) {
      while (queue.length > 0 && queue[0]!.at <= this.clock) {
        const { message } = queue.shift()!;

        if (queue === this.toHost) this.hostSync.receive(message, GUEST_ID);
        else this.toGuestArrived(message as HostMessage);
      }
    }
  }

  private toGuestArrived(message: HostMessage): void {
    const parsed = parseHostMessage(message);

    if (!parsed) throw new Error('message illisible');
    if (parsed.t === 'key' && !this.guest) {
      this.guest = deserialize(parsed.state);
      this.guest.viewAsPartner();
      this.guestSync = new GuestSync(
        this.guest,
        (out) => this.toHost.push({ at: this.clock + this.delay(), message: JSON.parse(JSON.stringify(out)) as GuestMessage }),
        () => this.clock,
      );
      return;
    }
    this.guestSync?.receive(parsed);
  }
}

describe('jouer à deux : l’hôte et l’ami', () => {
  it('l’ami arrive avec l’image de la partie, son personnage déjà là', () => {
    const link = new Link(80);

    link.hostSync.guestIn(GUEST_ID, 'Lina');
    link.run(500);

    expect(link.host.partner?.name).toBe('Lina');
    expect(link.guest?.partner?.name).toBe('Lina');
    expect(link.guest?.player).toBe(link.guest?.partner?.player);
  });

  it('les deux mondes restent le même, commandes de l’un et de l’autre comprises', () => {
    const link = new Link(120);

    link.hostSync.guestIn(GUEST_ID, 'Lina');
    link.run(500);

    const guest = link.guest!;
    const start = { x: guest.partner!.player.x, y: guest.partner!.player.y };

    link.run(60_000, (tick) => {
      // Adam se promène chez l'hôte ; l'ami pousse son joystick chez lui.
      if (tick % 37 === 0) link.host.push({ type: 'setMoveAxis', x: Math.sin(tick), y: Math.cos(tick) });
      if (tick % 23 === 0) guest.push({ type: 'setMoveAxis', x: Math.cos(tick / 3), y: Math.sin(tick / 3) });
    });
    expect(link.guestSync!.desynced).toBe(false);
    expect(guest.tickCount).toBeGreaterThan(1000);
    expect(guest.checksum()).toBe(link.hostChecks.get(guest.tickCount));
    // L'ami a vraiment marché, chez l'hôte comme chez lui.
    expect(Math.hypot(guest.partner!.player.x - start.x, guest.partner!.player.y - start.y)).toBeGreaterThan(32);
  });

  it('l’ami joue quelques ticks derrière l’hôte, pas plus', () => {
    const link = new Link(100);

    link.hostSync.guestIn(GUEST_ID, 'Lina');
    link.run(10_000);

    const behind = link.host.tickCount - link.guest!.tickCount;

    // 100 ms de réseau, 40 de gigue, un paquet de deux ticks et la réserve : moins d'un tiers de seconde.
    expect(behind).toBeGreaterThanOrEqual(0);
    expect(behind).toBeLessThanOrEqual(LOCKSTEP.bufferTicks + 6);
  });

  it('envoie peu : une dizaine de paquets par seconde, quelques dizaines d’octets', () => {
    const link = new Link(50);

    link.hostSync.guestIn(GUEST_ID, 'Lina');
    link.run(1000);
    link.bytesToGuest = 0;
    link.framesToGuest = 0;
    link.run(10_000);

    expect(link.framesToGuest).toBeLessThanOrEqual(110);
    // Moins de 500 octets par seconde quand personne ne touche à rien — avant compression.
    expect(link.bytesToGuest / 10).toBeLessThan(500);
  });

  it('une divergence se voit à l’empreinte suivante', () => {
    const link = new Link(60);
    let diverged = 0;

    link.hostSync.guestIn(GUEST_ID, 'Lina');
    link.run(500);
    link.guestSync!.onDesync = () => (diverged += 1);
    // Un objet de trop dans le sac de l'ami, chez lui seulement.
    link.guest!.partner!.player.inventory.add('wood', 1);
    link.run(2000);

    expect(link.guestSync!.desynced).toBe(true);
    expect(diverged).toBe(1);
  });

  it('l’ami ne fait rien partir que l’hôte ne lui permette, et retient son joystick', () => {
    const sent: GuestMessage[] = [];
    let now = 0;
    const world = stageScenario(TEST_SCENARIOS.base);
    const sync = new GuestSync(world, (message) => sent.push(message), () => now);

    const logged = world.commandLog().length;

    world.push({ type: 'catchUp', awayMs: 3_600_000 });
    world.push({ type: 'craftGear', forge: 1 });
    world.push({ type: 'setMoveAxis', x: 0.5, y: 0.01 });
    world.push({ type: 'setMoveAxis', x: 0.51, y: 0 });
    world.push({ type: 'setMoveAxis', x: 1, y: 0 });
    now += LOCKSTEP.moveMs;
    sync.advance(0);
    world.push({ type: 'setMoveAxis', x: 0, y: 0 });
    world.push({ type: 'placeBuilding', building: 'home', tx: 1, ty: 2 });

    expect(sent).toEqual([
      { t: 'c', c: { type: 'setMoveAxis', x: 0.5, y: 0 } },
      { t: 'c', c: { type: 'setMoveAxis', x: 1, y: 0 } },
      { t: 'c', c: { type: 'setMoveAxis', x: 0, y: 0 } },
      { t: 'c', c: { type: 'placeBuilding', building: 'home', tx: 1, ty: 2 } },
    ]);
    // Rien ne s'est appliqué chez l'ami : sa partie est celle de l'hôte.
    world.tick();
    expect(world.commandLog()).toHaveLength(logged);
  });

  it('l’hôte refuse ce que l’ami n’a pas le droit de faire', () => {
    const link = new Link(0);

    link.hostSync.guestIn(GUEST_ID, 'Lina');
    link.run(200);

    const before = link.host.commandLog().length;

    link.hostSync.receive({ t: 'c', c: { type: 'catchUp', awayMs: 3_600_000 } }, GUEST_ID);
    link.hostSync.receive({ t: 'c', c: { type: 'setMoveAxis', x: 1, y: 0 } }, 99);
    link.hostSync.receive({ t: 'x' }, GUEST_ID);
    link.host.tick();
    expect(link.host.commandLog()).toHaveLength(before);

    link.hostSync.receive({ t: 'c', c: { type: 'setMoveAxis', x: 1, y: 0 } }, GUEST_ID);
    link.host.tick();
    expect(link.host.commandLog().at(-1)?.command).toEqual({ type: 'asPartner', command: { type: 'setMoveAxis', x: 1, y: 0 } });
  });

  it('l’ami déconnecté part après un délai ; revenu à temps, il reste et reçoit une image neuve', () => {
    const link = new Link(0);

    link.hostSync.guestIn(GUEST_ID, 'Lina');
    link.run(200);
    link.host.partner!.player.inventory.add('stone', 2);

    link.hostSync.guestOut(GUEST_ID);
    link.run(LOCKSTEP.graceMs / 2);
    expect(link.host.partner).not.toBeNull();
    expect(link.host.partner!.player.moving).toBe(false);

    link.hostSync.guestIn(GUEST_ID, 'Lina');
    link.run(200);
    expect(link.keysToGuest).toBe(2);
    expect(link.host.partner!.player.inventory.count('stone')).toBe(2);

    link.hostSync.guestOut(GUEST_ID);
    link.run(LOCKSTEP.graceMs + 200);
    expect(link.host.partner).toBeNull();
  });
});

describe('parseHostMessage', () => {
  it('lit les pas et l’image', () => {
    expect(parseHostMessage({ t: 'f', a: 3, b: 4 })).toEqual({ t: 'f', a: 3, b: 4 });
    expect(parseHostMessage({ t: 'f', a: 3, b: 4, c: [[4, { type: 'setMoveAxis', x: 0, y: 0 }]], h: [4, 123] })).not.toBeNull();
    expect(parseHostMessage({ t: 'key', v: 10, state: {} })).not.toBeNull();
  });

  it('refuse ce qui n’en a pas la forme', () => {
    for (const bad of [null, 'f', { t: 'f', a: 4, b: 3 }, { t: 'f', a: -1, b: 3 }, { t: 'f', a: 1, b: 2, c: [[1]] }, { t: 'f', a: 1, b: 2, h: [1] }, { t: 'key', v: 10 }]) {
      expect(parseHostMessage(bad)).toBeNull();
    }
  });
});
