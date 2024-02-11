// @ts-nocheck

import { MixanWeb as Openpanel } from './index';

const el = document.currentScript;
if (el) {
  window.openpanel = new Openpanel({
    url: el?.getAttribute('data-url'),
    clientId: el?.getAttribute('data-client-id'),
    trackOutgoingLinks: !!el?.getAttribute('data-track-outgoing-links'),
    trackScreenViews: !!el?.getAttribute('data-track-screen-views'),
  });
}
