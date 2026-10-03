import { describe, expect, it, vi } from 'vitest';
import { createCallableOpenPanel } from './callable';
import { getInitSnippet } from './init-snippet';

describe('createCallableOpenPanel', () => {
  it('supports Function.prototype.call used by transpiled optional calls', () => {
    const track = vi.fn();
    const op = { track };
    const callable = createCallableOpenPanel(op);

    callable.call(undefined, 'track', 'user_login', { source: 'nextjs' });

    expect(track).toHaveBeenCalledWith('user_login', { source: 'nextjs' });
    expect(track.mock.instances[0]).toBe(op);
  });

  it('continues to support callable and property-style methods', () => {
    const track = vi.fn();
    const op = { options: { clientId: 'test' }, track };
    const callable = createCallableOpenPanel(op);

    callable('track', 'callable');
    callable.track('property');

    expect(track).toHaveBeenNthCalledWith(1, 'callable');
    expect(track).toHaveBeenNthCalledWith(2, 'property');
    expect(callable.options).toBe(op.options);
  });
});

describe('getInitSnippet', () => {
  it('queues the intended method when Function.prototype.call is used', () => {
    const fakeWindow: Record<string, any> = {};
    new Function('window', getInitSnippet())(fakeWindow);

    fakeWindow.op.call(fakeWindow, 'track', 'user_login', {
      source: 'nextjs',
    });

    expect(fakeWindow.op.q).toEqual([
      ['track', 'user_login', { source: 'nextjs' }],
    ]);
  });
});
