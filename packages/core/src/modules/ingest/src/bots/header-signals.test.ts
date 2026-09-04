import { describe, expect, it } from 'bun:test';
import { detectHeaderAnomalies } from './header-signals';

// Representative UA strings.
const UA = {
  chromeDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  edgeDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  firefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  chromeIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
  curl: 'curl/8.4.0',
  goClient: 'Go-http-client/1.1',
};

// Headers a real browser fetch/sendBeacon request carries.
const realBrowserHeaders = {
  'sec-ch-ua': '"Chromium";v="120"',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'cross-site',
  'accept-language': 'en-US,en;q=0.9',
};

describe('detectHeaderAnomalies', () => {
  describe('does not flag legitimate browser traffic', () => {
    it('clean desktop Chrome → no reasons', () => {
      expect(
        detectHeaderAnomalies({
          'user-agent': UA.chromeDesktop,
          ...realBrowserHeaders,
        })
      ).toEqual([]);
    });

    it('Firefox (no sec-ch-ua, but sends everything else) → no reasons', () => {
      expect(
        detectHeaderAnomalies({
          'user-agent': UA.firefox,
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'cross-site',
          'accept-language': 'en-US,en;q=0.5',
        })
      ).toEqual([]);
    });

    it('Safari (no sec-ch-ua, WebKit) → no reasons', () => {
      expect(
        detectHeaderAnomalies({
          'user-agent': UA.safariMac,
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'cross-site',
          'accept-language': 'en-US,en;q=0.9',
        })
      ).toEqual([]);
    });

    it('iOS Chrome / CriOS (WebKit, no sec-ch-ua) → not flagged for sec-ch-ua', () => {
      const reasons = detectHeaderAnomalies({
        'user-agent': UA.chromeIOS,
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'accept-language': 'en-US,en;q=0.9',
      });
      expect(reasons).not.toContain('header:missing_sec_ch_ua');
      expect(reasons).toEqual([]);
    });
  });

  describe('does not apply to non-browser clients', () => {
    for (const [name, ua] of Object.entries({
      curl: UA.curl,
      go: UA.goClient,
    })) {
      it(`${name} → no reasons (handled by isServer/auth, not headers)`, () => {
        expect(detectHeaderAnomalies({ 'user-agent': ua })).toEqual([]);
      });
    }

    it('missing UA entirely → no reasons', () => {
      expect(detectHeaderAnomalies({})).toEqual([]);
    });
  });

  describe('flags spoofed Chromium user agents', () => {
    it('Chrome UA with no sec-ch-ua → missing_sec_ch_ua', () => {
      const reasons = detectHeaderAnomalies({
        'user-agent': UA.chromeDesktop,
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'accept-language': 'en-US',
      });
      expect(reasons).toContain('header:missing_sec_ch_ua');
    });

    it('Edge UA with no sec-ch-ua → missing_sec_ch_ua', () => {
      const reasons = detectHeaderAnomalies({
        'user-agent': UA.edgeDesktop,
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'accept-language': 'en-US',
      });
      expect(reasons).toContain('header:missing_sec_ch_ua');
    });

    it('Android Chrome with no sec-ch-ua → missing_sec_ch_ua', () => {
      const reasons = detectHeaderAnomalies({
        'user-agent': UA.chromeAndroid,
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'accept-language': 'en-US',
      });
      expect(reasons).toContain('header:missing_sec_ch_ua');
    });

    it('bare Chrome UA with no browser headers at all → multiple reasons', () => {
      const reasons = detectHeaderAnomalies({ 'user-agent': UA.chromeDesktop });
      expect(reasons).toContain('header:missing_sec_ch_ua');
      expect(reasons).toContain('header:missing_sec_fetch');
      expect(reasons).toContain('header:missing_accept_language');
    });
  });

  describe('individual header rules', () => {
    it('missing both sec-fetch headers → missing_sec_fetch', () => {
      const reasons = detectHeaderAnomalies({
        'user-agent': UA.firefox,
        'accept-language': 'en-US',
      });
      expect(reasons).toContain('header:missing_sec_fetch');
    });

    it('one sec-fetch header present → no missing_sec_fetch', () => {
      const reasons = detectHeaderAnomalies({
        'user-agent': UA.firefox,
        'sec-fetch-site': 'cross-site',
        'accept-language': 'en-US',
      });
      expect(reasons).not.toContain('header:missing_sec_fetch');
    });

    it('empty-string header counts as absent', () => {
      const reasons = detectHeaderAnomalies({
        'user-agent': UA.firefox,
        'sec-fetch-mode': '',
        'sec-fetch-site': '   ',
        'accept-language': 'en',
      });
      expect(reasons).toContain('header:missing_sec_fetch');
    });
  });
});
