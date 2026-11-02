import type { VisualMockName } from '@/components/visual-mock';
import type { CompareCategory } from '@/lib/compare';

// What a compare page shows of OpenPanel, by the competitor's category.
// Copy may use {competitor} for the competitor's name.

export interface CategoryPillar {
  label: string;
  title: string;
  description: string;
  points: { title: string; text: string }[];
  visual: { mock: VisualMockName; side?: 'right' | 'bottom' } | 'install';
}

export const CATEGORY_HERO: Record<CompareCategory, VisualMockName> = {
  product: 'funnel',
  web: 'web-overview',
  replay: 'replay',
  attribution: 'sessions',
};

const PRIVACY_PILLAR: CategoryPillar = {
  label: 'Privacy',
  title: 'No cookies, so no banner',
  description:
    'A visitor is a daily-rotating hash of user agent, IP and site. Nothing is stored in the browser, Cloud data stays in the EU, and the tracker is a few kilobytes.',
  points: [
    {
      title: 'Cookie-less by default',
      text: 'No consent banner for analytics. The salt changes every day.',
    },
    {
      title: 'EU cloud',
      text: 'Hosted in Germany, with a GDPR data processing agreement.',
    },
    {
      title: 'Light SDK',
      text: 'About 3 KB gzipped. Replay loads separately, only if you turn it on.',
    },
  ],
  visual: { mock: 'session-identity', side: 'bottom' },
};

const SELF_HOST_PILLAR: CategoryPillar = {
  label: 'Self-hosting',
  title: 'Run it yourself for free',
  description:
    '{competitor} is cloud only. OpenPanel is AGPL and ships as Docker Compose with ClickHouse, Postgres and Redis. One install script, no event limits, your servers.',
  points: [
    {
      title: 'One command',
      text: 'The install script asks a few questions and brings the stack up.',
    },
    {
      title: 'The full product',
      text: 'Self-hosted releases follow Cloud by a month or two.',
    },
    {
      title: 'Your data stays',
      text: 'Nothing leaves the box unless you export it to S3 or GCS.',
    },
  ],
  visual: 'install',
};

const PRODUCT_ANALYTICS_PILLAR: CategoryPillar = {
  label: 'Product analytics',
  title: 'Keep going when traffic numbers are not enough',
  description:
    '{competitor} stops at pageviews. OpenPanel adds funnels, retention, profiles and session replay on the same events, so the questions can change without a second tool.',
  points: [
    {
      title: 'Funnels and conversion',
      text: 'Session or profile based, broken down by any property or cohort.',
    },
    {
      title: 'Retention and cohorts',
      text: 'A cohort grid with a weighted average that skips weeks that have not happened yet.',
    },
    {
      title: 'Sessions and replay',
      text: 'Every visit as a row; a recording next to its events when you turn replay on.',
    },
  ],
  visual: { mock: 'funnel-steps' },
};

