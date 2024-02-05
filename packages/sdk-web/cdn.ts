// @ts-nocheck

import { MixanWeb as Openpanel } from './index';

const el = document.currentScript;
if (el) {
  window.openpanel = new Openpanel({
    url: el?.getAttribute('url'),
    clientId: el?.getAttribute('client-id'),
    clientSecret: el?.getAttribute('client-secret'),
    trackOutgoingLinks: !!el?.getAttribute('track-outgoing-links'),
    trackScreenViews: !!el?.getAttribute('track-screen-views'),
  });
}
