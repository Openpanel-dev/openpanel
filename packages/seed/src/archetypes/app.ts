// Acme App: a native social app (React Native SDK). Most users sign up on
// the first open and are identified from then on. Funnels: onboarding
// (app_opened → onboarding → signup → notification permission → first post)
// and monetization (paywall_viewed → trial_started → subscription_started).
// Cohort-worthy: platform, notifications granted, premium, has posted.

import { newPerson } from '../data/people';
import type { Visitor } from '../model';
import type { Rng } from '../rng';
import type { Archetype, Journey } from './archetype';

const SCREENS = {
  home: ['Home', 'Home'],
  feed: ['Feed', 'Feed'],
  post: ['Post', 'Post'],
  create: ['CreatePost', 'New post'],
  profile: ['Profile', 'Profile'],
  settings: ['Settings', 'Settings'],
  onboarding: ['Onboarding', 'Onboarding'],
  paywall: ['Paywall', 'Go premium'],
  search: ['Search', 'Search'],
} as const;

const POST_CATEGORIES = [
  'travel',
  'food',
  'fitness',
  'tech',
  'music',
  'art',
  'pets',
] as const;
const MEDIA = ['photo', 'video', 'text'] as const;
const SHARE_CHANNELS = [
  'message',
  'copy_link',
  'instagram',
  'external',
] as const;
const PUSH_CAMPAIGNS = [
  'daily-digest',
  'new-follower',
  'trending',
  'comment-reply',
] as const;
const OPEN_SOURCES = ['icon', 'push', 'deeplink', 'widget'] as const;
const APP_VERSIONS = ['3.4.0', '3.4.1', '3.5.0', '3.5.2', '3.6.0'] as const;
const PAYWALL_TRIGGERS = [
  'post_limit',
  'hd_upload',
  'analytics',
  'settings',
] as const;
/** Post ids are drawn from a large pool so `post_viewed.post_id` breaks down like a real feed. */
const POST_POOL = 50_000;

const IDENTIFIED_SHARE = 0.85;
const SIGNUP_COMPLETED_CHANCE = 0.8;
const NOTIFICATION_GRANTED_CHANCE = 0.55;
const PUSH_OPEN_CHANCE = 0.18;
const POST_CHANCE = 0.55;
const LIKE_CHANCE = 0.5;
const COMMENT_CHANCE = 0.12;
const SHARE_CHANCE = 0.08;
const CREATE_POST_CHANCE = 0.12;
const SEARCH_CHANCE = 0.15;
const PAYWALL_CHANCE = 0.06;
const TRIAL_CHANCE = 0.35;
const SUBSCRIBE_CHANCE = 0.5;
const PREMIUM_MONTHLY_PRICE = 5;
const PREMIUM_YEARLY_PRICE = 40;

interface AppState {
  onboarded?: boolean;
  notifications?: boolean;
  posts?: number;
  trial?: boolean;
  premium?: boolean;
  appVersion?: string;
}

function stateOf(visitor: Visitor): AppState {
  return visitor.state as AppState;
}

function platformOf(visitor: Visitor): string {
  return visitor.device.os === 'iOS' ? 'ios' : 'android';
}

function onboarding(
  rng: Rng,
  journey: Journey,
  visitor: Visitor,
  state: AppState
): boolean {
  journey.view(...SCREENS.onboarding, { step: 1 });
  journey.event('onboarding_step_completed', { step: 1, name: 'welcome' });
  journey.view(...SCREENS.onboarding, { step: 2 });
  journey.event('onboarding_step_completed', {
    step: 2,
    name: 'interests',
    interests: rng.int(1, 5),
  });
  if (visitor.person && rng.chance(SIGNUP_COMPLETED_CHANCE)) {
    const method = rng.one(['apple', 'google', 'email']);
    journey.event('signup_started', { method });
    journey.identify(visitor.person);
    journey.event('signup_completed', { method, ...visitor.person.properties });
  } else if (visitor.person) {
    return false;
  } else {
    journey.event('signup_skipped');
  }
  const granted = rng.chance(NOTIFICATION_GRANTED_CHANCE);
  journey.event('notification_permission', { granted });
  state.notifications = granted;
  state.onboarded = true;
  return true;
}

function feed(rng: Rng, journey: Journey, state: AppState): void {
  journey.view(...SCREENS.feed);
  const scrolls = rng.int(1, 6);
  for (let i = 0; i < scrolls; i++) {
    if (!rng.chance(POST_CHANCE)) {
      continue;
    }
    const postId = `p_${rng.int(1, POST_POOL)}`;
    const category = rng.one(POST_CATEGORIES);
    journey.view(...SCREENS.post, { post_id: postId });
    journey.event('post_viewed', {
      post_id: postId,
      category,
      media: rng.one(MEDIA),
      author_id: `usr_${rng.hex(6)}`,
    });
    if (rng.chance(LIKE_CHANCE)) {
      journey.event('post_liked', { post_id: postId, category });
    }
    if (rng.chance(COMMENT_CHANCE)) {
      journey.event('comment_posted', {
        post_id: postId,
        length: rng.int(5, 200),
      });
    }
    if (rng.chance(SHARE_CHANCE)) {
      journey.event('post_shared', {
        post_id: postId,
        channel: rng.one(SHARE_CHANNELS),
      });
    }
  }
  if (rng.chance(SEARCH_CHANCE)) {
    journey.view(...SCREENS.search);
    journey.event('search', {
      query: rng.one(POST_CATEGORIES),
      results: rng.int(0, 50),
    });
  }
  if (rng.chance(CREATE_POST_CHANCE)) {
    journey.view(...SCREENS.create);
    const media = rng.one(MEDIA);
    journey.event('post_created', {
      media,
      category: rng.one(POST_CATEGORIES),
      first_post: (state.posts ?? 0) === 0,
    });
    state.posts = (state.posts ?? 0) + 1;
  }
}

