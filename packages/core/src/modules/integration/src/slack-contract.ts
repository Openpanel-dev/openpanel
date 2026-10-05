// Slack's OAuth token-exchange response (`oauth.v2.access`): the wire contract
// the `/webhook/slack` callback parses before storing. Exactly `zSlackConfig`
// minus the persisted `type` tag.

import { zSlackConfig } from '../integration.constants';

export const zSlackAuthResponse = zSlackConfig.omit({ type: true });
