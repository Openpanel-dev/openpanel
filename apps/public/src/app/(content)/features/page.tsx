import type { Metadata } from 'next';
import Link from 'next/link';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { PageHero } from '@/components/page-hero';
import { Reveal } from '@/components/reveal';
import { SectionLabel } from '@/components/section';
import { VisualMock, type VisualMockName } from '@/components/visual-mock';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { MORE_FEATURES, PRIMARY_FEATURES } from '@/lib/nav';
import { featureSource } from '@/lib/source';

export const metadata: Metadata = getPageMetadata({
  title: 'Product analytics features',
  description:
    'Explore OpenPanel features: event tracking, funnels, retention, user profiles, and more. Privacy-first product analytics that just works.',
  url: url('/features'),
  image: getOgImageUrl('/features'),
});

interface FeatureCard {
  slug: string;
  title?: string;
  description: string;
  mock?: VisualMockName;
  // Full views are drawn at a fraction of their natural width to fit a card.
  crop?: { width: number; scale: number };
}

const WINDOW_CROP = { width: 760, scale: 0.55 };

// The same four groups as the navbar, in the same order.
const GROUPS: {
  label: string;
  title: string;
  accent: string;
  cards: FeatureCard[];
}[] = [
  {
    label: 'AI',
    title: 'What your AI costs, and an AI that answers',
    accent: 'text-violet-600',
    cards: [
      {
        slug: 'ai-observability',
        description:
          'Cost, tokens and latency for every model call, tied to the user behind it.',
        mock: 'ai',
        crop: WINDOW_CROP,
      },
      {
        slug: 'mcp',
        description:
          'Connect Claude, Cursor or your own agent and ask in plain English.',
        mock: 'chat',
        crop: WINDOW_CROP,
      },
    ],
  },
  {
    label: 'Product analytics',
    title: 'What people do after they sign up',
    accent: 'text-emerald-600',
    cards: [
      {
        slug: 'funnels',
        description: 'Where people stop, step by step.',
        mock: 'mini-funnel',
      },
      {
        slug: 'retention',
        description: 'Who comes back, by the week they joined.',
        mock: 'mini-retention',
      },
      {
        slug: 'conversion',
        description: 'A rate over time, broken down by anything.',
        mock: 'mini-trend',
      },
      {
        slug: 'identify-users',
        description: 'Every user with their sessions, events and revenue.',
        mock: 'profile',
        crop: { width: 640, scale: 0.6 },
      },
      {
        slug: 'session-replay',
        description: 'Watch what a user did, next to their events.',
        mock: 'mini-replay',
      },
      {
        slug: 'session-tracking',
        description: 'Every visit as one row, start to finish.',
        mock: 'sessions',
        crop: { width: 720, scale: 0.55 },
      },
      {
        slug: 'event-tracking',
        description: 'One call per event, any properties.',
        mock: 'mini-events',
      },
      {
        slug: 'data-visualization',
        description: 'Eleven chart types, formulas and dashboards.',
        mock: 'mini-formula',
      },
    ],
  },
  {
    label: 'Web analytics',
    title: 'The whole picture of your traffic',
    accent: 'text-blue-600',
    cards: [
      {
        slug: 'web-analytics',
        description:
          'Visitors, sources, pages, devices and countries from one script.',
        mock: 'mini-devices',
      },
      {
        slug: 'web-analytics',
        title: 'Realtime',
        description: 'Who is on the site right now, on a map.',
        mock: 'mini-map',
      },
      {
        slug: 'web-analytics',
        title: 'Search Console',
        description:
          'Clicks, impressions and positions next to your pages, plus AI assistant referrals.',
        mock: 'seo',
        crop: { width: 640, scale: 0.6 },
      },
    ],
  },
  {
    label: 'Around it',
    title: 'And everything around it',
    accent: 'text-neutral-900',
    cards: [
      {
        slug: 'revenue-tracking',
        description: 'Payments tied to users, referrers and campaigns.',
        mock: 'mini-revenue',
      },
      {
        slug: 'notifications',
        description:
          'An event or a completed funnel, sent to Slack, Discord or a webhook.',
        mock: 'mini-notifications',
      },
      {
        slug: 'integrations',
        description:
          'Slack, Discord, webhooks, S3 and GCS export, Mixpanel import.',
        mock: 'mini-integrations',
      },
      {
        slug: 'share-and-collaborate',
        description: 'Unlimited members, public links with a password.',
        mock: 'mini-share-toggle',
      },
    ],
  },
];

function titleFor(card: FeatureCard) {
  return (
    card.title ??
    featureSource.find((feature) => feature.slug === card.slug)?.short_name ??
    card.slug
  );
}

function Card({ card }: { card: FeatureCard }) {
  return (
    <Link
      className="group surface surface-hover col h-full gap-5 p-6"
      href={`/features/${card.slug}`}
    >
      {card.mock && (
        <div aria-hidden className="h-40 overflow-hidden">
          {card.crop ? (
            <div
              className="pointer-events-none origin-top-left"
              style={{
                transform: `scale(${card.crop.scale})`,
                width: card.crop.width,
              }}
            >
              <div className="col gap-3">
                <VisualMock frame="bare" name={card.mock} />
              </div>
            </div>
          ) : (
            <VisualMock frame="bare" name={card.mock} />
          )}
        </div>
      )}
      <span className="col gap-1">
        <span className="font-medium">{titleFor(card)}</span>
        <span className="text-neutral-600 text-sm">{card.description}</span>
      </span>
    </Link>
  );
}

export default function FeaturesIndexPage() {
  const seen = new Set<string>();
  const allFeatures = [...PRIMARY_FEATURES, ...MORE_FEATURES].filter(
    (feature) => {
      if (seen.has(feature.href)) {
        return false;
      }
      seen.add(feature.href);
      return true;
    }
  );
  return (
    <div>
      <PageHero
        className="pb-0 md:pb-0"
        description="Web analytics, product analytics and AI observability in one place, cookie-less, in our EU cloud or on your own servers. Every feature below is included on every plan; you only pay for events."
        title="Everything in OpenPanel"
      />
      <div
        className="mx-auto mt-14 max-w-6xl animate-rise px-4 md:mt-20"
        style={{ animationDelay: '360ms' }}
      >
        <div className="relative max-h-[560px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)] max-md:overflow-x-auto">
          <div className="min-w-[960px]">
            <VisualMock name="web-overview" />
          </div>
        </div>
      </div>
      <div className="col container gap-20 py-16 md:py-24">
        {GROUPS.map((group) => (
          <section className="col gap-8" key={group.label}>
            <Reveal className="col gap-3">
              <SectionLabel className={group.accent}>
                {group.label}
              </SectionLabel>
              <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
                {group.title}
              </h2>
            </Reveal>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.cards.map((card, index) => (
                <Reveal
                  as="li"
                  delay={index * 70}
                  key={`${card.slug}-${card.title ?? card.mock ?? index}`}
                >
                  <Card card={card} />
                </Reveal>
              ))}
            </ul>
          </section>
        ))}
        <ul className="row flex-wrap justify-center gap-2">
          {allFeatures.map((feature) => (
            <li key={feature.href}>
              <Link
                className="row items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm ring-1 ring-black/6 transition-colors hover:bg-neutral-900 hover:text-white"
                href={feature.href}
              >
                <feature.icon className="size-3.5" />
                {feature.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <CtaBanner />
    </div>
  );
}
