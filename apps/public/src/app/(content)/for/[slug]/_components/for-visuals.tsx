import { CodeSnippet } from '@/components/blocks/code-snippet';
import { VisualMock, type VisualMockName } from '@/components/visual-mock';
import { cn } from '@/lib/utils';

// What each audience page shows of the product: the hero window, the
// pillars, and a small replica per feature card picked by its title.

export interface AudiencePillar {
  label: string;
  title: string;
  description: string;
  points: { title: string; text: string }[];
  visual:
    | { mock: VisualMockName; side?: 'right' | 'bottom' }
    | { code: { text: string; tone?: 'muted' | 'string' | 'keyword' }[] };
}

export const AUDIENCE_HERO: Record<string, VisualMockName> = {
  startups: 'funnel',
  saas: 'retention',
  agencies: 'web-overview',
  developers: 'events',
  ecommerce: 'revenue-overview',
  shopify: 'revenue-overview',
  'gdpr-compliant': 'web-overview',
  nextjs: 'events',
  wordpress: 'web-overview',
};

const INSTALL_CODE = [
  { text: '# One Linux box with Docker, one command', tone: 'muted' as const },
  { text: 'curl -fsSL https://raw.githubusercontent.com/\\' },
  { text: 'Openpanel-dev/openpanel/main/self-hosting/install.sh | sh' },
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

const NEXTJS_CODE = [
  { text: 'npm install @openpanel/nextjs', tone: 'muted' as const },
  { text: '' },
  { text: "import { OpenPanelComponent } from '@openpanel/nextjs';" },
  { text: '' },
  { text: '<OpenPanelComponent' },
  { text: "  clientId='YOUR_CLIENT_ID'", tone: 'string' as const },
  { text: '  trackScreenViews' },
  { text: '  trackOutgoingLinks' },
  { text: '/>' },
];

const SCRIPT_TAG_CODE = [
  { text: '<script' },
  { text: '  src="https://openpanel.dev/op1.js"', tone: 'string' as const },
  { text: '  data-client-id="YOUR_CLIENT_ID"', tone: 'string' as const },
  { text: '  data-track-screen-views="true"' },
  { text: '  data-track-outgoing-links="true"' },
  { text: '  defer' },
  { text: '></script>' },
];

const TRACK_CODE = [
  { text: "op.track('checkout_completed', {" },
  { text: "  plan: 'pro',", tone: 'string' as const },
  { text: '  value: 29,' },
  { text: '});' },
  { text: '' },
  { text: '<button data-track="signup" data-plan="pro">' },
  { text: '  Start trial' },
  { text: '</button>' },
];

const PRODUCT_ANALYTICS: AudiencePillar = {
  label: 'Product analytics',
  title: 'Where people drop off, and who comes back',
  description:
    'Funnels, retention, cohorts and profiles on the events you already send. Every report is in every plan; you pay for events, not for the people who look at them.',
  points: [
    {
      title: 'Funnels and conversion',
      text: 'Session or profile based, broken down by any property or cohort.',
    },
    {
      title: 'Retention and cohorts',
      text: 'A cohort grid with an average that skips weeks that have not happened yet.',
    },
    {
      title: 'Profiles and groups',
      text: 'Every user with sessions, events and revenue, and the company they belong to.',
    },
  ],
  visual: { mock: 'funnel-steps' },
};

const WEB_OVERVIEW: AudiencePillar = {
  label: 'Web analytics',
  title: 'The overview, then one click deeper',
  description:
    'Visitors, sources, pages, devices and countries on one screen. Click any value and the whole page filters; the view becomes a link you can send.',
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
};

const REVENUE: AudiencePillar = {
  label: 'Revenue',
  title: 'Revenue by source, page and customer',
  description:
    'Send the order value with the event and it follows the session, so campaigns and landing pages rank by money, not just visits.',
  points: [
    {
      title: 'Per session and per profile',
      text: 'Lifetime value on the profile, the order on the session row.',
    },
    {
      title: 'Revenue tabs on the overview',
      text: 'Sources, campaigns and entry pages with a revenue column.',
    },
    {
      title: 'Checkout funnels',
      text: 'Product view to purchase, broken down by product, country or campaign.',
    },
  ],
  visual: { mock: 'revenue-sources' },
};

const PRIVACY: AudiencePillar = {
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

const SELF_HOST: AudiencePillar = {
  label: 'Self-hosting',
  title: 'Or run it yourself for free',
  description:
    'OpenPanel is AGPL and ships as Docker Compose with ClickHouse, Postgres and Redis. One install script, no event limits, your servers.',
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
  visual: { code: INSTALL_CODE },
};

const SDK: AudiencePillar = {
  label: 'SDKs',
  title: 'One call per event, from anywhere',
  description:
    'A web tracker, a Node SDK and wrappers for React, Next.js, Vue, Nuxt, Astro, Remix, Express and React Native, plus Swift, Kotlin, Python, Java, Ruby and Rust. Same event shape everywhere.',
  points: [
    {
      title: 'track, identify, revenue',
      text: 'Three calls cover most products. Properties are free-form.',
    },
    {
      title: 'data-track attributes',
      text: 'Mark a button and the click is an event, no JavaScript.',
    },
    {
      title: 'Live in the table',
      text: 'Events show up within a second, with a drawer for every one.',
    },
  ],
  visual: { code: TRACK_CODE },
};

const NEXTJS: AudiencePillar = {
  label: 'Next.js',
  title: 'One component in your layout',
  description:
    'The Next.js package wraps the web tracker for the App Router and the Pages Router, tracks route changes, and exposes a server-side client for events from route handlers and server actions.',
  points: [
    {
      title: 'App Router and Pages Router',
      text: 'Drop the component into the root layout and route changes are screen views.',
    },
    {
      title: 'Server-side too',
      text: 'Send events from route handlers with the Node SDK and the client secret.',
    },
    {
      title: 'Typed',
      text: 'TypeScript types for every call and every option.',
    },
  ],
  visual: { code: NEXTJS_CODE },
};

const SCRIPT_TAG: AudiencePillar = {
  label: 'Setup',
  title: 'One script tag, no developer needed',
  description:
    'Paste the tag into the theme and page views, referrers, campaigns, devices and countries start filling in within a minute. Purchases and sign-ups are one data attribute or one call more.',
  points: [
    {
      title: 'Screen views and outgoing links',
      text: 'On by two attributes on the tag.',
    },
    {
      title: 'Revenue',
      text: 'Send the order value from the thank-you page or from your backend.',
    },
    {
      title: 'Share it',
      text: 'A public overview link, with a password if you want one.',
    },
  ],
  visual: { code: SCRIPT_TAG_CODE },
};

const TEAM: AudiencePillar = {
  label: 'Clients and teams',
  title: 'Unlimited projects, members and share links',
  description:
    'Every client site is a project. Invite as many people as you like, give each one the projects they need, and share any overview or dashboard as a link, with a password if you want.',
  points: [
    {
      title: 'Per-project access',
      text: 'Admin, member or viewer, with edit or read-only per project.',
    },
    {
      title: 'Public links',
      text: 'An overview, a dashboard or a single report, no login needed.',
    },
    {
      title: 'No seats to buy',
      text: 'You pay for events across the organisation, nothing else.',
    },
  ],
  visual: { mock: 'share-modal' },
};

export const AUDIENCE_PILLARS: Record<string, AudiencePillar[]> = {
  startups: [PRODUCT_ANALYTICS, WEB_OVERVIEW, SELF_HOST],
  saas: [PRODUCT_ANALYTICS, REVENUE, TEAM],
  agencies: [TEAM, WEB_OVERVIEW, PRIVACY],
  developers: [SDK, SELF_HOST, PRODUCT_ANALYTICS],
  ecommerce: [REVENUE, PRIVACY, PRODUCT_ANALYTICS],
  shopify: [SCRIPT_TAG, REVENUE, PRIVACY],
  'gdpr-compliant': [PRIVACY, SELF_HOST, WEB_OVERVIEW],
  nextjs: [NEXTJS, PRODUCT_ANALYTICS, PRIVACY],
  wordpress: [SCRIPT_TAG, WEB_OVERVIEW, PRIVACY],
};

export function PillarVisual({
  visual,
  reverse,
}: {
  visual: AudiencePillar['visual'];
  reverse: boolean;
}) {
  if ('code' in visual) {
    return (
      <div
        aria-hidden
        className={cn(
          'rounded-3xl bg-neutral-100 p-6 md:p-10',
          reverse ? 'bleed-left' : 'bleed-right'
        )}
      >
        <CodeSnippet lines={visual.code} />
      </div>
    );
  }
  return (
    <VisualMock
      bleed={reverse ? 'left' : 'right'}
      frame="inset"
      name={visual.mock}
      side={visual.side}
    />
  );
}

// A small replica for a feature card, picked by words in its title. Setup
// and self-hosting cards get a short code block; privacy cards stay text.
const FEATURE_MINIS: [RegExp, VisualMockName][] = [
  [/replay/i, 'mini-replay'],
  [/funnel/i, 'mini-funnel'],
  [/retention/i, 'mini-retention'],
  [/cohort/i, 'mini-cohort-card'],
  [/profile|identify|customer/i, 'mini-activity-heatmap'],
  [/revenue|order|purchase|lifetime/i, 'mini-revenue'],
  [/real.?time|live/i, 'mini-realtime'],
  [/notification|alert/i, 'mini-notifications'],
  [/project/i, 'mini-project-card'],
  [/dashboard|chart|report/i, 'mini-formula'],
  [/share|client|team|member/i, 'mini-share-toggle'],
  [/export|warehouse/i, 'mini-export-files'],
  [/sdk|framework|typescript|platform/i, 'mini-sdk-list'],
  [/attribute|declarative/i, 'mini-track-attributes'],
  [/route|page view|screen/i, 'mini-screen-views'],
  [/utm|campaign|source/i, 'mini-sankey'],
  [/web analytics|device|geo|map/i, 'mini-devices'],
  [/event/i, 'mini-step-picker'],
];

const SELF_HOST_LINES = [
  { text: '# one command', tone: 'muted' as const },
  { text: 'curl -fsSL …/install.sh | sh' },
  { text: '' },
  { text: '# your own ClickHouse, Postgres, Redis', tone: 'muted' as const },
  { text: 'docker compose up -d' },
];

const SCRIPT_LINES = [
  { text: '<script' },
  { text: '  src="https://openpanel.dev/op1.js"', tone: 'string' as const },
  { text: '  data-client-id="YOUR_CLIENT_ID"', tone: 'string' as const },
  { text: '  defer></script>' },
];

const API_LINES = [
  {
    text: 'curl -X POST https://api.openpanel.dev/track \\',
    tone: 'muted' as const,
  },
  { text: "  -H 'content-type: application/json' \\" },
  { text: "  -H 'openpanel-client-id: …' \\" },
  { text: "  -H 'openpanel-client-secret: …' \\" },
  { text: '  -d \'{"type":"track","payload":{"name":"sign_up"}}\'' },
];

export function featureVisual(title: string): React.ReactNode {
  if (/self-host|docker|sovereign|own server/i.test(title)) {
    return <CodeSnippet compact lines={SELF_HOST_LINES} />;
  }
  if (/rest api|\bapi\b/i.test(title)) {
    return <CodeSnippet compact lines={API_LINES} />;
  }
  if (/script|install|plugin|setup/i.test(title)) {
    return <CodeSnippet compact lines={SCRIPT_LINES} />;
  }
  const match = FEATURE_MINIS.find(([pattern]) => pattern.test(title));
  return match ? <VisualMock frame="bare" name={match[1]} /> : undefined;
}
