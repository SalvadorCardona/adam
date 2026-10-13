import { describe, expect, it } from 'vitest';
import { auditSvg } from '../data/artDirection.ts';
import { qrModules, qrSvg } from './qrCode.ts';

const LINK = 'https://cardona.digital/mobile-factory/?join=ABCD2345';

describe('qrModules', () => {
  it('donne une grille carrée, avec les trois repères aux coins', () => {
    const modules = qrModules(LINK);
    const size = modules.length;

    expect(modules.every((row) => row.length === size)).toBe(true);
    // Le coin d'un repère de position est sombre, le centre d'un repère aussi.
    expect(modules[0]![0]).toBe(true);
    expect(modules[3]![3]).toBe(true);
    expect(modules[0]![size - 1]).toBe(true);
    expect(modules[size - 1]![0]).toBe(true);
  });

  it('change avec le lien', () => {
    expect(qrModules(LINK)).not.toEqual(qrModules(`${LINK}9`));
  });
});

describe('qrSvg', () => {
  it('respecte la palette et la direction artistique', () => {
    expect(auditSvg(qrSvg(LINK))).toEqual([]);
  });
});
