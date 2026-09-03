// Combines the individual bot signals into a single verdict for an event, and
// applies it to the event's properties.
//
// Each reason is namespaced `<category>:<detail>` (e.g. `datacenter_ip:AS15169`,
// `header:missing_sec_ch_ua`). We flag an event (`__bot=1`) only when at least
// two DISTINCT categories fire — a conservative threshold that avoids
// mislabeling legitimate users who trip a single heuristic (e.g. a corporate
// VPN egressing from a datacenter IP, or an old browser missing a header).
// Multiple reasons within the same category (two header anomalies) count once,
// so a single spoofed request can't inflate itself over the threshold.

import type { AsnInfo } from '@openpanel/core';
import { detectHeaderAnomalies } from './header-signals';

export const BOT_CATEGORY_THRESHOLD = 2;

export interface BotSuspicion {
  // Comma-joined reasons, safe to store in a ClickHouse Map(String,String)
  // value. Empty string when there are no signals.
  reasons: string;
  // True when >= BOT_CATEGORY_THRESHOLD distinct categories fired.
  isBot: boolean;
}

export function summarizeBotSignals(reasons: string[]): BotSuspicion {
  const categories = new Set(reasons.map((reason) => reason.split(':')[0]));
  return {
    reasons: reasons.join(','),
    isBot: categories.size >= BOT_CATEGORY_THRESHOLD,
  };
}

interface ApplyBotSuspicionOptions {
  asnInfo: AsnInfo;
  headers: Record<string, string | string[] | undefined>;
  // Server-side SDK auth — trusted first-party traffic, never flagged.
  clientSecretAuth?: boolean;
  // Non-browser / server-shaped user agent — trusted, never flagged.
  isServer: boolean;
}

type EventProperties = Record<string, unknown> | undefined;

// `__bot` / `__bot_reasons` are authoritative server-side. Drop any
// client-supplied values wherever properties enter the system (events AND
// profiles), so a client can never smuggle a forged verdict into storage.
export function stripBotProperties(properties: EventProperties): void {
  if (properties) {
    delete properties.__bot;
    delete properties.__bot_reasons;
  }
}

// Annotate an event's properties with bot-suspicion signals WITHOUT blocking it.
// Writes two server-controlled properties: `__bot_reasons` (comma-joined
// granular signals, whenever any fired) and `__bot='1'` (only when the
// conservative multi-category threshold is met). Any client-supplied `__bot*`
// values are always stripped — these keys are authoritative server-side.
// Returns the (possibly newly-created) properties object for the caller to
// assign back.
export function applyBotSuspicion(
  properties: EventProperties,
  { asnInfo, headers, clientSecretAuth, isServer }: ApplyBotSuspicionOptions
): EventProperties {
  stripBotProperties(properties);

  if (clientSecretAuth || isServer) {
    return properties;
  }

  const reasons: string[] = [];
  if (asnInfo.isHosting) {
    reasons.push(`datacenter_ip:AS${asnInfo.asn ?? 'unknown'}`);
  }
  reasons.push(...detectHeaderAnomalies(headers));

  if (reasons.length === 0) {
    return properties;
  }

  const { reasons: reasonsValue, isBot } = summarizeBotSignals(reasons);
  const next = properties ?? {};
  next.__bot_reasons = reasonsValue;
  if (isBot) {
    next.__bot = '1';
  }
  return next;
}
