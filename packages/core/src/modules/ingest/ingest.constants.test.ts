import { describe, expect, test } from 'bun:test';
import {
  MAX_GROUPS_PER_EVENT,
  MAX_PROFILE_AVATAR_LENGTH,
  MAX_PROFILE_EMAIL_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  zIdentifyPayload,
  zTrackHandlerPayload,
} from './ingest.constants';

describe('zTrackHandlerPayload', () => {
  test('an ai payload has the same group bound as a track payload', () => {
    const groups = Array.from(
      { length: MAX_GROUPS_PER_EVENT + 1 },
      (_, index) => `group-${index}`
    );
    const aiPayload = (count: number) => ({
      type: 'ai',
      payload: {
        kind: 'span',
        traceId: 'trace-1',
        groups: groups.slice(0, count),
      },
    });
    expect(
      zTrackHandlerPayload.safeParse(aiPayload(MAX_GROUPS_PER_EVENT)).success
    ).toBe(true);
    expect(
      zTrackHandlerPayload.safeParse(aiPayload(MAX_GROUPS_PER_EVENT + 1))
        .success
    ).toBe(false);
  });
});

describe('zIdentifyPayload', () => {
  test('accepts a well-formed identify', () => {
    expect(
      zIdentifyPayload.safeParse({
        profileId: 'user-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        avatar: 'https://example.com/ada.png',
        properties: { plan: 'pro', nested: { seats: 3 } },
      }).success
    ).toBe(true);
  });

  test('refuses profile fields past their length caps', () => {
    for (const oversized of [
      { firstName: 'x'.repeat(MAX_PROFILE_NAME_LENGTH + 1) },
      { lastName: 'x'.repeat(MAX_PROFILE_NAME_LENGTH + 1) },
      { email: `${'x'.repeat(MAX_PROFILE_EMAIL_LENGTH)}@example.com` },
      {
        avatar: `https://example.com/${'x'.repeat(MAX_PROFILE_AVATAR_LENGTH)}`,
      },
    ]) {
      const result = zIdentifyPayload.safeParse({
        profileId: 'user-1',
        ...oversized,
      });
      expect([oversized, result.success]).toEqual([oversized, false]);
    }
  });

  test('refuses non-string profile fields and non-record properties', () => {
    for (const malformed of [
      { firstName: { nested: true } },
      { email: ['ada@example.com'] },
      { properties: ['a', 'b'] },
      { properties: 'plan=pro' },
    ]) {
      const result = zIdentifyPayload.safeParse({
        profileId: 'user-1',
        ...malformed,
      });
      expect([malformed, result.success]).toEqual([malformed, false]);
    }
  });
});
