import { OpenPanel } from '@openpanel/web';

export const op = new OpenPanel({
  clientId: import.meta.env.VITE_OP_CLIENT_ID,
  trackScreenViews: true,
  trackOutgoingLinks: true,
  trackAttributes: true,
});
