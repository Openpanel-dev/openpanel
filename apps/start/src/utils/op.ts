import { OpenPanel } from '@openpanel/web';
import { readAttribution, toFirstTouchProperties } from '@/utils/attribution';
import { shouldSendAnalyticsEvent } from '@/utils/op-filter';

const clientId = import.meta.env.VITE_OP_CLIENT_ID;

export const op = new OpenPanel({
  clientId,
  disabled: clientId === 'undefined' || !clientId,
  // apiUrl: 'http://localhost:3333',
  trackScreenViews: true,
  trackOutgoingLinks: true,
  trackAttributes: true,
  filter: shouldSendAnalyticsEvent,
  // sessionReplay: {
  //   enabled: true,
  // }
});

// Every funnel event carries the marketing first touch, so sign-ups and
// activations can be broken down by the channel that brought them.
op.setGlobalProperties(toFirstTouchProperties(readAttribution()));
