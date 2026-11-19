import {
  getSubscriptionState,
  type SubscriptionStateInput,
  subscriptionBlocksDashboard,
} from '@openpanel/payments/subscription-state';
import type { Logger } from '../../../logger';
import {
  CHAT_BURST_LIMIT,
  CHAT_MESSAGES_PER_DAY,
  CHAT_TIER_EVENT_BANDS,
  type ChatLimitError,
  type ChatTier,
} from '../assistant.constants';

const SECOND = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND;
const KEY_MISSING = -2;
const KEY_WITHOUT_EXPIRY = -1;
const DATE_LENGTH = 'YYYY-MM-DD'.length;

const TIER_LABELS: Record<ChatTier, string> = {
  trial: 'free trial',
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
  unlimited: 'self-hosted',
  blocked: 'inactive',
};

export type ChatTierInput = SubscriptionStateInput & {
  subscriptionPeriodEventsLimit: number;
};

export function resolveChatTier(
  organization: ChatTierInput,
  selfHosted: boolean
): ChatTier {
  if (selfHosted) {
    return 'unlimited';
  }
  const state = getSubscriptionState(organization);
  if (state === 'self_hosted') {
    return 'unlimited';
  }
  if (state === 'trialing') {
    return 'trial';
  }
  if (subscriptionBlocksDashboard(state)) {
    return 'blocked';
  }
  const events = organization.subscriptionPeriodEventsLimit;
  if (events <= CHAT_TIER_EVENT_BANDS.starter) {
    return 'starter';
  }
  if (events <= CHAT_TIER_EVENT_BANDS.growth) {
    return 'growth';
  }
  return 'scale';
}

/** The subset of the Redis client the counters need; narrow so tests can stub it. */
export interface ChatLimitStore {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  pttl(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
}

export interface ChatLimitDeps {
  redis: ChatLimitStore;
  logger: Logger;
}

export interface ChatLimitInput {
  organizationId: string;
  userId: string;
  tier: ChatTier;
  now?: Date;
}

const dayKey = (organizationId: string, now: Date) =>
  `chat:day:${organizationId}:${now.toISOString().slice(0, DATE_LENGTH)}`;
const burstKey = (userId: string) => `chat:burst:${userId}`;

function nextUtcMidnight(now: Date): Date {
  return new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS + DAY_MS);
}

/** Fixed window: the first hit opens it; a counter that lost its expiry is re-armed so it cannot lock a caller out for good. */
async function countHit(
  store: ChatLimitStore,
  key: string,
  windowMs: number
): Promise<{ hits: number; ttlMs: number }> {
  const hits = await store.incr(key);
  let ttlMs = await store.pttl(key);
  if (hits === 1 || ttlMs === KEY_WITHOUT_EXPIRY || ttlMs === KEY_MISSING) {
    await store.pexpire(key, windowMs);
    ttlMs = windowMs;
  }
  return { hits, ttlMs };
}

function blockedError(tier: ChatTier, resetsAt: Date): ChatLimitError {
  return {
    code: 'chat_limit',
    reason: 'blocked',
    tier,
    limit: 0,
    resetsAt: resetsAt.toISOString(),
    message:
      'The AI assistant is paused until the workspace has an active plan.',
  };
}

function burstError(tier: ChatTier, ttlMs: number, now: Date): ChatLimitError {
  const seconds = Math.max(1, Math.ceil(ttlMs / SECOND));
  return {
    code: 'chat_limit',
    reason: 'burst',
    tier,
    limit: CHAT_BURST_LIMIT.max,
    resetsAt: new Date(now.getTime() + ttlMs).toISOString(),
    message: `That is a lot of messages at once. You can send the next one in ${seconds} seconds.`,
  };
}

function dailyError(tier: ChatTier, limit: number, now: Date): ChatLimitError {
  return {
    code: 'chat_limit',
    reason: 'daily',
    tier,
    limit,
    resetsAt: nextUtcMidnight(now).toISOString(),
    message: `Today's ${limit} AI messages on the ${TIER_LABELS[tier]} plan are used up. The limit resets at midnight UTC.`,
  };
}

/**
 * Counts one user turn and answers with the refusal to send, or `null` when
 * the turn may run. The burst window is checked first so a refused burst does
 * not consume a daily slot. A Redis failure lets the turn through: this guards
 * spend, not access.
 */
export async function checkChatLimits(
  deps: ChatLimitDeps,
  input: ChatLimitInput
): Promise<ChatLimitError | null> {
  const now = input.now ?? new Date();
  const { tier } = input;
  if (tier === 'blocked') {
    return blockedError(tier, now);
  }
  try {
    const burst = await countHit(
      deps.redis,
      burstKey(input.userId),
      CHAT_BURST_LIMIT.windowMs
    );
    if (burst.hits > CHAT_BURST_LIMIT.max) {
      return burstError(tier, burst.ttlMs, now);
    }
    const cap = CHAT_MESSAGES_PER_DAY[tier];
    if (cap === null) {
      return null;
    }
    const day = await countHit(
      deps.redis,
      dayKey(input.organizationId, now),
      nextUtcMidnight(now).getTime() - now.getTime()
    );
    if (day.hits > cap) {
      deps.logger.warn(
        { organizationId: input.organizationId, tier, cap, hits: day.hits },
        'chat daily limit reached'
      );
      return dailyError(tier, cap, now);
    }
    return null;
  } catch (error) {
    deps.logger.error({ err: error }, 'chat limit store unavailable');
    return null;
  }
}

/** Messages the workspace has sent today, for the billing tool. */
export async function readChatUsageToday(
  store: ChatLimitStore,
  organizationId: string,
  now = new Date()
): Promise<number> {
  const value = await store.get(dayKey(organizationId, now));
  return Number(value) || 0;
}
