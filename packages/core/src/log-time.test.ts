import { afterEach, describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { getLogTimestamp } from '@openpanel/shared';

const originalNow = Date.now;

afterEach(() => {
  Date.now = originalNow;
});

function at(iso: string): void {
  const instant = Date.parse(iso);
  Date.now = () => instant;
}

describe('getLogTimestamp', () => {
  it('preserves milliseconds and the UTC offset', () => {
    at('2026-01-15T12:34:56.123Z');
    assert.equal(getLogTimestamp('UTC'), '2026-01-15 12:34:56.123+00:00');
  });

  it('formats Riyadh independently of the process timezone', () => {
    at('2026-01-15T23:34:56.007Z');
    assert.equal(
      getLogTimestamp('Asia/Riyadh'),
      '2026-01-16 02:34:56.007+03:00'
    );
  });

  it('preserves fractional-hour offsets', () => {
    at('2026-01-15T12:34:56.123Z');
    assert.equal(
      getLogTimestamp('Asia/Kathmandu'),
      '2026-01-15 18:19:56.123+05:45'
    );
  });

  it('uses the daylight-saving offset for the logged instant', () => {
    at('2026-01-15T12:34:56.123Z');
    assert.equal(
      getLogTimestamp('America/New_York'),
      '2026-01-15 07:34:56.123-05:00'
    );
    at('2026-07-15T12:34:56.123Z');
    assert.equal(
      getLogTimestamp('America/New_York'),
      '2026-07-15 08:34:56.123-04:00'
    );
  });

  for (const timezone of ['', '  ', 'Invalid/Timezone', ' Asia/Riyadh ']) {
    it(`falls back to UTC for ${JSON.stringify(timezone)}`, () => {
      at('2026-01-15T12:34:56.123Z');
      assert.equal(getLogTimestamp(timezone), '2026-01-15 12:34:56.123+00:00');
    });
  }
});
