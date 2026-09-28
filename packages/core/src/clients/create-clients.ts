// The `clients` handle on `AppDeps` (TARGET_ARCHITECTURE §7: "AppDeps is built
// ONCE in main.ts (db, ch, redis, clients, buffers, producers, base logger,
// config flags)"), built at M9-004 when main.ts became the only entrypoint.
//
// It is a NAMING of what already exists under `src/clients/`, not a new
// abstraction: every member below is the exact function this package already
// exports, gathered so a service can reach an outbound client through its
// scoped `Ctx` instead of importing the module directly. Nothing is constructed
// here — the geo readers open their mmdb lazily and the email / Discord
// transports read their own credentials — so building it costs one object
// literal per process.
//
// Removed the `slack` and `ai` members: those transports moved into the single
// module that calls each (ADR-022 A2), and a client handle cannot reach up into
// a module. Nothing read either member.

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
