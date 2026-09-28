// The `clients` handle on `AppDeps`: a NAMING of what already exists under
// `src/clients/`, not a new abstraction — every member below is the exact
// function this package already exports, gathered so a service can reach an
// outbound client through its scoped `Ctx` instead of importing the module
// directly. Nothing is constructed here — the geo readers open their mmdb
// lazily and the email / Discord transports read their own credentials — so
// building it costs one object literal per process.
//
// No `slack` or `ai` member here: a client handle cannot reach up into a
// module, and those transports live in the single module that calls each.

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
