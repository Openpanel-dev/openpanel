/**
 * Tests for bot detection against the generated `bots.ts` list.
 *
 * These exercise the pure `detectBot` matcher (no Redis), guarding two things:
 *   1. Legitimate backend/runtime traffic (e.g. `node`, `Node.js`) is NOT a bot.
 *      The upstream device-detector list flags these via its "Generic Bot"
 *      pattern; we strip them at generation time (scripts/get-bots.ts), so this
 *      test fails loudly if a regen ever re-introduces the false positive.
 *   2. Genuine bots are still detected — we only removed the allowlisted
 *      identifiers, not the rest of the bot patterns.
 */

import { describe, expect, it } from 'vitest';
import { detectBot } from './index';

describe('detectBot', () => {
  describe('does not flag legitimate runtime/client user agents', () => {
    // The exact identifiers the upstream "Generic Bot" pattern caught.
    const allowlisted = ['node', 'Node.js'];
    // Common server-side HTTP clients that must always pass through.
    const backendClients = [
      'undici',
      'axios/1.6.0',
      'node-fetch/2.6.7',
      'got (https://github.com/sindresorhus/got)',
      'PostmanRuntime/7.0',
    ];

    for (const ua of [...allowlisted, ...backendClients]) {
      it(`treats "${ua}" as a real user`, () => {
        expect(detectBot(ua)).toBeNull();
      });
    }
  });

  describe('still flags real bots', () => {
    const realBots = [
      'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
      // Heuristic patterns (case-sensitive, as upstream defines them).
      'some-crawler/1.0',
      'a-scraper-bot',
    ];

    for (const ua of realBots) {
      it(`detects "${ua}"`, () => {
        expect(detectBot(ua)).not.toBeNull();
      });
    }

    // Genuinely-suspicious bare tokens that live in the SAME "Generic Bot"
    // alternation we edited — proves we surgically removed only the allowlisted
    // identifiers and left the rest of that pattern working.
    for (const ua of ['ZmEu', 'Zeus']) {
      it(`still detects bare scanner token "${ua}" as Generic Bot`, () => {
        expect(detectBot(ua)?.name).toBe('Generic Bot');
      });
    }
  });
});
