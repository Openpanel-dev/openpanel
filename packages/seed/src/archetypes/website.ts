// Acme Web: a marketing + docs site. Anonymous traffic; a share of visitors
// eventually signs up, which identifies them. Funnels: landing → pricing →
// signup, and docs → demo request.

import { newPerson } from '../data/people';
import { REFERRERS } from '../data/referrers';
import type { Archetype } from './archetype';

const BLOG_TOPICS = [
  'product-analytics',
  'privacy',
  'self-hosting',
  'retention',
  'funnels',
  'attribution',
  'sdk',
  'clickhouse',
  'pricing',
  'changelog',
];
const BLOG_POSTS_PER_TOPIC = 6;
const DOCS_PAGES = [
  ['get-started', 'Get started'],
  ['sdks/web', 'Web SDK'],
  ['sdks/react', 'React SDK'],
  ['sdks/react-native', 'React Native SDK'],
  ['sdks/node', 'Node SDK'],
  ['api/track', 'Track API'],
  ['api/export', 'Export API'],
  ['guides/funnels', 'Funnels'],
  ['guides/retention', 'Retention'],
  ['guides/cohorts', 'Cohorts'],
  ['self-hosting', 'Self-hosting'],
  ['self-hosting/clickhouse', 'ClickHouse tuning'],
] as const;
const COMPANY_SIZES = [
  '1',
  '2-10',
  '11-50',
  '51-200',
  '201-1000',
  '1000+',
] as const;
const ROLES = ['founder', 'engineer', 'product', 'marketing', 'data'] as const;
const PLANS = ['free', 'pro', 'team'] as const;

const WILL_SIGN_UP_SHARE = 0.18;
const BOUNCE_CHANCE = 0.42;
const CTA_CHANCE = 0.25;
const PRICING_CHANCE = 0.35;
const DOCS_CHANCE = 0.3;
const DOCS_SEARCH_CHANCE = 0.3;
const NEWSLETTER_CHANCE = 0.04;
const DEMO_CHANCE = 0.02;
const CONTACT_CHANCE = 0.02;
const SIGNUP_STARTED_CHANCE = 0.4;
const SIGNUP_COMPLETED_CHANCE = 0.7;
const IDENTIFIED_STICKINESS = 3;

