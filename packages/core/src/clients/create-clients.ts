// The `clients` handle on `AppDeps` (TARGET_ARCHITECTURE §7: "AppDeps is built
// ONCE in main.ts (db, ch, redis, clients, buffers, producers, base logger,
// config flags)"), built at M9-004 when main.ts became the only entrypoint.
//
// It is a NAMING of what already exists under `src/clients/`, not a new
// abstraction: every member below is the exact function this package already
// exports, gathered so a service can reach an outbound client through its
// scoped `Ctx` instead of importing the module directly. Nothing is
// constructed here — the geo readers open their mmdb lazily and the email /
// Slack / Discord transports read their own credentials — so building it
// costs one object literal per process.
//
// The modules under `src/modules/**` still import these functions directly.
// Repointing them onto `ctx.clients` is the TECH_DEBT §4 wave (after P9,
// before P12's grep gates); this handle is what that wave repoints ONTO.

import { enrichInsights } from './ai/enrich';
import { generateInsightExplanation } from './ai/explain';
import { generateWeeklyNarrative } from './ai/narrative';
import { sendEmail } from './email';
import { getAsnInfo, getGeoLocation } from './geo';
import { sendDiscordNotification } from './integrations/discord';
import {
  getSlackInstallUrl,
  sendSlackNotification,
} from './integrations/slack';

export interface ServiceClients {
  geo: {
    getGeoLocation: typeof getGeoLocation;
    getAsnInfo: typeof getAsnInfo;
  };
  email: {
    sendEmail: typeof sendEmail;
  };
  slack: {
    sendSlackNotification: typeof sendSlackNotification;
    getSlackInstallUrl: typeof getSlackInstallUrl;
  };
  discord: {
    sendDiscordNotification: typeof sendDiscordNotification;
  };
  ai: {
    enrichInsights: typeof enrichInsights;
    generateInsightExplanation: typeof generateInsightExplanation;
    generateWeeklyNarrative: typeof generateWeeklyNarrative;
  };
}

export function createClients(): ServiceClients {
  return {
    geo: { getGeoLocation, getAsnInfo },
    email: { sendEmail },
    slack: { sendSlackNotification, getSlackInstallUrl },
    discord: { sendDiscordNotification },
    ai: {
      enrichInsights,
      generateInsightExplanation,
      generateWeeklyNarrative,
    },
  };
}
