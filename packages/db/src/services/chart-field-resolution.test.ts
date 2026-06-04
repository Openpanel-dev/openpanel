/**
 * Unit tests for the event-field resolution helpers.
 *
 * Background — these helpers exist because the chart, funnel, and conversion
 * services used to inline whatever field name the dashboard sent (saved
 * report, autocomplete picker, raw API call) directly into SQL. That worked
 * for the common case but produced UNKNOWN_IDENTIFIER errors when:
 *
 *  - older clients sent camelCase names (`referrerName`) that don't match
 *    the snake_case ClickHouse schema;
 *  - users picked utm_* in the property filter UI without realising those
 *    live in the `properties` map on the events table;
 *  - a saved report referenced a custom property (`temple_name`) as if it
 *    were a top-level column.
 *
 * All five errors logged in HyperDX 2026-05-14 → 2026-05-17 are covered here.
 */
import { describe, expect, it } from 'vitest';
import {
  isKnownEventField,
  normalizeEventField,
} from './chart.service';

describe('normalizeEventField', () => {
  it('rewrites camelCase aliases to their snake_case columns', () => {
    expect(normalizeEventField('referrerName')).toBe('referrer_name');
    expect(normalizeEventField('referrerType')).toBe('referrer_type');
    expect(normalizeEventField('sessionId')).toBe('session_id');
    expect(normalizeEventField('deviceId')).toBe('device_id');
    expect(normalizeEventField('osVersion')).toBe('os_version');
    expect(normalizeEventField('browserVersion')).toBe('browser_version');
  });

  it('routes bare utm_* names into the properties.__query.* form', () => {
    expect(normalizeEventField('utm_source')).toBe(
      'properties.__query.utm_source',
    );
    expect(normalizeEventField('utm_medium')).toBe(
      'properties.__query.utm_medium',
    );
    expect(normalizeEventField('utm_campaign')).toBe(
      'properties.__query.utm_campaign',
    );
  });

  it('passes through canonical names unchanged', () => {
    expect(normalizeEventField('referrer_name')).toBe('referrer_name');
    expect(normalizeEventField('country')).toBe('country');
    expect(normalizeEventField('path')).toBe('path');
    expect(normalizeEventField('properties.foo')).toBe('properties.foo');
    expect(normalizeEventField('profile.email')).toBe('profile.email');
    expect(normalizeEventField('group.plan')).toBe('group.plan');
    expect(normalizeEventField('has_profile')).toBe('has_profile');
  });

  it('returns unknown names unchanged so callers can detect them', () => {
    expect(normalizeEventField('temple_name')).toBe('temple_name');
    expect(normalizeEventField('totally_made_up')).toBe('totally_made_up');
  });
});

describe('isKnownEventField', () => {
  it('accepts top-level events columns', () => {
    expect(isKnownEventField('country')).toBe(true);
    expect(isKnownEventField('path')).toBe(true);
    expect(isKnownEventField('referrer_name')).toBe(true);
    expect(isKnownEventField('os')).toBe(true);
    expect(isKnownEventField('revenue')).toBe(true);
  });

  it('accepts camelCase aliases via normalization', () => {
    expect(isKnownEventField('referrerName')).toBe(true);
    expect(isKnownEventField('sessionId')).toBe(true);
  });

  it('accepts bare utm_* (routed through properties)', () => {
    expect(isKnownEventField('utm_source')).toBe(true);
    expect(isKnownEventField('utm_campaign')).toBe(true);
  });

  it('accepts properties / profile / group / has_profile paths', () => {
    expect(isKnownEventField('properties.foo')).toBe(true);
    expect(isKnownEventField('profile.email')).toBe(true);
    expect(isKnownEventField('group.plan')).toBe(true);
    expect(isKnownEventField('has_profile')).toBe(true);
  });

  it('accepts cohort breakdowns (all-cohorts and single-cohort)', () => {
    expect(isKnownEventField('cohort')).toBe(true);
    expect(isKnownEventField('cohort:abc-123')).toBe(true);
  });

  it('rejects unknown identifiers — these used to leak into SQL', () => {
    // HyperDX regression: psycalc-app funnel emitted `cohort as b_0` even
    // though the funnel doesn't support all-cohorts. The funnel-side filter
    // is what blocks it now; this asserts the breakdown-name check itself
    // still distinguishes properties (`properties.foo`) from raw identifiers
    // by accepting both — the funnel/chart drop logic relies on the cohort
    // case being valid at this layer.
    expect(isKnownEventField('temple_name')).toBe(false);
    expect(isKnownEventField('totally_made_up_column')).toBe(false);
    expect(isKnownEventField('')).toBe(false);
  });
});
