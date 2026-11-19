import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { TrackHandlerPayload } from '@openpanel/sdk';
import { JSDOM } from 'jsdom';
import { getInitSnippet } from './init-snippet';

const PAGE_URL = 'https://example.com/pricing';
const DOM_GLOBALS = [
  'window',
  'document',
  'history',
  'sessionStorage',
  'HTMLElement',
] as const;

let dom: JSDOM;
let sent: TrackHandlerPayload[];
let trackerLoads = 0;

function installSnippet() {
  dom.window.eval(getInitSnippet());
  dom.window.op('init', {
    clientId: 'test-client',
    // Captures every payload before it reaches the network.
    filter: (payload: TrackHandlerPayload) => {
      sent.push(payload);
      return false;
    },
  });
}

// tracker.ts runs on import, so each load needs its own module instance.
async function loadTracker() {
  trackerLoads += 1;
  await import(`./tracker?load=${trackerLoads}`);
}

function trackedNames() {
  return sent.flatMap((item) =>
    item.type === 'track' ? [item.payload.name] : []
  );
}

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: PAGE_URL,
    runScripts: 'outside-only',
  });
  for (const name of DOM_GLOBALS) {
    (globalThis as Record<string, unknown>)[name] = dom.window[name];
  }
  sent = [];
  installSnippet();
});

afterEach(() => {
  for (const name of DOM_GLOBALS) {
    delete (globalThis as Record<string, unknown>)[name];
  }
  dom.window.close();
});

describe('window.op before the SDK loads', () => {
  test('call queues the method it was given', () => {
    const { op } = dom.window;

    op.call(dom.window, 'track', 'user_login', { source: 'nextjs' });

    expect(op.q?.at(-1)).toEqual(['track', 'user_login', { source: 'nextjs' }]);
  });

  test('events sent through call, apply and bind survive the SDK loading', async () => {
    const { op } = dom.window;

    op.call(dom.window, 'track', 'through_call');
    op.apply(dom.window, ['track', 'through_apply']);
    op.bind(dom.window)('track', 'through_bind');
    op.track('through_method');
    await loadTracker();

    expect(trackedNames()).toEqual([
      'through_call',
      'through_apply',
      'through_bind',
      'through_method',
    ]);
  });
});

describe('window.op after the SDK loads', () => {
  beforeEach(loadTracker);

  test('call reaches the SDK method, the way Turbopack compiles window.op?.()', () => {
    dom.window.op.call(dom.window, 'track', 'user_login');

    expect(trackedNames()).toEqual(['user_login']);
  });

  test('apply and bind reach the SDK method', () => {
    const { op } = dom.window;

    op.apply(dom.window, ['track', 'through_apply']);
    op.bind(dom.window)('track', 'through_bind');

    expect(trackedNames()).toEqual(['through_apply', 'through_bind']);
  });

  test('the callable and method styles keep working', () => {
    const { op } = dom.window;

    op('track', 'callable');
    op.track('method');

    expect(trackedNames()).toEqual(['callable', 'method']);
    expect(op.q).toBeUndefined();
    expect(dom.window.openpanel?.options.clientId).toBe('test-client');
  });
});
