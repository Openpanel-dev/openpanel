import { describe, expect, it } from 'bun:test';
import type { AsnInfo } from '../../../../clients/geo';
import {
  applyBotSuspicion,
  stripBotProperties,
  summarizeBotSignals,
} from './suspicion';

describe('stripBotProperties', () => {
  it('removes client-supplied __bot keys in place, keeps the rest', () => {
    const properties: Record<string, unknown> = {
      __bot: '1',
      __bot_reasons: 'forged',
      keep: 'me',
    };
    stripBotProperties(properties);
    expect(properties).toEqual({ keep: 'me' });
  });

  it('tolerates undefined properties', () => {
    expect(() => stripBotProperties(undefined)).not.toThrow();
  });
});

describe('summarizeBotSignals', () => {
  it('no signals → not a bot, empty reasons', () => {
    expect(summarizeBotSignals([])).toEqual({ reasons: '', isBot: false });
  });

  it('single category (datacenter only) → recorded but not flagged', () => {
    const result = summarizeBotSignals(['datacenter_ip:AS15169']);
    expect(result.isBot).toBe(false);
    expect(result.reasons).toBe('datacenter_ip:AS15169');
  });

  it('multiple reasons in the SAME category → still one category, not flagged', () => {
    const result = summarizeBotSignals([
      'header:missing_sec_ch_ua',
      'header:missing_sec_fetch',
      'header:missing_accept_language',
    ]);
    expect(result.isBot).toBe(false);
  });

  it('two distinct categories → flagged', () => {
    const result = summarizeBotSignals([
      'datacenter_ip:AS16509',
      'header:missing_sec_ch_ua',
    ]);
    expect(result.isBot).toBe(true);
    expect(result.reasons).toBe(
      'datacenter_ip:AS16509,header:missing_sec_ch_ua'
    );
  });
});

const HOSTING: AsnInfo = {
  asn: 16_509,
  org: 'Amazon.com, Inc.',
  isHosting: true,
};
const RESIDENTIAL: AsnInfo = { asn: 7922, org: 'Comcast', isHosting: false };

// A spoofed desktop Chrome request with none of the headers Chrome sends.
const spoofedChromeHeaders = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};
// A clean browser request.
const cleanChromeHeaders = {
  ...spoofedChromeHeaders,
  'sec-ch-ua': '"Chromium";v="120"',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'cross-site',
  'accept-language': 'en-US,en;q=0.9',
};

describe('applyBotSuspicion', () => {
  it('clean residential browser → no bot props', () => {
    const props = applyBotSuspicion(
      { foo: 'bar' },
      { asnInfo: RESIDENTIAL, headers: cleanChromeHeaders, isServer: false }
    );
    expect(props).toEqual({ foo: 'bar' });
  });

  it('datacenter IP alone → reason recorded, but NOT flagged', () => {
    const props = applyBotSuspicion(
      {},
      { asnInfo: HOSTING, headers: cleanChromeHeaders, isServer: false }
    );
    expect(props?.__bot_reasons).toBe('datacenter_ip:AS16509');
    expect(props?.__bot).toBeUndefined();
  });

  it('datacenter IP + header anomaly → flagged __bot=1', () => {
    const props = applyBotSuspicion(
      {},
      { asnInfo: HOSTING, headers: spoofedChromeHeaders, isServer: false }
    );
    expect(props?.__bot).toBe('1');
    expect(props?.__bot_reasons).toContain('datacenter_ip:AS16509');
    expect(props?.__bot_reasons).toContain('header:missing_sec_ch_ua');
  });

  it('strips client-supplied __bot / __bot_reasons (server-controlled)', () => {
    const props = applyBotSuspicion(
      { __bot: '1', __bot_reasons: 'faked_by_client', keep: 'me' },
      { asnInfo: RESIDENTIAL, headers: cleanChromeHeaders, isServer: false }
    );
    expect(props?.__bot).toBeUndefined();
    expect(props?.__bot_reasons).toBeUndefined();
    expect(props?.keep).toBe('me');
  });

  it('server-side (clientSecretAuth) traffic is never flagged, even from a datacenter', () => {
    const props = applyBotSuspicion(
      {},
      {
        asnInfo: HOSTING,
        headers: spoofedChromeHeaders,
        clientSecretAuth: true,
        isServer: false,
      }
    );
    expect(props).toEqual({});
  });

  it('isServer UA is never flagged, even from a datacenter', () => {
    const props = applyBotSuspicion(
      {},
      {
        asnInfo: HOSTING,
        headers: { 'user-agent': 'Go-http-client/1.1' },
        isServer: true,
      }
    );
    expect(props).toEqual({});
  });

  it('handles undefined properties', () => {
    const props = applyBotSuspicion(undefined, {
      asnInfo: HOSTING,
      headers: spoofedChromeHeaders,
      isServer: false,
    });
    expect(props?.__bot).toBe('1');
  });
});