export const CATEGORY_PILLARS: Record<CompareCategory, CategoryPillar[]> = {
  product: [
    {
      label: 'Product analytics',
      title: 'Funnels, retention and profiles, with no seat pricing',
      description:
        'Pick the events, see where people drop off, who comes back and what each user did. Every report is in every plan; you pay for events, not for the people who look at them.',
      points: [
        {
          title: 'Funnels and conversion',
          text: 'Session or profile based, broken down by any property or cohort.',
        },
        {
          title: 'Retention and cohorts',
          text: 'A cohort grid with a weighted average that skips weeks that have not happened yet.',
        },
        {
          title: 'Profiles and groups',
          text: 'Every user with sessions, events and revenue, and the company they belong to.',
        },
      ],
      visual: { mock: 'funnel-steps' },
    },
    SELF_HOST_PILLAR,
    PRIVACY_PILLAR,
  ],
  web: [
    {
      label: 'Web analytics',
      title: 'The overview, then one click deeper',
      description:
        'Visitors, sources, pages, devices and countries on one screen, as in {competitor}. Click any value and the whole page filters; the view becomes a link you can send.',
      points: [
        {
          title: 'Click to filter',
          text: 'Every row is a filter. Filters live in the URL.',
        },
        {
          title: 'Campaigns and referrers',
          text: 'UTM source, medium, campaign, term and content, with entry and exit pages.',
        },
        {
          title: 'Realtime map',
          text: 'Who is on the site in the last 30 minutes, and where they came from.',
        },
      ],
      visual: { mock: 'web-filtered' },
    },
    PRODUCT_ANALYTICS_PILLAR,
    PRIVACY_PILLAR,
  ],
  replay: [
    {
      label: 'Session replay',
      title: 'The recording next to the events',
      description:
        'Open a session and the replay sits above its timeline. Click an event to jump there. Like {competitor}, but inside your analytics instead of beside it.',
      points: [
        {
          title: 'Events on the scrubber',
          text: 'Every tracked event is a tick you can click.',
        },
        {
          title: 'The URL bar follows the page',
          text: 'Long sessions stream in chunks while you watch.',
        },
        {
          title: '30 days, no replay quota',
          text: 'Recordings are kept for 30 days on Cloud and self-hosted alike.',
        },
      ],
      visual: { mock: 'replay-player' },
    },
    {
      label: 'Privacy',
      title: 'Masked before it leaves the browser',
      description:
        'All text and all inputs are masked by default, hidden inputs always. Unmask what you choose. When you self-host, recordings live in your own ClickHouse.',
      points: [
        {
          title: 'maskAllText and maskAllInputs on',
          text: 'Opt back in per selector, not the other way round.',
        },
        {
          title: 'Block any element',
          text: 'One data attribute keeps a region out of the recording.',
        },
        {
          title: 'Loads after your page',
          text: 'The recorder is fetched once the page is interactive.',
        },
      ],
      visual: { mock: 'replay-privacy' },
    },
    {
      label: 'Analytics',
      title: 'And the analytics around it',
      description:
        'Funnels, retention, profiles, web analytics and revenue on the same events. There are no heatmaps or rage-click detection; where {competitor} is ahead is listed below.',
      points: [
        {
          title: 'Funnels and retention',
          text: 'Any events, any breakdown, no sampling.',
        },
        {
          title: 'Profiles and sessions',
          text: 'The full history of every user, replay included.',
        },
        {
          title: 'Web overview',
          text: 'Visitors, sources, pages, devices and countries, cookie-less.',
        },
      ],
      visual: { mock: 'funnel-steps', side: 'bottom' },
    },
  ],
  attribution: [
    {
      label: 'Sources and campaigns',
      title: 'Where every session came from',
      description:
        'Referrer, UTM source, medium, campaign, term and content on every session, with entry and exit pages. A referrer that spikes is marked on the chart.',
      points: [
        {
          title: 'Click to filter',
          text: 'Every row is a filter. Filters live in the URL.',
        },
        {
          title: 'Entry and exit pages',
          text: 'Where a campaign landed and where the visit ended.',
        },
        {
          title: 'Realtime',
          text: 'Who is on the site now, by referrer and country.',
        },
      ],
      visual: { mock: 'web-sources' },
    },
    {
      label: 'Revenue',
      title: 'Revenue by source, page and user',
      description:
        'Send the amount with the event and it follows the session, so referrers and campaigns rank by money, not just visits. {competitor} starts from the ad networks; OpenPanel starts from your product.',
      points: [
        {
          title: 'Per session and per profile',
          text: 'Lifetime revenue on the profile, the amount on the session row.',
        },
        {
          title: 'Revenue tabs on the overview',
          text: 'Sources, campaigns and entry pages with a revenue column.',
        },
        {
          title: 'Reports',
          text: 'Sum of revenue per day, week or month, by any property.',
        },
      ],
      visual: { mock: 'revenue-sources' },
    },
    {
      label: 'Behaviour',
      title: 'Then what they did',
      description:
        'Funnels, retention and profiles on the same events, so attribution does not stop at the install or the first visit.',
      points: [
        {
          title: 'Funnels from the campaign',
          text: 'Break a funnel down by utm_campaign from step one.',
        },
        {
          title: 'Retention by cohort',
          text: 'Do users from one source come back more than another?',
        },
        {
          title: 'Sessions in full',
          text: 'Entry, exit, duration, events and revenue for every visit.',
        },
      ],
      visual: { mock: 'session-detail', side: 'bottom' },
    },
  ],
};

export const INSTALL_LINES = [
  { text: '# One Linux box with Docker, one command', tone: 'muted' as const },
  { text: 'curl -fsSL https://raw.githubusercontent.com/\\' },
  { text: '  Openpanel-dev/openpanel/main/self-hosting/install.sh | sh' },
  { text: '' },
  {
    text: '# The script asks for a domain and brings up',
    tone: 'muted' as const,
  },
  {
    text: '# ClickHouse, Postgres, Redis, Redpanda, api and worker',
    tone: 'muted' as const,
  },
  { text: 'docker compose up -d' },
  { text: '' },
  {
    text: '✔ OpenPanel is running at https://analytics.acme.com',
    tone: 'string' as const,
  },
];
