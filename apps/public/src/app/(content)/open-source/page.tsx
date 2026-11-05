import { CheckIcon, MailIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { Band } from '@/components/band';
import { CountUp } from '@/components/count-up';
import { type FaqEntry, FaqSection } from '@/components/faq';
import { DASHBOARD_WINDOW_WIDTH, FitWidth } from '@/components/fit-width';
import { PageHero } from '@/components/page-hero';
import { Reveal } from '@/components/reveal';
import { SectionHeader, SectionLabel } from '@/components/section';
import { Button } from '@/components/ui/button';
import { VisualMock } from '@/components/visual-mock';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';

const title = 'Free Analytics for Open Source Projects | OpenPanel OSS Program';
const description =
  "Get free web and product analytics for your open source project. Track up to 2.5M events/month. Apply to OpenPanel's open source program today.";

const APPLICATION_BODY = [
  'Project name:',
  'Repository URL:',
  'Website:',
  'License:',
  'What it does (one or two sentences):',
  'Where you will link to OpenPanel (README, website footer, docs):',
].join('\n');

const APPLY_HREF = `mailto:oss@openpanel.dev?subject=${encodeURIComponent(
  'Open Source Program Application'
)}&body=${encodeURIComponent(APPLICATION_BODY)}`;

const BACKLINK_SNIPPET = 'Analytics by [OpenPanel](https://openpanel.dev)';

export const metadata: Metadata = getPageMetadata({
  title,
  description,
  url: url('/open-source'),
  image: getOgImageUrl('/open-source'),
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: title,
  description,
  url: url('/open-source'),
  publisher: {
    '@type': 'Organization',
    name: 'OpenPanel',
    logo: {
      '@type': 'ImageObject',
      url: url('/logo.png'),
    },
  },
  mainEntity: {
    '@type': 'Offer',
    name: 'Free Analytics for Open Source Projects',
    description:
      'Free analytics service for open source projects up to 2.5M events per month',
    price: '0',
    priceCurrency: 'USD',
  },
};

const OFFER = [
  { value: '2.5M', label: 'events a month, free' },
  { value: '$0', label: 'for as long as you qualify' },
  { value: 'All', label: 'Cloud features included' },
  { value: '∞', label: 'maintainers and contributors' },
];

const ELIGIBILITY = [
  {
    title: 'An OSI-approved license',
    text: 'MIT, Apache, GPL, BSD or any other license the OSI approves.',
  },
  {
    title: 'A public repository',
    text: 'The code is public on GitHub, GitLab, Codeberg or similar.',
  },
  {
    title: 'Active development',
    text: 'Recent commits and people using it. Small and new is fine.',
  },
  {
    title: 'Open source first',
    text: 'Commercial open source is welcome too, we look at those case by case.',
  },
];

const STEPS = [
  {
    title: 'Email us',
    text: 'Send the short form to oss@openpanel.dev. The button fills it in for you.',
  },
  {
    title: 'We take a look',
    text: 'We check the repository and license, and reply within a few working days.',
  },
  {
    title: 'Start tracking',
    text: 'Once approved, the free plan is on your organization. Add the script and the first events arrive within a minute.',
  },
];

const FAQ: FaqEntry[] = [
  {
    question: 'What counts as an open source project?',
    answer:
      'A project with an OSI-approved license whose code is public and actively maintained. The main purpose should be non-commercial, but commercial open source projects can apply and we decide case by case.',
  },
  {
    question: 'What happens if I go over 2.5M events a month?',
    answer:
      'Successful projects grow, and that is the point. If you go over regularly we get in touch and find something that works for both of us.',
  },
  {
    question: 'How long does the free access last?',
    answer:
      'As long as the project stays open source and active. We review projects now and then, but the program is meant to be long term.',
  },
  {
    question: 'Do I have to show the badge?',
    answer:
      'No. We ask for a link to OpenPanel in your README or on your website. The badge is optional, a nice way to show your numbers if you want to.',
  },
  {
    question: 'My project is tiny. Can I still apply?',
    answer:
      'Yes. If it meets the criteria we would love to have it. Small projects often learn the most from seeing who uses them early on.',
  },
  {
    question: 'Can I self-host instead?',
    answer:
      'Of course. OpenPanel is open source and [self-hosting is free](/docs/self-hosting/self-hosting) with no event limits. The program is for projects that would rather not run servers.',
  },
];

function Offer() {
  return (
    <section className="container pb-8">
      <Reveal className="surface grid grid-cols-2 divide-neutral-100 md:grid-cols-4 md:divide-x">
        {OFFER.map((item) => (
          <div className="col gap-1 p-6 md:p-8" key={item.label}>
            <span className="font-semibold text-4xl tracking-[-0.03em]">
              <CountUp value={item.value} />
            </span>
            <span className="text-neutral-500 text-sm">{item.label}</span>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

function WhatWeAsk() {
  return (
    <section className="container grid grid-cols-1 items-center gap-10 py-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-14 md:py-24">
      <Reveal className="col gap-6">
        <SectionLabel>What we ask in return</SectionLabel>
        <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
          One link back. That is the whole deal.
        </h2>
        <p className="text-lg text-neutral-600">
          Put a link to OpenPanel in your README or website footer, so other
          maintainers can find us. No logos on your homepage, no case study, no
          catch.
        </p>
        <dl className="col gap-4 border-neutral-200 border-t pt-5">
          <div className="col gap-0.5">
            <dt className="font-medium">Required: a backlink</dt>
            <dd className="text-neutral-600 text-sm">
              A line in your README, docs or website footer.
            </dd>
          </div>
          <div className="col gap-0.5">
            <dt className="font-medium">Optional: the visitor badge</dt>
            <dd className="text-neutral-600 text-sm">
              A live counter from your own OpenPanel, if you like showing
              numbers.
            </dd>
          </div>
        </dl>
      </Reveal>
      <Reveal className="col min-w-0 gap-4" delay={120}>
        <div className="overflow-hidden rounded-2xl bg-neutral-900 text-neutral-200 shadow-[0_30px_60px_-24px_rgba(0,0,0,0.35)]">
          <div className="row items-center gap-4 border-white/10 border-b px-5 py-3 text-[12px]">
            <span className="font-medium text-white">README.md</span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed">
            <div className="text-neutral-500">## Analytics</div>
            <div> </div>
            <div className="text-emerald-300">{BACKLINK_SNIPPET}</div>
          </pre>
        </div>
        <div className="surface col items-start gap-3 p-5">
          <span className="text-neutral-500 text-xs">
            The optional badge, live from openpanel.dev
          </span>
          <iframe
            className="h-12 w-[250px] overflow-hidden rounded-lg"
            src="https://dashboard.openpanel.dev/widget/badge?shareId=ancygl&color=%231F1F1F"
            style={{ border: 'none', pointerEvents: 'none' }}
            title="OpenPanel analytics badge"
          />
        </div>
      </Reveal>
    </section>
  );
}

function Eligibility() {
  return (
    <Band
      id="eligibility"
      innerClassName="grid grid-cols-1 gap-12 md:grid-cols-[5fr_7fr] md:gap-20"
      tone="grey"
    >
      <Reveal className="col gap-6">
        <SectionLabel>Who can apply</SectionLabel>
        <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
          Real open source, actively built
        </h2>
        <p className="text-lg text-neutral-600">
          We built OpenPanel in the open and know how thin the budget for tools
          is. If your project fits, the analytics are on us.
        </p>
      </Reveal>
      <ul className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2">
        {ELIGIBILITY.map((item, index) => (
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

function HowToApply() {
  return (
    <section className="container py-16 md:py-24">
      <SectionHeader
        align="center"
        description="No forms, no calls. One email and a few days."
        title="How to apply"
        variant="sm"
      />
      <ol className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Reveal
            as="li"
            className="surface col gap-4 p-6 md:p-8"
            delay={index * 80}
            key={step.title}
          >
            <span className="center-center size-8 rounded-full bg-neutral-900 font-medium text-sm text-white">
              {index + 1}
            </span>
            <h3 className="font-semibold text-lg tracking-tight">
              {step.title}
            </h3>
            <p className="text-neutral-600">{step.text}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export default function OpenSourcePage() {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="open-source-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <PageHero
        actions={
          <>
            <Button asChild className="group" size="lg">
              <a href={APPLY_HREF}>
                Apply for free access
                <MailIcon className="size-4" />
              </a>
            </Button>
            <Button asChild className="px-6" size="lg" variant="outline">
              <Link href="#eligibility">Check if you qualify</Link>
            </Button>
          </>
        }
        description="See who uses your project, where they come from and which docs they read. Free web and product analytics for open source projects, up to 2.5M events a month."
        title="Free analytics for open source projects"
      >
        <FitWidth width={DASHBOARD_WINDOW_WIDTH}>
          <VisualMock name="web-overview" />
        </FitWidth>
      </PageHero>
      <Offer />
      <WhatWeAsk />
      <Eligibility />
      <HowToApply />
      <FaqSection
        description="Anything else? Email oss@openpanel.dev."
        items={FAQ}
        title="Program questions"
      />
      <CtaBanner
        ctaLink={APPLY_HREF}
        ctaText="Apply for free access"
        description="One email with your repository and license. We reply within a few working days, and you can track your first events the same day."
        footnote={false}
        secondary={{ href: '/pricing', text: 'See Cloud pricing' }}
        title="Get free analytics for your project"
      />
    </>
  );
}
