import { describe, expect, it } from 'vitest';
import { readAttribution, toFirstTouchProperties } from './attribution';

function cookieHeader(value: unknown) {
  return `theme=dark; op_attribution=${encodeURIComponent(JSON.stringify(value))}; other=1`;
}

describe('readAttribution', () => {
  it('is undefined without the cookie', () => {
    expect(readAttribution('')).toBeUndefined();
    expect(readAttribution('theme=dark')).toBeUndefined();
  });

  it('parses the first touch the marketing site recorded', () => {
    expect(
      readAttribution(
        cookieHeader({
          referrer: 'https://www.reddit.com/r/selfhosted/',
          landingPage: '/compare/mixpanel',
          utmSource: 'reddit',
          firstSeenAt: '2026-11-01T10:00:00.000Z',
        })
      )
    ).toEqual({
      referrer: 'https://www.reddit.com/r/selfhosted/',
      landingPage: '/compare/mixpanel',
      utmSource: 'reddit',
      firstSeenAt: '2026-11-01T10:00:00.000Z',
    });
  });

  it('ignores a cookie that is not valid attribution', () => {
    expect(readAttribution('op_attribution=not-json')).toBeUndefined();
    expect(readAttribution(cookieHeader('a string'))).toBeUndefined();
  });

  it('drops a bad field but keeps the rest of the first touch', () => {
    expect(
      readAttribution(
        cookieHeader({
          referrer: 'x'.repeat(600),
          utmSource: 'reddit',
          firstSeenAt: 'yesterday',
        })
      )
    ).toEqual({ utmSource: 'reddit' });
  });
});

describe('toFirstTouchProperties', () => {
  it('flattens the channel fields and skips empty ones', () => {
    expect(
      toFirstTouchProperties({
        referrer: 'https://news.ycombinator.com/',
        landingPage: '/',
        utmCampaign: 'launch',
        firstSeenAt: '2026-11-01T10:00:00.000Z',
      })
    ).toEqual({
      first_touch_referrer: 'https://news.ycombinator.com/',
      first_touch_landing_page: '/',
      first_touch_utm_campaign: 'launch',
    });
    expect(toFirstTouchProperties(undefined)).toEqual({});
  });
});