function monetization(rng: Rng, journey: Journey, state: AppState): void {
  if (state.premium || !rng.chance(PAYWALL_CHANCE)) {
    return;
  }
  const trigger = rng.one(PAYWALL_TRIGGERS);
  journey.view(...SCREENS.paywall, { trigger });
  journey.event('paywall_viewed', { trigger });
  if (!state.trial) {
    if (!rng.chance(TRIAL_CHANCE)) {
      return;
    }
    journey.event('trial_started', { plan: 'premium', days: 7, trigger });
    state.trial = true;
    return;
  }
  if (!rng.chance(SUBSCRIBE_CHANCE)) {
    return;
  }
  const interval = rng.one(['monthly', 'yearly']);
  const price =
    interval === 'yearly' ? PREMIUM_YEARLY_PRICE : PREMIUM_MONTHLY_PRICE;
  journey.event('subscription_started', {
    plan: 'premium',
    interval,
    price,
    trigger,
  });
  journey.revenue(price, { plan: 'premium', interval });
  state.premium = true;
}

export const appArchetype: Archetype = {
  id: 'app',
  projectName: 'Acme App',
  origin: '',
  domain: null,
  types: ['app'],
  sdk: { name: 'react-native', version: '1.0.3' },
  shape: {
    hourly: [
      2, 1.2, 0.7, 0.4, 0.3, 0.5, 1.5, 3.5, 4, 3.5, 3, 3.5, 4.5, 4, 3.5, 3.5, 4,
      5, 6, 7, 7.5, 7, 5.5, 3.5,
    ],
    dayOfWeek: [1.2, 0.95, 0.9, 0.9, 0.95, 1.05, 1.25],
    trendPerWeek: 0.03,
    spikeChance: 0.03,
    dipChance: 0.02,
    spikeRange: [1.5, 3],
    dipRange: [0.5, 0.8],
  },
  trafficShare: 0.1,
  returningShare: 0.65,
  retention: { sameDay: 0.45, day1: 0.45, day7: 0.25, day30: 0.15 },
  stickiness(visitor) {
    const state = stateOf(visitor);
    let value = visitor.identified ? 1.5 : 0.7;
    if (state.notifications) {
      value += 1;
    }
    if (state.premium) {
      value += 1.5;
    }
    if ((state.posts ?? 0) > 0) {
      value += 1;
    }
    return value;
  },
  mobileShare: 1,
  deviceClass: 'native',
  referrers: [{ weight: 1, value: null }],
  campaignChance: 0,
  dwellMedianSeconds: 12,
  utcOffsetHours: -5,
  newPerson(rng) {
    if (!rng.chance(IDENTIFIED_SHARE)) {
      return null;
    }
    const person = newPerson(rng, { business: false });
    person.properties = { plan: 'free', interests: String(rng.int(1, 5)) };
    return person;
  },
  identity:
    '~85% sign up during onboarding and are identified from then on; the rest stay anonymous devices.',
  conversions: ['signup_completed', 'subscription_started', 'post_created'],
  funnels: [
    {
      name: 'Onboarding',
      steps: [
        'app_opened',
        'onboarding_step_completed',
        'signup_completed',
        'notification_permission',
        'post_created',
      ],
      breakdowns: ['platform', 'app_version', 'method', 'granted'],
    },
    {
      name: 'Premium',
      steps: ['paywall_viewed', 'trial_started', 'subscription_started'],
      breakdowns: ['trigger', 'platform', 'interval'],
    },
  ],
  journey(rng, journey, visitor) {
    const state = stateOf(visitor);
    state.appVersion ??= rng.one(APP_VERSIONS);
    const platform = platformOf(visitor);
    const common = { platform, app_version: state.appVersion };

    if (state.notifications && rng.chance(PUSH_OPEN_CHANCE)) {
      journey.event('push_opened', {
        campaign: rng.one(PUSH_CAMPAIGNS),
        ...common,
      });
      journey.event('app_opened', { source: 'push', ...common });
    } else {
      journey.event('app_opened', {
        source: rng.one(OPEN_SOURCES.filter((source) => source !== 'push')),
        ...common,
      });
    }
    journey.view(...SCREENS.home);

    if (!(state.onboarded || onboarding(rng, journey, visitor, state))) {
      return;
    }
    feed(rng, journey, state);
    if (rng.chance(0.2)) {
      journey.view(...SCREENS.profile);
    }
    if (rng.chance(0.08)) {
      journey.view(...SCREENS.settings);
    }
    if (visitor.identified) {
      monetization(rng, journey, state);
      if (visitor.person) {
        visitor.person.properties.plan = state.premium
          ? 'premium'
          : state.trial
            ? 'trial'
            : 'free';
        visitor.person.properties.platform = platform;
        visitor.person.properties.notifications = String(
          state.notifications ?? false
        );
      }
    }
  },
};