export const websiteArchetype: Archetype = {
  id: 'website',
  projectName: 'Acme Web',
  origin: 'https://www.acme.test',
  domain: 'https://www.acme.test',
  types: ['website'],
  sdk: { name: 'web', version: '1.0.5' },
  shape: {
    hourly: [
      1, 0.6, 0.4, 0.3, 0.3, 0.5, 1, 2.5, 4, 5, 5.5, 5.5, 5, 5.5, 5.5, 5, 4.5,
      4, 3.5, 3.5, 3, 2.5, 2, 1.5,
    ],
    dayOfWeek: [0.55, 1.1, 1.15, 1.15, 1.1, 0.95, 0.55],
    trendPerWeek: 0.02,
    spikeChance: 0.04,
    dipChance: 0.02,
    spikeRange: [2, 6],
    dipRange: [0.2, 0.5],
  },
  trafficShare: 0.45,
  returningShare: 0.3,
  // Anonymous visitors are new devices tomorrow; this is how often the same person comes back.
  retention: { sameDay: 0.1, day1: 0.14, day7: 0.06, day30: 0.03 },
  stickiness: (visitor) => (visitor.identified ? IDENTIFIED_STICKINESS : 1),
  mobileShare: 0.45,
  deviceClass: 'web',
  referrers: [
    { weight: 35, value: null },
    { weight: 25, value: REFERRERS.google },
    { weight: 4, value: REFERRERS.bing },
    { weight: 3, value: REFERRERS.duckDuckGo },
    { weight: 6, value: REFERRERS.twitter },
    { weight: 5, value: REFERRERS.hackerNews },
    { weight: 4, value: REFERRERS.reddit },
    { weight: 4, value: REFERRERS.linkedIn },
    { weight: 4, value: REFERRERS.gitHub },
    { weight: 3, value: REFERRERS.chatGpt },
    { weight: 2, value: REFERRERS.claude },
    { weight: 2, value: REFERRERS.medium },
    { weight: 2, value: REFERRERS.productHunt },
    { weight: 1, value: REFERRERS.youTube },
  ],
  campaignChance: 0.12,
  dwellMedianSeconds: 25,
  utcOffsetHours: 1,
  newPerson(rng) {
    if (!rng.chance(WILL_SIGN_UP_SHARE)) {
      return null;
    }
    const person = newPerson(rng, { business: rng.chance(0.6) });
    person.properties = {
      company_size: rng.one(COMPANY_SIZES),
      role: rng.one(ROLES),
      plan: rng.one(PLANS),
    };
    return person;
  },
  identity:
    'Anonymous; a device is new every UTC day. Visitors who sign up are identified from then on (~18%).',
  conversions: ['signup_completed', 'demo_requested'],
  funnels: [
    {
      name: 'Signup',
      steps: [
        'screen_view',
        'plan_selected',
        'signup_started',
        'signup_completed',
      ],
      breakdowns: ['referrer_name', 'device', 'country', 'plan'],
    },
    {
      name: 'Demo request',
      steps: ['screen_view', 'cta_clicked', 'demo_requested'],
      breakdowns: ['cta', 'company_size'],
    },
  ],
  journey(rng, journey, visitor) {
    const entry = rng.pick([
      { weight: 55, value: 'home' },
      { weight: 25, value: 'blog' },
      { weight: 20, value: 'docs' },
    ] as const);

    if (entry === 'home') {
      journey.view('/', 'Acme — product analytics');
    } else if (entry === 'blog') {
      const topic = rng.one(BLOG_TOPICS);
      const n = rng.int(1, BLOG_POSTS_PER_TOPIC);
      journey.view(`/blog/${topic}-${n}`, `${topic} #${n} — Acme blog`, {
        topic,
      });
    } else {
      const [slug, title] = rng.one(DOCS_PAGES);
      journey.view(`/docs/${slug}`, title);
    }

    if (rng.chance(BOUNCE_CHANCE)) {
      return;
    }

    if (rng.chance(CTA_CHANCE)) {
      journey.event('cta_clicked', {
        cta: rng.one(['start-free', 'book-demo', 'view-docs']),
        location: rng.one(['hero', 'nav', 'footer']),
      });
    }
    if (rng.chance(DOCS_CHANCE)) {
      const [slug, title] = rng.one(DOCS_PAGES);
      journey.view(`/docs/${slug}`, title);
      if (rng.chance(DOCS_SEARCH_CHANCE)) {
        journey.event('docs_searched', {
          query: rng.one([
            'identify',
            'self host',
            'react native',
            'export',
            'funnel',
          ]),
          results: rng.int(0, 12),
        });
      }
      if (rng.chance(0.15)) {
        journey.event('docs_feedback', {
          helpful: rng.chance(0.8),
          page: slug,
        });
      }
    }

    const wantsPricing =
      rng.chance(PRICING_CHANCE) ||
      (visitor.person !== null && !visitor.identified && rng.chance(0.5));
    if (wantsPricing) {
      journey.view('/pricing', 'Pricing');
      if (rng.chance(0.3)) {
        journey.event('pricing_toggled', {
          interval: rng.one(['monthly', 'yearly']),
        });
      }
      if (
        visitor.person &&
        !visitor.identified &&
        rng.chance(SIGNUP_STARTED_CHANCE)
      ) {
        const plan = visitor.person.properties.plan ?? 'free';
        journey.event('plan_selected', {
          plan,
          interval: rng.one(['monthly', 'yearly']),
        });
        journey.view('/signup', 'Create your account', { plan });
        const method = rng.one(['email', 'github', 'google']);
        journey.event('signup_started', { method, plan });
        if (rng.chance(SIGNUP_COMPLETED_CHANCE)) {
          // The app signs the new user in; from here on the device is identified.
          journey.identify(visitor.person);
          journey.event('signup_completed', {
            method,
            plan,
            ...visitor.person.properties,
          });
          journey.view('/welcome', 'Welcome');
        }
      }
    }

    if (rng.chance(NEWSLETTER_CHANCE)) {
      journey.event('newsletter_subscribed', {
        placement: entry === 'blog' ? 'blog-footer' : 'homepage',
      });
    }
    if (rng.chance(DEMO_CHANCE)) {
      journey.view('/demo', 'Book a demo');
      journey.event('demo_requested', {
        company_size: rng.one(COMPANY_SIZES),
        use_case: rng.one(['web', 'mobile', 'saas', 'ecommerce']),
      });
    } else if (rng.chance(CONTACT_CHANCE)) {
      journey.view('/contact', 'Contact');
      journey.event('contact_form_submitted', {
        topic: rng.one(['sales', 'support', 'partnership']),
      });
    }
  },
};
