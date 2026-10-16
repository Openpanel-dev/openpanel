import { expect, test } from 'bun:test';
import { EVENTS_HEARTBEAT_STALE_MS, evaluateReadiness } from './readiness';

const NOW = 1_000_000;
const fresh = { enabled: true, lastActivityAt: NOW };

test('shutting down wins over everything else', () => {
  expect(
    evaluateReadiness({
      booting: false,
      shuttingDown: true,
      heartbeat: fresh,
      now: NOW,
    })
  ).toEqual({ ready: false, reason: 'shutting down' });
});

test('a booting process answers HTTP but is not ready', () => {
  expect(
    evaluateReadiness({
      booting: true,
      shuttingDown: false,
      heartbeat: fresh,
      now: NOW,
    })
  ).toEqual({ ready: false, reason: 'booting' });
});

test('shutting down wins over booting', () => {
  expect(
    evaluateReadiness({
      booting: true,
      shuttingDown: true,
      heartbeat: fresh,
      now: NOW,
    })
  ).toEqual({ ready: false, reason: 'shutting down' });
});

test('no events consumer on this instance skips the heartbeat check', () => {
  expect(
    evaluateReadiness({
      booting: false,
      shuttingDown: false,
      // An instance with no events consumer has the heartbeat disabled,
      // since lastActivityAt then never moves off boot time.
      heartbeat: { enabled: false, lastActivityAt: 0 },
      now: NOW,
    })
  ).toEqual({ ready: true });
});

test('a fresh consumer heartbeat is ready', () => {
  expect(
    evaluateReadiness({
      booting: false,
      shuttingDown: false,
      heartbeat: fresh,
      now: NOW,
    })
  ).toEqual({ ready: true });
});

test('a stale consumer heartbeat is 503 with the numbers that explain it', () => {
  const idleMs = EVENTS_HEARTBEAT_STALE_MS + 1;
  expect(
    evaluateReadiness({
      booting: false,
      shuttingDown: false,
      heartbeat: { enabled: true, lastActivityAt: NOW - idleMs },
      now: NOW,
    })
  ).toEqual({
    ready: false,
    reason: 'events consumer heartbeat stale',
    idleMs,
    thresholdMs: EVENTS_HEARTBEAT_STALE_MS,
  });
});

test('exactly at the threshold is still ready — the comparison is >', () => {
  expect(
    evaluateReadiness({
      booting: false,
      shuttingDown: false,
      heartbeat: {
        enabled: true,
        lastActivityAt: NOW - EVENTS_HEARTBEAT_STALE_MS,
      },
      now: NOW,
    })
  ).toEqual({ ready: true });
});
