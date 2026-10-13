import { describe, expect, it } from 'vitest';
import { inviteCodeOf, inviteUrl, withoutInvite } from './invite.ts';

describe('inviteUrl', () => {
  it('pose le code sur la page du jeu et jette le reste', () => {
    expect(inviteUrl('https://cardona.digital/mobile-factory/?debug#x', 'ABCD2345')).toBe(
      'https://cardona.digital/mobile-factory/?join=ABCD2345',
    );
  });
});

describe('inviteCodeOf', () => {
  it('lit le code, tapé comme on veut', () => {
    expect(inviteCodeOf('?join=ABCD2345')).toBe('ABCD2345');
    expect(inviteCodeOf('?join=abcd-2345')).toBe('ABCD2345');
  });

  it('ne voit pas d’invitation sans paramètre', () => {
    expect(inviteCodeOf('')).toBeNull();
    expect(inviteCodeOf('?debug')).toBeNull();
  });

  it('signale un code illisible plutôt que de l’ignorer', () => {
    expect(inviteCodeOf('?join=')).toBe('');
    expect(inviteCodeOf('?join=trop-court')).toBe('');
    expect(inviteCodeOf('?join=ABCDEFG0')).toBe('');
  });
});

describe('withoutInvite', () => {
  it('retire l’invitation et garde le reste', () => {
    expect(withoutInvite('https://x.example/mobile-factory/?join=ABCD2345&debug=1')).toBe('https://x.example/mobile-factory/?debug=1');
  });
});
