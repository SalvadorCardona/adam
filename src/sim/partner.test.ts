import { describe, expect, it } from 'vitest';
import { TILE_SIZE, floorDiv } from '../core/grid.ts';
import { RESOURCES } from '../data/resources.ts';
import { TEST_SCENARIOS } from '../data/testScenario.ts';
import type { Command } from './commands.ts';
import { PARTNER_LOOK, parsePartnerCommand } from './partner.ts';
import { decodeSave, encodeSave } from './save.ts';
import { stageScenario } from './testScenario.ts';
import type { World } from './world.ts';
import { SLOW } from './sweep.ts';

const asPartner = (command: Command): Command => ({ type: 'asPartner', command });

function withPartner(name = 'Lina'): World {
  const world = stageScenario(TEST_SCENARIOS.base);

  world.push({ type: 'partnerJoin', name });
  world.tick();

  return world;
}

/** Le premier arbre à moins de `radius` tuiles du point, par anneaux. */
function treeNear(world: World, x: number, y: number, radius = 20): { tx: number; ty: number } {
  const cx = floorDiv(x, TILE_SIZE);
  const cy = floorDiv(y, TILE_SIZE);

  for (let r = 2; r <= radius; r += 1) {
    for (let ty = cy - r; ty <= cy + r; ty += 1) {
      for (let tx = cx - r; tx <= cx + r; tx += 1) {
        const resource = world.resources.at(tx, ty);

        if (resource && RESOURCES[resource.id].item === 'wood' && !world.enemyZoneAt(tx, ty)) return { tx, ty };
      }
    }
  }
  throw new Error('pas d’arbre autour');
}

describe('l’ami dans la partie', () => {
  it('apparaît à côté d’Adam, sac vide, sous son pseudo', () => {
    const world = stageScenario(TEST_SCENARIOS.base);
    const joined: string[] = [];

    world.events.on('partnerJoined', ({ name }) => joined.push(name));
    world.push({ type: 'partnerJoin', name: '  Lina  ' });
    world.tick();

    const partner = world.partner!;

    expect(joined).toEqual(['Lina']);
    expect(partner.name).toBe('Lina');
    expect(partner.player.inventory.total()).toBe(0);
    expect(partner.player.look).toEqual(PARTNER_LOOK);
    expect(Math.hypot(partner.player.x - world.adam.x, partner.player.y - world.adam.y)).toBeLessThanOrEqual(TILE_SIZE);
  });

  it('marche par ses propres commandes, sans bouger Adam', () => {
    const world = withPartner();
    const adam = { x: world.adam.x, y: world.adam.y };
    const start = world.partner!.player.y;

    world.push(asPartner({ type: 'setMoveAxis', x: 0, y: 1 }));
    for (let i = 0; i < 10; i += 1) world.tick();

    expect(world.partner!.player.y).toBeGreaterThan(start);
    expect(world.adam).toMatchObject(adam);
  });

  it('récolte de proximité dans son sac à lui', () => {
    const world = withPartner();
    const tree = treeNear(world, world.adam.x, world.adam.y);
    const partner = world.partner!.player;

    partner.x = partner.prevX = (tree.tx + 0.5) * TILE_SIZE;
    partner.y = partner.prevY = (tree.ty + 1.6) * TILE_SIZE;
    for (let i = 0; i < 40; i += 1) world.tick();

    expect(partner.inventory.count('wood')).toBeGreaterThan(0);
  });

  it('bâtit à sa portée, pas à celle d’Adam', () => {
    const world = withPartner();
    const partner = world.partner!.player;
    const hall = world.entities.get(world.townHallId)!;

    // Une maison loin d'Adam mais à côté de l'ami : posée en son nom, elle passe.
    let spot: { tx: number; ty: number } | null = null;

    for (let dx = -12; dx <= 12 && !spot; dx += 1) {
      for (let dy = 8; dy <= 14 && !spot; dy += 1) {
        const tx = hall.tx + dx;
        const ty = hall.ty + dy;

        partner.x = partner.prevX = (tx + 1) * TILE_SIZE;
        partner.y = partner.prevY = (ty + 4) * TILE_SIZE;
        if (world.canPlace('home', tx, ty) === null) spot = { tx, ty };
      }
    }
    if (!spot) throw new Error('pas de place pour la maison');

    world.adam.x = world.adam.prevX = partner.x + 30 * TILE_SIZE;
    world.push({ type: 'placeBuilding', building: 'home', ...spot });
    world.tick();
    expect([...world.entities.values()].some((entity) => entity.tx === spot.tx && entity.ty === spot.ty)).toBe(false);

    world.push(asPartner({ type: 'placeBuilding', building: 'home', ...spot }));
    world.tick();
    expect([...world.entities.values()].some((entity) => entity.kind === 'site' && entity.tx === spot.tx && entity.ty === spot.ty)).toBe(true);
  });

  it('en partant, laisse son sac en tas à ses pieds', () => {
    const world = withPartner();
    const left: string[] = [];

    world.events.on('partnerLeft', ({ name }) => left.push(name));
    world.partner!.player.inventory.add('wood', 5);
    world.push({ type: 'partnerLeave' });
    world.tick();

    const heaps = [...world.mobiles.values()].filter((mobile) => mobile.kind === 'pickup' && mobile.item === 'wood');

    expect(world.partner).toBeNull();
    expect(left).toEqual(['Lina']);
    expect(heaps.reduce((sum, heap) => sum + (heap.kind === 'pickup' ? heap.amount : 0), 0)).toBe(5);
  });

  it('sans ami, ses commandes ne font rien', () => {
    const world = stageScenario(TEST_SCENARIOS.base);
    const before = world.checksum();

    world.push(asPartner({ type: 'setMoveAxis', x: 1, y: 0 }));
    world.tick();

    expect(world.partner).toBeNull();
    expect(world.checksum()).not.toBe(before);
    expect(world.adam.moving).toBe(false);
  });

  it('chez l’ami, le joueur est l’ami hors du tick, et Adam pendant', () => {
    const world = withPartner();

    world.viewAsPartner();
    expect(world.player).toBe(world.partner!.player);
    expect(world.viewingPartner).toBe(true);

    // Le tick ne dépend pas de qui regarde : Adam pousse, Adam marche.
    world.push({ type: 'setMoveAxis', x: 1, y: 0 });
    const x = world.adam.x;

    world.tick();
    expect(world.adam.x).toBeGreaterThan(x);
  });

  it('se sauvegarde et se relit avec la partie', () => {
    const world = withPartner('Noé');

    world.partner!.player.inventory.add('stone', 3);

    const decoded = decodeSave(encodeSave(world, 0));

    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.world.partner?.name).toBe('Noé');
    expect(decoded.world.partner?.player.inventory.count('stone')).toBe(3);
    expect(decoded.world.checksum()).toBe(world.checksum());
  });
});

