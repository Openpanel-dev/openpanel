import { OpenPanel } from '@openpanel/web';

const clientId = import.meta.env.VITE_OP_CLIENT_ID;

export const op = new OpenPanel({
  clientId,
  disabled: clientId === 'undefined' || !clientId,
  // apiUrl: 'http://localhost:3333',
  trackScreenViews: true,
  trackOutgoingLinks: true,
  trackAttributes: true,
  // sessionReplay: {
  //   enabled: true,
  // }
});
