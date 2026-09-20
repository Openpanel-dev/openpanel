// Acme SaaS: a logged-in product. Everyone identifies on the first session,
// so retention is real. Funnels: activation (signup → project → SDK → first
// event) spread over visits, and monetization (pricing → checkout →
// subscription). Cohort-worthy behaviours: invited a teammate, exported,
// connected an integration, paid plan.

import { newPerson } from '../data/people';
import { REFERRERS } from '../data/referrers';
import type { Person, Visitor } from '../model';
import type { Rng, Weighted } from '../rng';
import type { Archetype, Journey } from './archetype';

interface Plan {
  name: string;
  price: number;
}

const PLANS: readonly Weighted<Plan>[] = [
  { weight: 70, value: { name: 'free', price: 0 } },
  { weight: 18, value: { name: 'pro', price: 29 } },
  { weight: 9, value: { name: 'team', price: 99 } },
  { weight: 3, value: { name: 'enterprise', price: 299 } },
];
const PAID_PLANS = PLANS.filter((plan) => plan.value.price > 0);
const ROLES = ['founder', 'engineer', 'product', 'marketing', 'data'] as const;
const COMPANY_SIZES = [
  '1',
  '2-10',
  '11-50',
  '51-200',
  '201-1000',
  '1000+',
] as const;
const SIGNUP_SOURCES = [
  'organic',
  'referral',
  'ads',
  'producthunt',
  'docs',
] as const;
const ONBOARDING_STEPS = [
  'organization',
  'project',
  'install',
  'verify',
] as const;
const PROJECT_TYPES = ['website', 'app', 'backend'] as const;
const SDKS = [
  'web',
  'react',
  'next',
  'react-native',
  'node',
  'python',
] as const;
const FEATURES = [
  'funnels',
  'retention',
  'cohorts',
  'pages',
  'realtime',
  'profiles',
  'insights',
  'ai-assistant',
] as const;
const INTEGRATIONS = ['slack', 'discord', 'webhook', 'gsc', 'stripe'] as const;
const REPORT_TYPES = [
  'overview',
  'funnel',
  'retention',
  'pages',
  'events',
  'cohort',
] as const;
const CANCEL_REASONS = [
  'too_expensive',
  'missing_feature',
  'not_using',
  'switched',
] as const;
const PROJECT_IDS = [
  'web',
  'ios',
  'android',
  'landing',
  'internal',
  'staging',
] as const;

const SIGNUP_COMPLETED_CHANCE = 0.85;
const ONBOARDING_STEP_CHANCE = 0.75;
const SDK_INSTALLED_CHANCE = 0.55;
const FIRST_EVENT_CHANCE = 0.8;
const PRICING_VIEWED_CHANCE = 0.06;
const CHECKOUT_CHANCE = 0.45;
const SUBSCRIBED_CHANCE = 0.6;
const CHURN_CHANCE = 0.004;
const INVITE_CHANCE = 0.05;
const EXPORT_CHANCE = 0.05;
const INTEGRATION_CHANCE = 0.03;
const REPORT_CREATED_CHANCE = 0.15;
const FEATURE_CHANCE = 0.5;
const SETTINGS_CHANCE = 0.1;

interface SaasState {
  plan?: Plan;
  onboardingStep?: number;
  projectCreated?: boolean;
  sdkInstalled?: boolean;
  firstEvent?: boolean;
  invited?: boolean;
  exported?: boolean;
  integrated?: boolean;
  churned?: boolean;
}

function stateOf(visitor: Visitor): SaasState {
  return visitor.state as SaasState;
}

function personProps(person: Person): Record<string, string> {
  return person.properties;
}

