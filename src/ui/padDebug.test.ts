import { describe, expect, it } from 'vitest';
import { padDebugLine, padDebugRows } from './padDebug.ts';

describe('diagnostic manette', () => {
  it('garde les entrées non vides, arrondies, et liste les boutons enfoncés', () => {
    const rows = padDebugRows([
      null,
      {
        index: 1,
        id: '28de-11ff-Microsoft X-Box 360 pad 0',
        mapping: 'standard',
        connected: true,
        axes: [0.123456, -1],
        buttons: [
          { pressed: true, value: 1 },
          { pressed: false, value: 0.333333 },
        ],
      },
    ]);

    expect(rows).toEqual([
      { index: 1, id: '28de-11ff-Microsoft X-Box 360 pad 0', mapping: 'standard', connected: true, axes: [0.12, -1], buttons: [1, 0.33], pressed: [0] },
    ]);
    expect(padDebugLine(rows[0]!)).toBe(
      '[pad] {"index":1,"id":"28de-11ff-Microsoft X-Box 360 pad 0","mapping":"standard","connected":true,"axes":[0.12,-1],"buttons":[1,0.33],"pressed":[0]}',
    );
  });
});
