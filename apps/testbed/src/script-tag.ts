import { getInitSnippet } from '@openpanel/web';

declare global {
  interface Window {
    loadTracker: () => Promise<unknown>;
  }
}

// A customer site's two script tags, taken from source: public/op1.js is the
// last released build, not the code under test. The spec decides when the
// second one "arrives" so it can call window.op on both sides of it.
const snippet = document.createElement('script');
snippet.textContent = getInitSnippet();
document.head.append(snippet);

window.op('init', {
  clientId: import.meta.env.VITE_OPENPANEL_CLIENT_ID ?? 'testbed-client',
  apiUrl: import.meta.env.VITE_OPENPANEL_API_URL ?? 'http://localhost:3333',
});

window.loadTracker = () => import('@openpanel/web/src/tracker');