/** Activation is spread over visits: each session moves the user at most a step or two. */
function activation(rng: Rng, journey: Journey, state: SaasState): void {
  const step = state.onboardingStep ?? 0;
  if (step < ONBOARDING_STEPS.length) {
    if (!rng.chance(ONBOARDING_STEP_CHANCE)) {
      return;
    }
    journey.view('/onboarding', 'Onboarding', { step: step + 1 });
    journey.event('onboarding_step_completed', {
      step: step + 1,
      name: ONBOARDING_STEPS[step],
    });
    state.onboardingStep = step + 1;
    if (ONBOARDING_STEPS[step] === 'project') {
      journey.event('project_created', {
        type: rng.one(PROJECT_TYPES),
        timezone: rng.one([
          'UTC',
          'Europe/Stockholm',
          'America/New_York',
          'Asia/Tokyo',
        ]),
      });
      state.projectCreated = true;
    }
    return;
  }
  if (
    state.projectCreated &&
    !state.sdkInstalled &&
    rng.chance(SDK_INSTALLED_CHANCE)
  ) {
    journey.view('/projects/web/connect', 'Connect your app');
    journey.event('sdk_installed', {
      sdk: rng.one(SDKS),
      framework: rng.one(['next', 'vite', 'remix', 'expo', 'express', 'none']),
    });
    state.sdkInstalled = true;
    return;
  }
  if (
    state.sdkInstalled &&
    !state.firstEvent &&
    rng.chance(FIRST_EVENT_CHANCE)
  ) {
    journey.event('first_event_received', {
      latency_seconds: rng.int(5, 900),
      event_name: rng.one(['screen_view', 'signup', 'purchase']),
    });
    state.firstEvent = true;
  }
}

function monetization(
  rng: Rng,
  journey: Journey,
  state: SaasState,
  person: Person
): void {
  const plan = state.plan ?? { name: 'free', price: 0 };
  if (plan.price === 0 && rng.chance(PRICING_VIEWED_CHANCE)) {
    journey.view('/settings/billing', 'Billing');
    journey.event('pricing_viewed', { current_plan: plan.name });
    if (!rng.chance(CHECKOUT_CHANCE)) {
      return;
    }
    const chosen = rng.pick(PAID_PLANS);
    const interval = rng.one(['monthly', 'yearly']);
    journey.event('checkout_started', { plan: chosen.name, interval });
    if (!rng.chance(SUBSCRIBED_CHANCE)) {
      return;
    }
    const seats = chosen.name === 'pro' ? 1 : rng.int(2, 25);
    journey.event('subscription_started', {
      plan: chosen.name,
      interval,
      seats,
      mrr: chosen.price,
      previous_plan: plan.name,
    });
    journey.revenue(interval === 'yearly' ? chosen.price * 10 : chosen.price, {
      plan: chosen.name,
      interval,
      seats,
    });
    state.plan = chosen;
    person.properties.plan = chosen.name;
    return;
  }
  if (plan.price > 0 && rng.chance(CHURN_CHANCE)) {
    journey.view('/settings/billing', 'Billing');
    journey.event('subscription_cancelled', {
      plan: plan.name,
      reason: rng.one(CANCEL_REASONS),
      months_active: rng.int(1, 18),
    });
    state.plan = { name: 'free', price: 0 };
    state.churned = true;
    person.properties.plan = 'free';
  }
}

function usage(rng: Rng, journey: Journey, state: SaasState): void {
  const visits = rng.int(1, 3);
  for (let i = 0; i < visits; i++) {
    const projectId = rng.one(PROJECT_IDS);
    journey.view(`/projects/${projectId}`, `Project ${projectId}`, {
      project: projectId,
    });
    if (rng.chance(FEATURE_CHANCE)) {
      const feature = rng.one(FEATURES);
      journey.view(`/projects/${projectId}/${feature}`, feature, {
        project: projectId,
      });
      journey.event('feature_used', { feature, project: projectId });
    }
    if (rng.chance(0.6)) {
      journey.event('report_viewed', {
        report_type: rng.one(REPORT_TYPES),
        range: rng.one(['7d', '30d', '90d', 'custom']),
        project: projectId,
      });
    }
    if (rng.chance(REPORT_CREATED_CHANCE)) {
      journey.event('report_created', {
        chart: rng.one(['line', 'bar', 'funnel', 'retention', 'pie']),
        breakdowns: rng.int(0, 2),
        project: projectId,
      });
    }
    if (rng.chance(EXPORT_CHANCE)) {
      journey.event('export_completed', {
        format: rng.one(['csv', 'json']),
        rows: rng.int(100, 200_000),
      });
      state.exported = true;
    }
  }
  if (rng.chance(INVITE_CHANCE)) {
    journey.view('/settings/members', 'Members');
    journey.event('invite_sent', { role: rng.one(['admin', 'member']) });
    state.invited = true;
  } else if (rng.chance(INTEGRATION_CHANCE)) {
    journey.view('/settings/integrations', 'Integrations');
    journey.event('integration_connected', { provider: rng.one(INTEGRATIONS) });
    state.integrated = true;
  } else if (rng.chance(SETTINGS_CHANCE)) {
    journey.view('/settings', 'Settings');
  }
}