/** Les chemins où deux états diffèrent : un message lisible plutôt que deux JSON de 30 Ko. */
function diff(a: unknown, b: unknown, path = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return [path];

  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
    diff((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`),
  );
}

describe('réconciliation : deux mondes, mêmes commandes, même empreinte', () => {
  /** L'hôte et l'ami rejouent les mêmes commandes aux mêmes ticks. */
  function run(host: World, guest: World, ticks: number, commands: (tick: number) => Command[]): void {
    for (let i = 0; i < ticks; i += 1) {
      for (const command of commands(host.tickCount + 1)) {
        host.push(command);
        guest.push(command);
      }
      host.tick();
      guest.tick();
    }
  }

  it.skipIf(!SLOW)('l’image de l’hôte, rejouée chez l’ami, ne diverge pas', () => {
    const host = withPartner();

    for (let i = 0; i < 400; i += 1) host.tick();

    const decoded = decodeSave(encodeSave(host, 0));

    if (!decoded.ok) throw new Error(decoded.reason);

    const guest = decoded.world;

    guest.viewAsPartner();
    expect(guest.checksum()).toBe(host.checksum());

    run(host, guest, 3000, (tick) =>
      tick % 53 === 0
        ? [{ type: 'setMoveAxis', x: Math.sin(tick), y: Math.cos(tick) }, asPartner({ type: 'setMoveAxis', x: Math.cos(tick), y: Math.sin(tick) })]
        : [],
    );

    expect(guest.checksum()).toBe(host.checksum());
    expect(diff(guest.snapshot(), host.snapshot())).toEqual([]);
  });

  it('une commande manquée se voit à l’empreinte', () => {
    const host = withPartner();
    const decoded = decodeSave(encodeSave(host, 0));

    if (!decoded.ok) throw new Error(decoded.reason);

    const guest = decoded.world;

    host.push(asPartner({ type: 'setMoveAxis', x: 1, y: 0 }));
    for (let i = 0; i < 5; i += 1) {
      host.tick();
      guest.tick();
    }
    expect(guest.checksum()).not.toBe(host.checksum());
  });
});

describe('parsePartnerCommand', () => {
  it('lit une commande de l’ami, telle quelle', () => {
    expect(parsePartnerCommand({ type: 'setMoveAxis', x: 0.5, y: -1 })).toEqual({ type: 'setMoveAxis', x: 0.5, y: -1 });
    expect(parsePartnerCommand({ type: 'placeBuilding', building: 'home', tx: -3, ty: 4 })).toEqual({ type: 'placeBuilding', building: 'home', tx: -3, ty: 4 });
    expect(parsePartnerCommand({ type: 'transferItems', id: 3, direction: 'take', quantity: 'all' })).toEqual({
      type: 'transferItems',
      id: 3,
      direction: 'take',
      quantity: 'all',
    });
    expect(parsePartnerCommand({ type: 'depositToTown', item: 'wood', amount: 10 })).toEqual({ type: 'depositToTown', item: 'wood', amount: 10 });
    expect(parsePartnerCommand({ type: 'dropItem' })).toEqual({ type: 'dropItem' });
  });

  it('refuse ce qui n’est pas à l’ami, ou mal formé', () => {
    for (const bad of [
      null,
      'setMoveAxis',
      { type: 'catchUp', awayMs: 1e9 },
      { type: 'applyPerks', perks: [] },
      { type: 'craftGear', forge: 1 },
      { type: 'craftTool', forge: 1, slot: 'axe' },
      { type: 'dressAdam', look: PARTNER_LOOK },
      { type: 'partnerLeave' },
      { type: 'asPartner', command: { type: 'setMoveAxis', x: 0, y: 0 } },
      { type: 'setMoveAxis', x: 2, y: 0 },
      { type: 'setMoveAxis', x: Number.NaN, y: 0 },
      { type: 'placeBuilding', building: 'castle', tx: 0, ty: 0 },
      { type: 'placeBuilding', building: 'home', tx: 0.5, ty: 0 },
      { type: 'transferItems', id: 3, direction: 'steal', quantity: 1 },
      { type: 'depositToTown', item: 'gold' },
      { type: 'setPriority', id: 1, priority: 'urgent' },
    ]) {
      expect(parsePartnerCommand(bad)).toBeNull();
    }
  });
});
