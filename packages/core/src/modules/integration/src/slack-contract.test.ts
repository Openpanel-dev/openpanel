import { describe, expect, it } from 'bun:test';
import { zSlackAuthResponse } from './slack-contract';

const VALID_RESPONSE = {
  ok: true,
  app_id: 'A1',
  authed_user: { id: 'U1' },
  scope: 'incoming-webhook,chat:write',
  token_type: 'bot',
  access_token: 'xoxb-1',
  bot_user_id: 'B1',
  team: { id: 'T1', name: 'Team' },
  incoming_webhook: {
    channel: '#general',
    channel_id: 'C1',
    configuration_url: 'https://slack.example/config',
    url: 'https://hooks.slack.example/services/1',
  },
};

describe('zSlackAuthResponse', () => {
  it('accepts a real oauth.v2.access response (no `type` tag on the wire)', () => {
    expect(zSlackAuthResponse.safeParse(VALID_RESPONSE).success).toBe(true);
  });

  it('rejects a response missing the incoming_webhook grant', () => {
    const { incoming_webhook: _drop, ...rest } = VALID_RESPONSE;
    expect(zSlackAuthResponse.safeParse(rest).success).toBe(false);
  });
});
