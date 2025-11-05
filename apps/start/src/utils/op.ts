import { OpenPanel } from '@openpanel/web';

const clientId = import.meta.env.VITE_OP_CLIENT_ID;

const createOpInstance = () => {
  if (!clientId || clientId === 'undefined') {
    return new Proxy({} as OpenPanel, {
      get: () => () => {},
    });
  }

  return new OpenPanel({
    clientId,
    trackScreenViews: true,
    trackOutgoingLinks: true,
    trackAttributes: true,
  });
};

export const op = createOpInstance();
