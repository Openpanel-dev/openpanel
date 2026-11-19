import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { TrackHandlerPayload } from '@openpanel/sdk';
import { JSDOM } from 'jsdom';
import { OpenPanel, type OpenPanelOptions } from './index';

const PAGE_URL = 'https://example.com/pricing';
const OUTGOING_URL = 'https://other.example/docs';

const DOM_GLOBALS = [
  'window',
  'document',
  'history',
  'sessionStorage',
  'HTMLElement',
  'MouseEvent',
  'Event',
] as const;

let dom: JSDOM;
let sent: TrackHandlerPayload[];

function createSdk(options: Omit<OpenPanelOptions, 'clientId'>) {
  return new OpenPanel({
    clientId: 'test-client',
    // Captures every payload before it reaches the network.
    filter: (payload) => {
      sent.push(payload);
      return false;
    },
    ...options,
  });
}

function click(element: Element) {
  element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}

function sentTrackEvents() {
  return sent.flatMap((item) => (item.type === 'track' ? [item.payload] : []));
}

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: PAGE_URL,
  });
  for (const name of DOM_GLOBALS) {
    (globalThis as Record<string, unknown>)[name] = dom.window[name];
  }
  sent = [];
});

afterEach(() => {
  for (const name of DOM_GLOBALS) {
    delete (globalThis as Record<string, unknown>)[name];
  }
  dom.window.close();
});

describe('automatic click events', () => {
  test('fall back to the browser location when no screen view was tracked', () => {
    createSdk({ trackAttributes: true });

    const button = dom.window.document.createElement('button');
    button.setAttribute('data-track', 'cta');
    dom.window.document.body.appendChild(button);
    click(button);

    const [cta] = sentTrackEvents();
    expect(cta?.name).toBe('cta');
    expect(cta?.properties).toMatchObject({ __path: PAGE_URL });
  });

  test('outgoing link clicks carry the current page', () => {
    const sdk = createSdk({ trackOutgoingLinks: true });
    sdk.screenView(PAGE_URL);

    const link = dom.window.document.createElement('a');
    link.setAttribute('href', OUTGOING_URL);
    link.setAttribute('title', 'Docs');
    dom.window.document.body.appendChild(link);
    click(link);

    const [, linkOut] = sentTrackEvents();
    expect(linkOut?.name).toBe('link_out');
    expect(linkOut?.properties).toMatchObject({
      href: OUTGOING_URL,
      text: 'Docs',
      __path: PAGE_URL,
    });
  });

  test('data-track clicks carry the current page', () => {
    const sdk = createSdk({ trackAttributes: true });
    sdk.screenView(PAGE_URL);

    const button = dom.window.document.createElement('button');
    button.setAttribute('data-track', 'cta');
    button.setAttribute('data-cta-target', 'signup');
    dom.window.document.body.appendChild(button);
    click(button);

    const [, cta] = sentTrackEvents();
    expect(cta?.name).toBe('cta');
    expect(cta?.properties).toMatchObject({
      ctaTarget: 'signup',
      __path: PAGE_URL,
    });
  });
});
