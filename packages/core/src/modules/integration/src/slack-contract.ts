// Slack's OAuth token-exchange response (`oauth.v2.access`) — the wire
// contract `integration.routes.ts`'s `/webhook/slack` callback parses the
// JSON it gets back from Slack against, before it's ever stored as a
// `zSlackConfig`. Not integration config a frontend form validates against,
// so it doesn't belong in `integration.constants.ts` even though it's
// zod-only (constants are for isomorphic vocabulary, not third-party API
// contracts) — it's exactly `zSlackConfig` minus the persisted `type` tag.

import { zSlackConfig } from '../integration.constants';

export const zSlackAuthResponse = zSlackConfig.omit({ type: true });
