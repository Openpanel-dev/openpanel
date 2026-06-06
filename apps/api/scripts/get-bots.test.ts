/**
 * Tests for the bot-list generator's allowlist surgery.
 *
 * `stripAllowlistedTokens` removes legitimate runtime/client identifiers from
 * the upstream device-detector "Generic Bot" patterns so that regenerating the
 * list (`pnpm gen:bots`) can never re-introduce false positives for backend
 * traffic. These run without a network call (main() is guarded on direct run).
 */

import { describe, expect, it } from 'vitest';
import { ALLOWLISTED_BOT_UA_TOKENS, stripAllowlistedTokens } from './get-bots';

describe('stripAllowlistedTokens', () => {
  it('removes allowlisted identifiers from an anchored exact-match group', () => {
    const input = '^(?:chrome|node|Node\\.js|url|Zeus|ZmEu)$';
    expect(stripAllowlistedTokens(input)).toBe('^(?:chrome|url|Zeus|ZmEu)$');
  });

  it('preserves the genuinely-suspicious branches', () => {
    const result = stripAllowlistedTokens(
      '^(?:chrome|node|Node\\.js|Zeus|ZmEu)$',
    );
    expect(result).toContain('Zeus');
    expect(result).toContain('ZmEu');
    expect(result).toContain('chrome');
  });

  it('strips the tokens when the group sits inside a larger alternation', () => {
    const input = '^xenu|^(?:chrome|node|Node\\.js|url)$|OnlyScans';
    const result = stripAllowlistedTokens(input);
    expect(result).toBe('^xenu|^(?:chrome|url)$|OnlyScans');
    expect(result).not.toContain('|node|');
    expect(result).not.toContain('Node\\.js');
  });

  it('leaves groups without allowlisted tokens untouched', () => {
    const input = '^(?:chrome|firefox|Zeus)$';
    expect(stripAllowlistedTokens(input)).toBe(input);
  });

  it('drops an emptied group together with its trailing pipe (no `||`)', () => {
    const input = '^(?:node|Node\\.js)$|OnlyScans';
    const result = stripAllowlistedTokens(input);
    expect(result).toBe('OnlyScans');
    expect(result).not.toContain('||');
  });

  it('does not touch plain (non-anchored) patterns', () => {
    const input = 'AhrefsBot|node-fetch|crawler';
    expect(stripAllowlistedTokens(input)).toBe(input);
  });

  it('every allowlisted token is escaped exactly as it appears in a branch', () => {
    // Guards against e.g. listing `Node.js` (unescaped) which would never match
    // the upstream `Node\.js` branch and silently fail to strip anything.
    for (const token of ALLOWLISTED_BOT_UA_TOKENS) {
      const group = `^(?:${token}|RealBot)$`;
      expect(stripAllowlistedTokens(group)).toBe('^(?:RealBot)$');
    }
  });
});
