import { PRICING } from '@openpanel/payments/prices';
import { ArrowRightIcon, CheckIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { PricingCalculator } from './_components/pricing-calculator';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { CustomerLogos } from '@/app/(home)/_sections/social-proof';
import { Testimonials } from '@/app/(home)/_sections/testimonials';
import { Band } from '@/components/band';
import { type FaqEntry, FaqSection } from '@/components/faq';
import { PageHero } from '@/components/page-hero';
import { Reveal } from '@/components/reveal';
import { SectionHeader, SectionLabel } from '@/components/section';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { cn, formatEventsCount } from '@/lib/utils';

const title = 'OpenPanel Cloud Pricing';
const description =
  'Our pricing is as simple as it gets, choose how many events you want to track each month, everything else is unlimited, no tiers, no hidden costs.';

const MONTHS_PAID_PER_YEAR = 10;
const CUSTOM_QUOTE_HREF =
  'mailto:hello@openpanel.dev?subject=Custom%20plan%20for%20OpenPanel%20Cloud';

export const metadata: Metadata = getPageMetadata({
  title,
  description,
  url: url('/pricing'),
  image: getOgImageUrl('/pricing'),
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: title,
  description,
  url: url('/pricing'),
  publisher: {
    '@type': 'Organization',
    name: 'OpenPanel',
    logo: {
      '@type': 'ImageObject',
      url: url('/logo.png'),
    },
  },
};

function formatUsd(value: number) {
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

interface Plan {
  label: string;
  title: string;
  price: string;
  priceNote: string;
  description: string;
  points: string[];
  link: { href: string; text: string };
  featured?: boolean;
}

const PLANS: Plan[] = [
  {
    label: 'Cloud',
    title: 'We run it for you',
    price: 'From $2.50',
    priceNote: 'a month',
    description:
      'Hosted in the EU, updated first, backed up and monitored. Start tracking in a minute.',
    points: [
      'Everything unlimited except events',
      'New features as soon as they ship',
      'Support from the people who build it',
    ],
    link: {
      href: 'https://dashboard.openpanel.dev/onboarding',
      text: 'Start free trial',
    },
    featured: true,
  },
  {
    label: 'Self-hosted',
    title: 'Run it on your servers',
    price: 'Free',
    priceNote: 'forever',
    description:
      'The same open-source code, on your own infrastructure with Docker Compose. No event limits.',
    points: [
      'One setup script, then one upgrade command',
      'Your data never leaves your servers',
      'Releases arrive a little after Cloud',
    ],
    link: {
      href: '/docs/self-hosting/self-hosting',
      text: 'Read the self-hosting guide',
    },
  },
  {
    label: 'Open source projects',
    title: 'Free Cloud for OSS',
    price: 'Free',
    priceNote: 'up to 2.5M events',
    description:
      'Building something open source? We host your analytics for free in exchange for a link back.',
    points: [
      'Every Cloud feature',
      'Unlimited contributors',
      'Apply with one email',
    ],
    link: { href: '/open-source', text: 'See the OSS program' },
  },
];

const NO_SURPRISES = [
  {
    title: 'No seats',
    text: 'Invite the whole company. Team members are free on every plan.',
  },
  {
    title: 'No feature tiers',
    text: 'Funnels, retention, replays, AI and the API are in every plan.',
  },
  {
    title: 'No overage bills',
    text: 'We email you at 80% of your plan. Go over and new events wait for the next period. We never charge extra.',
  },
  {
    title: 'No lock-in',
    text: 'Export everything through the API, or move to self-hosting with the same code.',
  },
];

const COMPARE_LINKS = [
  { name: 'Mixpanel', href: '/compare/mixpanel-alternative' },
  { name: 'PostHog', href: '/compare/posthog-alternative' },
  { name: 'Google Analytics', href: '/compare/google-analytics-alternative' },
  { name: 'Plausible', href: '/compare/plausible-alternative' },
  { name: 'Matomo', href: '/compare/matomo-alternative' },
  { name: 'Umami', href: '/compare/umami-alternative' },
];

const FAQ: FaqEntry[] = [
  {
    question: 'What counts as an event?',
    answer:
      'Anything you track: a page view, a button click, a sign-up, an AI call. The billing page in the dashboard shows how many you have used this period.',
  },
  {
    question: 'Is there a free plan?',
    answer:
      'Cloud has a 30-day free trial with every feature, and you do not need a credit card to start it. After that, plans start at $2.50 a month. If you want it for free, [self-host OpenPanel](/docs/self-hosting/self-hosting), or [apply for the open source program](/open-source) if your project is open source.',
  },
  {
    question: 'What happens if I go over my plan?',
    answer:
      'You are never billed extra. We email you at 80% and again at 100% of your plan. Past the limit, new events stop showing up until your next billing period starts, and you can switch to a bigger plan at any time.',
  },
  {
    question: 'Can I change or cancel my plan?',
    answer:
      'Yes, any time from the billing page. If you cancel, you keep access until the end of the period you paid for.',
  },
  {
    question: 'Do you offer yearly billing?',
    answer:
      'Yes. Pay yearly and you get two months free, so you pay for ten months instead of twelve.',
  },
  {
    question: 'Is the self-hosted version limited?',
    answer:
      'No. It is the same code as Cloud with no event limits. New releases reach self-hosters a little after Cloud. [Supporters](/supporter) get the latest images on every commit.',
  },
  {
    question: 'We track more than 50M events. Can you help?',
    answer:
      'Yes. Email [hello@openpanel.dev](mailto:hello@openpanel.dev) with your volume and we will put together a custom plan.',
  },
];

function PlanCard({ plan, index }: { plan: Plan; index: number }) {
  const isExternal = plan.link.href.startsWith('http');
  return (
    <Reveal
      as="li"
      className={cn(
        'col gap-6 rounded-3xl p-7',
        plan.featured
          ? 'bg-neutral-900 text-white shadow-[0_30px_60px_-24px_rgba(0,0,0,0.45)]'
          : 'surface'
      )}
      delay={index * 80}
    >
      <div className="col gap-1">
        <SectionLabel className={cn(plan.featured && 'text-neutral-400')}>
          {plan.label}
        </SectionLabel>
        <h3 className="font-semibold text-xl tracking-tight">{plan.title}</h3>
      </div>
      <div className="row items-baseline gap-2">
        <span className="font-semibold text-4xl tracking-[-0.03em]">
          {plan.price}
        </span>
        <span
          className={cn(
            'text-sm',
            plan.featured ? 'text-neutral-400' : 'text-neutral-500'
          )}
        >
          {plan.priceNote}
        </span>
      </div>
      <p
        className={cn(plan.featured ? 'text-neutral-300' : 'text-neutral-600')}
      >
        {plan.description}
      </p>
      <ul className="col gap-2.5 text-sm">
        {plan.points.map((point) => (
          <li className="row items-start gap-2" key={point}>
            <CheckIcon
              className={cn(
                'mt-0.5 size-4 shrink-0',
                plan.featured ? 'text-emerald-400' : 'text-emerald-600'
              )}
            />
            {point}
          </li>
        ))}
      </ul>
      <Link
        className={cn(
          'row mt-auto w-fit items-center gap-1.5 font-medium text-sm transition-colors',
          plan.featured
            ? 'rounded-full bg-white px-4 py-2 text-neutral-900 hover:bg-neutral-100'
            : 'hover:text-blue-700'
        )}
        href={plan.link.href}
        {...(isExternal ? { rel: 'noopener' } : {})}
      >
        {plan.link.text}
        <ArrowRightIcon className="size-4" />
      </Link>
    </Reveal>
  );
}

function Plans() {
  return (
    <section className="container py-16 md:py-24">
      <SectionHeader
        align="center"
        description="Same product everywhere. Pick who runs the servers."
        title="Three ways to use OpenPanel"
        variant="sm"
      />
      <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLANS.map((plan, index) => (
          <PlanCard index={index} key={plan.label} plan={plan} />
        ))}
      </ul>
    </section>
  );
}

function PricingTable() {
  return (
    <section className="container py-16 md:py-24" id="all-plans">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[5fr_7fr] md:gap-20">
        <div className="col gap-4">
          <SectionHeader
            description="Every Cloud plan has every feature. The only difference is how many events you send each month."
            title="Every plan, side by side"
            variant="sm"
          />
          <p className="text-neutral-500 text-sm">
            Over 50M events a month?{' '}
            <a
              className="font-medium text-neutral-900 underline-offset-4 hover:underline"
              href={CUSTOM_QUOTE_HREF}
            >
              Ask for a custom plan
            </a>
            .
          </p>
        </div>
        <Reveal className="surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 text-xs">
                <th className="px-5 py-3 font-medium">Events per month</th>
                <th className="px-5 py-3 text-right font-medium">Monthly</th>
                <th className="px-5 py-3 text-right font-medium">
                  Yearly{' '}
                  <span className="hidden text-emerald-700 sm:inline">
                    (2 months free)
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 border-neutral-100 border-t">
              {PRICING.map((tier) => (
                <tr
                  className={cn(
                    'transition-colors hover:bg-neutral-50',
                    tier.popular && 'bg-neutral-50'
                  )}
                  key={tier.events}
                >
                  <td className="px-5 py-3 font-medium">
                    <span className="row items-center gap-2">
                      {formatEventsCount(tier.events)}
                      {tier.popular && (
                        <span className="rounded-full bg-neutral-900 px-2 py-0.5 font-medium text-[10px] text-white">
                          Popular
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono">
                    {formatUsd(tier.price)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-neutral-600">
                    {formatUsd(tier.price * MONTHS_PAID_PER_YEAR)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </div>
    </section>
  );
}

function NoSurprises() {
  return (
    <Band
      innerClassName="grid grid-cols-1 gap-12 md:grid-cols-[5fr_7fr] md:gap-20"
      tone="grey"
    >
      <Reveal className="col gap-6">
        <SectionLabel>No surprises</SectionLabel>
        <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
          One number on the bill, and you choose it
        </h2>
        <p className="text-lg text-neutral-600">
          Most analytics tools charge per seat, per feature and per add-on.
          OpenPanel charges for events, and that is it.
        </p>
        <p className="text-neutral-500 text-sm">
          See how the price compares to{' '}
          {COMPARE_LINKS.map((item, index) => (
            <span key={item.href}>
              <Link
                className="font-medium text-neutral-900 underline-offset-4 hover:underline"
                href={item.href}
              >
                {item.name}
              </Link>
              {index < COMPARE_LINKS.length - 1 ? ', ' : ' '}
            </span>
          ))}
          and{' '}
          <Link
            className="font-medium text-neutral-900 underline-offset-4 hover:underline"
            href="/compare"
          >
            more
          </Link>
          , or read our{' '}
          <Link
            className="font-medium text-neutral-900 underline-offset-4 hover:underline"
            href="/articles/self-hosted-web-analytics"
          >
            guide to open source web analytics
          </Link>
          .
        </p>
      </Reveal>
      <ul className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2">
        {NO_SURPRISES.map((item, index) => (
          <Reveal
            as="li"
            className="col gap-3"
            delay={index * 80}
            key={item.title}
          >
            <span className="center-center size-10 rounded-xl bg-white shadow-sm ring-1 ring-black/5">
              <CheckIcon className="size-4 text-emerald-600" />
            </span>
            <span className="font-medium text-lg">{item.title}</span>
            <span className="text-neutral-600 leading-relaxed">
              {item.text}
            </span>
          </Reveal>
        ))}
      </ul>
    </Band>
  );
}

export default function PricingPage() {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="pricing-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <PageHero
        description="Pick how many events you track each month. Websites, team members, dashboards and features are unlimited on every plan."
        title={
          <>
            Simple pricing. Pay for{' '}
            <span className="text-blue-600">events</span>, nothing else.
          </>
        }
      >
        <PricingCalculator />
      </PageHero>
      <CustomerLogos className="pt-4 md:pt-6" />
      <Plans />
      <NoSurprises />
      <PricingTable />
      <Testimonials className="my-0 pt-4 pb-16" />
      <FaqSection
        description="Billing questions we get most often. Anything else, email hello@openpanel.dev."
        items={FAQ}
        title="Pricing questions"
      />
      <CtaBanner
        secondary={{
          href: '/docs/self-hosting/self-hosting',
          text: 'Self-host for free',
        }}
        title="Try every feature free for 30 days"
      />
    </>
  );
}
