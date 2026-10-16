// The `clients` handle on `AppDeps`: the functions already exported from
// `src/clients/`, gathered so a service reaches an outbound client through its
// scoped `Ctx`. Nothing is constructed here (the geo readers open their mmdb
// lazily). No `slack` or `ai` member: a client handle cannot reach up into a
// module, and those transports live in the module that calls each.

import { sendEmail } from './email';
import { getAsnInfo, getGeoLocation } from './geo';
import { sendDiscordNotification } from './integrations/discord';

export interface ServiceClients {
  geo: {
    getGeoLocation: typeof getGeoLocation;
    getAsnInfo: typeof getAsnInfo;
  };
  email: {
    sendEmail: typeof sendEmail;
  };
  discord: {
    sendDiscordNotification: typeof sendDiscordNotification;
  };
}

export function createClients(): ServiceClients {
  return {
    geo: { getGeoLocation, getAsnInfo },
    email: { sendEmail },
    discord: { sendDiscordNotification },
  };
}
