// @vitest-environment jsdom

import type { TrackHandlerPayload } from '@openpanel/web';
import { afterEach, describe, expect, it } from 'vitest';
import { shouldSendAnalyticsEvent } from './op-filter';

function screenView(properties: Record<string, unknown>): TrackHandlerPayload {
  return { type: 'track', payload: { name: 'screen_view', properties } };
}

describe('shouldSendAnalyticsEvent', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('sends ordinary page views', () => {
    expect(
      shouldSendAnalyticsEvent(
        screenView({ __path: `${window.location.origin}/login` })
      )
    ).toBe(true);
  });

  it('drops a page view of the reset-password page', () => {
    expect(
      shouldSendAnalyticsEvent(
        screenView({
          __path: `${window.location.origin}/reset-password?token=secret`,
        })
      )
    ).toBe(false);
  });

  it('drops events whose referrer is the unsubscribe page', () => {
    expect(
      shouldSendAnalyticsEvent(
        screenView({
          __path: `${window.location.origin}/login`,
          __referrer: `${window.location.origin}/unsubscribe?token=secret`,
        })
      )
    ).toBe(false);
  });

  it('drops outgoing-link events that point at the reset-password page', () => {
    expect(
      shouldSendAnalyticsEvent(
        screenView({
          __path: `${window.location.origin}/login`,
          href: `${window.location.origin}/reset-password?token=secret`,
        })
      )
    ).toBe(false);
  });

  it('drops every event while the browser is on a credential page', () => {
    window.history.replaceState(null, '', '/reset-password?token=secret');
    expect(
      shouldSendAnalyticsEvent({
        type: 'track',
        payload: { name: 'link_out', properties: {} },
      })
    ).toBe(false);
  });
});
