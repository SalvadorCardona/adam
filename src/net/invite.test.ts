import { describe, expect, it } from 'vitest';
import { inviteCodeOf, inviteUrl, playCodeOf, playUrl, resyncsOf, titleUrl, withoutInvite } from './invite.ts';

describe('inviteUrl', () => {
  it('pose le code sur la page du jeu et jette le reste', () => {
    expect(inviteUrl('https://cardona.digital/adam/?debug#x', 'ABCD2345')).toBe(
      'https://cardona.digital/adam/?join=ABCD2345',
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
    expect(withoutInvite('https://x.example/adam/?join=ABCD2345&debug=1')).toBe('https://x.example/adam/?debug=1');
  });
});

describe('playUrl et playCodeOf', () => {
  it('rouvre la page dans la partie de l’hôte, et en relit le code', () => {
    const url = playUrl('https://cardona.digital/adam/?join=ABCD2345#x', 'ABCD2345');

    expect(url).toBe('https://cardona.digital/adam/?play=ABCD2345');
    expect(playCodeOf(new URL(url).search)).toBe('ABCD2345');
    expect(playCodeOf('?play=nope')).toBeNull();
    expect(playCodeOf('')).toBeNull();
  });

  it('compte les recalages, et rend l’écran titre sans paramètre', () => {
    const url = playUrl('https://cardona.digital/adam/', 'ABCD2345', 2);

    expect(resyncsOf(new URL(url).search)).toBe(2);
    expect(resyncsOf('?play=ABCD2345')).toBe(0);
    expect(titleUrl(url)).toBe('https://cardona.digital/adam/');
  });
});