export const saasArchetype: Archetype = {
  id: 'saas',
  projectName: 'Acme SaaS',
  origin: 'https://app.acme.test',
  domain: 'https://app.acme.test',
  types: ['website', 'backend'],
  sdk: { name: 'web', version: '1.0.5' },
  shape: {
    hourly: [
      0.5, 0.3, 0.2, 0.2, 0.3, 0.6, 1.5, 3.5, 6, 7, 7, 6, 5.5, 6.5, 7, 6.5, 6,
      5, 3.5, 2.5, 2, 1.5, 1, 0.8,
    ],
    dayOfWeek: [0.2, 1.2, 1.25, 1.25, 1.2, 1.0, 0.2],
    trendPerWeek: 0.015,
    spikeChance: 0.01,
    dipChance: 0.03,
    spikeRange: [1.5, 2.5],
    dipRange: [0.3, 0.6],
  },
  trafficShare: 0.2,
  returningShare: 0.75,
  retention: { sameDay: 0.35, day1: 0.55, day7: 0.4, day30: 0.3 },
  stickiness(visitor) {
    const state = stateOf(visitor);
    if (state.churned) {
      return 0.3;
    }
    let value = (state.plan?.price ?? 0) > 0 ? 3 : 1;
    if (state.invited) {
      value += 1;
    }
    if (state.firstEvent) {
      value += 0.5;
    }
    return value;
  },
  mobileShare: 0.12,
  deviceClass: 'web',
  referrers: [
    { weight: 70, value: null },
    { weight: 15, value: REFERRERS.google },
    { weight: 8, value: REFERRERS.gmail },
    { weight: 4, value: REFERRERS.gitHub },
    { weight: 3, value: REFERRERS.linkedIn },
  ],
  campaignChance: 0.03,
  dwellMedianSeconds: 45,
  utcOffsetHours: -2,
  newPerson(rng) {
    const person = newPerson(rng, { business: true });
    person.properties = {
      plan: 'free',
      role: rng.one(ROLES),
      company_size: rng.one(COMPANY_SIZES),
      signup_source: rng.one(SIGNUP_SOURCES),
    };
    return person;
  },
  identity:
    'Everyone signs up or logs in on their first session and is identified from then on; retention is real.',
  conversions: ['signup_completed', 'sdk_installed', 'subscription_started'],
  funnels: [
    {
      name: 'Activation',
      steps: [
        'signup_completed',
        'project_created',
        'sdk_installed',
        'first_event_received',
      ],
      breakdowns: ['signup_source', 'company_size', 'role', 'sdk'],
    },
    {
      name: 'Upgrade',
      steps: ['pricing_viewed', 'checkout_started', 'subscription_started'],
      breakdowns: ['plan', 'interval', 'company_size'],
    },
  ],
  journey(rng, journey, visitor) {
    const state = stateOf(visitor);
    const person = visitor.person;
    if (!person) {
      return;
    }

    if (!visitor.identified) {
      journey.view('/signup', 'Create your account');
      const method = rng.one(['email', 'github', 'google']);
      journey.event('signup_started', { method });
      if (!rng.chance(SIGNUP_COMPLETED_CHANCE)) {
        return;
      }
      journey.identify(person);
      journey.event('signup_completed', { method, ...personProps(person) });
      state.plan = rng.pick(PLANS.filter((plan) => plan.value.price === 0));
    } else if (visitor.sessions === 0 || rng.chance(0.15)) {
      // A known user on a new device, or a session that expired.
      journey.view('/login', 'Log in');
      journey.event('login', {
        method: rng.one(['email', 'github', 'google']),
      });
    }

    journey.view('/dashboard', 'Dashboard', {
      plan: state.plan?.name ?? 'free',
    });
    activation(rng, journey, state);
    if (
      state.onboardingStep !== undefined &&
      state.onboardingStep >= ONBOARDING_STEPS.length
    ) {
      usage(rng, journey, state);
      monetization(rng, journey, state, person);
    }
  },
};
