import { describe, expect, it } from 'vitest';
import { STUN_SERVERS, iceServers } from './iceServers.ts';

describe('iceServers', () => {
  it('se contente du STUN public sans TURN', () => {
    expect(iceServers({})).toEqual(STUN_SERVERS);
    expect(iceServers({ VITE_TURN_URL: '', VITE_TURN_USERNAME: '', VITE_TURN_CREDENTIAL: '' })).toEqual(STUN_SERVERS);
  });

  it('ajoute le TURN quand son adresse et ses identifiants sont donnés', () => {
    expect(iceServers({ VITE_TURN_URL: 'turn:turn.example.com:3478', VITE_TURN_USERNAME: 'adam', VITE_TURN_CREDENTIAL: 'secret' })).toEqual([
      ...STUN_SERVERS,
      { urls: 'turn:turn.example.com:3478', username: 'adam', credential: 'secret' },
    ]);
  });

  it('ignore un TURN incomplet ou mal formé', () => {
    expect(iceServers({ VITE_TURN_URL: 'turn:turn.example.com:3478' })).toEqual(STUN_SERVERS);
    expect(iceServers({ VITE_TURN_URL: 'https://turn.example.com', VITE_TURN_USERNAME: 'a', VITE_TURN_CREDENTIAL: 'b' })).toEqual(STUN_SERVERS);
  });
});
