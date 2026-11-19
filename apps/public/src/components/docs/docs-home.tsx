import {
  ArrowRightIcon,
  BotIcon,
  CodeIcon,
  CreditCardIcon,
  type LucideIcon,
  PlayIcon,
  ServerIcon,
  SparklesIcon,
} from 'lucide-react';
import Link from 'next/link';
import { type CodeLine, CodeSnippet } from '@/components/blocks/code-snippet';
import { SectionLabel } from '@/components/section';
import { API_REFERENCE_BASE_URL } from '@/lib/openapi';
import { source } from '@/lib/source';

interface Step {
  title: string;
  text: string;
  href: string;
  lines: CodeLine[];
}

const STEPS: Step[] = [
  {
    title: 'Install OpenPanel',
    text: 'Add the script tag or an SDK. Page views, referrers and devices are tracked from the first visit.',
    href: '/docs/get-started/install-openpanel',
    lines: [
      { text: "window.op('init', {", tone: 'keyword' },
      { text: "  clientId: 'YOUR_CLIENT_ID',", tone: 'string' },
      { text: '  trackScreenViews: true,' },
      { text: '});' },
    ],
  },
  {
    title: 'Track events',
    text: 'Send the actions that matter to you, with any properties you want to break them down by.',
    href: '/docs/get-started/track-events',
    lines: [
      { text: "op.track('signup_completed', {", tone: 'keyword' },
      { text: "  plan: 'pro',", tone: 'string' },
      { text: "  source: 'pricing_page',", tone: 'string' },
      { text: '});' },
    ],
  },
  {
    title: 'Identify users',
    text: 'Tie events to a person to get profiles, retention and journeys across devices.',
    href: '/docs/get-started/identify-users',
    lines: [
      { text: 'op.identify({', tone: 'keyword' },
      { text: "  profileId: 'user_123',", tone: 'string' },
      { text: "  email: 'ada@example.com',", tone: 'string' },
      { text: '});' },
    ],
  },
];

interface Topic {
  title: string;
  text: string;
  href: string;
  icon: LucideIcon;
}

const TOPICS: Topic[] = [
  {
    title: 'Self-hosting',
    text: 'Run OpenPanel on your own servers with Docker Compose.',
    href: '/docs/self-hosting/self-hosting',
    icon: ServerIcon,
  },
  {
    title: 'REST API',
    text: 'Track, export and query your data over HTTP.',
    href: API_REFERENCE_BASE_URL,
    icon: CodeIcon,
  },
  {
    title: 'MCP server',
    text: 'Ask Claude, Cursor or any MCP client about your users.',
    href: '/docs/mcp',
    icon: SparklesIcon,
  },
  {
    title: 'AI observability',
    text: 'Track LLM calls, tokens and cost next to product events.',
    href: '/docs/ai-observability',
    icon: BotIcon,
  },
  {
    title: 'Session replay',
    text: 'Record sessions and watch what users did, with privacy masking.',
    href: '/docs/session-replay',
    icon: PlayIcon,
  },
  {
    title: 'Revenue tracking',
    text: 'Attribute purchases and subscriptions to sources and users.',
    href: '/docs/revenue-tracking',
    icon: CreditCardIcon,
  },
];

const SDK_PREFIX = '/docs/sdks/';

// Shorter labels than the page titles, which carry the runtime in brackets.
const SDK_LABELS: Record<string, string> = {
  javascript: 'Node.js',
  web: 'JavaScript',
  ai: 'Vercel AI SDK',
  script: 'Script tag',
  kotlin: 'Kotlin',
};

function getSdks() {
  return source
    .getPages()
    .filter((page) => page.url.startsWith(SDK_PREFIX))
    .map((page) => {
      const slug = page.url.slice(SDK_PREFIX.length);
      return {
        url: page.url,
        label: SDK_LABELS[slug] ?? page.data.title,
      };
    })
    .filter((sdk) => sdk.url !== SDK_PREFIX.slice(0, -1))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function Hero() {
  return (
    <header className="not-prose col gap-5 pt-2 pb-4">
      <SectionLabel>Documentation</SectionLabel>
      <h1 className="text-balance font-semibold text-4xl tracking-[-0.03em] md:text-5xl">
        Get your analytics running in a few minutes
      </h1>
      <p className="max-w-2xl text-lg text-neutral-600">
        Install OpenPanel on your site or app, track the events that matter and
        identify your users. Run it on OpenPanel Cloud or on your own servers.
      </p>
      <div className="row flex-wrap gap-3 pt-1">
        <Link
          className="row h-10 items-center gap-2 rounded-lg bg-neutral-900 px-5 font-medium text-sm text-white transition-colors hover:bg-neutral-800"
          href="/docs/get-started/install-openpanel"
        >
          Install OpenPanel
          <ArrowRightIcon className="size-4" />
        </Link>
        <Link
          className="row h-10 items-center rounded-lg bg-white px-5 font-medium text-sm ring-1 ring-black/8 transition-colors hover:bg-neutral-50"
          href="/docs/sdks"
        >
          Browse SDKs
        </Link>
      </div>
    </header>
  );
}

function Steps() {
  return (
    <section className="not-prose col gap-4 py-8">
      <SectionLabel>Start here</SectionLabel>
      <ol className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.href}>
            <Link
              className="surface surface-hover col h-full gap-4 p-5"
              href={step.href}
            >
              <span className="row items-center gap-3">
                <span className="center-center size-6 rounded-full bg-neutral-900 font-medium text-white text-xs">
                  {index + 1}
                </span>
                <span className="font-semibold tracking-tight">
                  {step.title}
                </span>
              </span>
              <span className="text-neutral-600 text-sm leading-relaxed">
                {step.text}
              </span>
              <CodeSnippet
                className="mt-auto"
                compact
                decorative={false}
                lines={step.lines}
              />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Sdks() {
  const sdks = getSdks();
  return (
    <section className="not-prose col gap-4 py-8">
      <div className="row items-end justify-between gap-4">
        <div className="col gap-2">
          <SectionLabel>SDKs</SectionLabel>
          <h2 className="font-semibold text-2xl tracking-[-0.02em]">
            Pick your stack
          </h2>
        </div>
        <Link
          className="row items-center gap-1 font-medium text-neutral-600 text-sm transition-colors hover:text-neutral-900"
          href="/docs/sdks"
        >
          All SDKs
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sdks.map((sdk) => (
          <li key={sdk.url}>
            <Link
              className="row h-11 items-center justify-between rounded-xl bg-white px-4 font-medium text-sm ring-1 ring-black/5 transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-sm"
              href={sdk.url}
            >
              {sdk.label}
              <ArrowRightIcon className="size-3.5 text-neutral-400" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Topics() {
  return (
    <section className="not-prose col gap-4 py-8">
      <div className="col gap-2">
        <SectionLabel>Go further</SectionLabel>
        <h2 className="font-semibold text-2xl tracking-[-0.02em]">
          Everything else
        </h2>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOPICS.map((topic) => (
          <li key={topic.href}>
            <Link
              className="surface surface-hover col h-full gap-3 p-5"
              href={topic.href}
            >
              <span className="center-center size-9 rounded-xl bg-neutral-50 ring-1 ring-black/5">
                <topic.icon className="size-4" />
              </span>
              <span className="font-semibold tracking-tight">
                {topic.title}
              </span>
              <span className="text-neutral-600 text-sm leading-relaxed">
                {topic.text}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DocsHome() {
  return (
    <>
      <Hero />
      <Steps />
      <Sdks />
      <Topics />
    </>
  );
}
