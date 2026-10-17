// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../core/events.ts';
import { Disposer } from './disposer.ts';

describe('Disposer', () => {
  it('retire écouteurs, abonnements et minuteurs, une seule fois', () => {
    const life = new Disposer();
    const events = new Emitter<{ ping: number }>();
    const heard = vi.fn();
    const clicked = vi.fn();
    const undo = vi.fn();
    const ticks = vi.fn();

    vi.useFakeTimers();
    life.on(events, 'ping', heard);
    life.listen(window, 'click', clicked, { capture: true });
    life.add(undo);
    life.interval(ticks, 100);
    events.emit('ping', 1);
    window.dispatchEvent(new Event('click'));
    vi.advanceTimersByTime(100);
    expect(events.listenerCount()).toBe(1);

    life.dispose();
    life.dispose();
    events.emit('ping', 2);
    window.dispatchEvent(new Event('click'));
    vi.advanceTimersByTime(500);
    vi.useRealTimers();

    expect(heard).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(ticks).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(events.listenerCount()).toBe(0);
  });

  it('défait tout de suite ce qu’on lui confie une fois défait', () => {
    const life = new Disposer();
    const undo = vi.fn();

    life.dispose();
    life.add(undo);
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
