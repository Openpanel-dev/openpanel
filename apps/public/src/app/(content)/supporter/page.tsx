import { ArrowRightIcon, CheckIcon, HeartIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import {
  DiscordMock,
  ReleaseMock,
  RoadmapMock,
  SupportMock,
  UpgradeTerminal,
} from './_components/supporter-mocks';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { Band } from '@/components/band';
import { type FaqEntry, FaqSection } from '@/components/faq';
import { PageHero } from '@/components/page-hero';
import { Reveal } from '@/components/reveal';
import { SectionHeader, SectionLabel } from '@/components/section';
import { Button } from '@/components/ui/button';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';

const SUPPORTER_CHECKOUT_URL =
  'https://buy.polar.sh/polar_cl_Az1CruNFzQB2bYdMOZmGHqTevW317knWqV44W1FqZmV';
const SUPPORTER_DOCS_URL =
  '/docs/self-hosting/supporter-access-latest-docker-images';

const description =
  'Support OpenPanel and get exclusive perks like latest Docker images, prioritized support, and early access to new features.';

export const metadata: Metadata = getPageMetadata({
  title: 'Become a Supporter',
  description,
  url: url('/supporter'),
  image: getOgImageUrl('/supporter'),
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Become a Supporter',
  description,
  url: url('/supporter'),
  publisher: {
    '@type': 'Organization',
    name: 'OpenPanel',
    logo: {
      '@type': 'ImageObject',
      url: url('/logo.png'),
    },
  },
};

const INCLUDED = [
  'Docker images built on every commit',
  'Priority help on Discord',
  'Your requests weigh more on the roadmap',
  'Supporter role in the community',
];

interface Perk {
  title: string;
  description: string;
  visual: React.ReactNode;
  link?: { href: string; text: string };
}

const PERKS: Perk[] = [
  {
    title: 'Every build, not every release',
    description:
      'Public images follow releases. Supporters pull a new image after every merge to main, so fixes reach your server the day they land.',
    visual: <ReleaseMock />,
    link: { href: SUPPORTER_DOCS_URL, text: 'How supporter images work' },
  },
  {
    title: 'Answers first',
    description:
      'Questions from supporters go to the top of the queue on Discord, and you talk to the people who wrote the code.',
    visual: <SupportMock />,
  },
  {
    title: 'A louder voice on the roadmap',
    description:
      'Tell us what you need. Requests from supporters get looked at first when we plan what to build next.',
    visual: <RoadmapMock />,
  },
  {
    title: 'A place in the community',
    description:
      'A supporter role on Discord and our thanks. It is a small team, so it really does make a difference.',
    visual: <DiscordMock />,
  },
];

const FUNDS = [
  {
    title: 'Development time',
    text: 'Fewer distractions, more hours on fixes, features and docs.',
  },
  {
    title: 'The build pipeline',
    text: 'CI, image builds on every commit and the registry that serves them.',
  },
  {
    title: 'Free self-hosting',
    text: 'The open-source version stays complete, with no enterprise edition.',
  },
  {
    title: 'Independence',
    text: 'Paid for by the people who use it, so the roadmap follows them.',
  },
];

const FAQ: FaqEntry[] = [
  {
    question: 'Do I need to be a supporter to self-host OpenPanel?',
    answer:
      'No. Self-hosting is free and complete, with no event limits. Supporting gets you newer builds and priority help, not features.',
  },
  {
    question: 'What is the difference between the public and supporter images?',
    answer:
      'Public images are published with each release. Supporter images are built on every commit to main, so you get fixes and features weeks before they reach a release.',
  },
  {
    question: 'How do I get access after paying?',
    answer:
      'You get an API key for our Docker registry and an invite to the supporter channel on Discord. Then one command, `openpanel upgrade --supporter`, moves your install to the newest build. [Read the setup guide](/docs/self-hosting/supporter-access-latest-docker-images).',
  },
  {
    question: 'Can I cancel?',
    answer:
      'Yes, any time. Your install keeps running on the last image you pulled, and you can switch back to the public images whenever you like.',
  },
  {
    question: 'I use OpenPanel Cloud. Is this for me?',
    answer:
      'Cloud already runs the newest version and includes support, so you do not need it. If you want to back the project anyway, we will happily take it.',
  },
];

function SupporterOffer() {
  return (
    <div className="surface mx-auto grid max-w-5xl grid-cols-1 overflow-hidden rounded-3xl text-left md:grid-cols-[7fr_5fr]">
      <div className="min-w-0 bg-neutral-50 p-4 md:p-8">
        <UpgradeTerminal />
      </div>
      <div className="col justify-between gap-8 p-6 md:p-10">
        <div className="col gap-1">
          <SectionLabel>Supporter</SectionLabel>
          <div className="row items-baseline gap-2">
            <span className="font-semibold text-6xl tracking-[-0.04em]">
              $20
            </span>
            <span className="text-neutral-500">/ month</span>
          </div>
          <span className="text-neutral-500 text-sm">
            Starting price. Cancel any time.
          </span>
        </div>
        <ul className="col gap-2.5 text-sm">
          {INCLUDED.map((item) => (
            <li className="row items-start gap-2 text-neutral-700" key={item}>
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              {item}
            </li>
          ))}
        </ul>
        <Button asChild className="group w-full" size="lg">
          <a href={SUPPORTER_CHECKOUT_URL}>
            Become a supporter
            <HeartIcon className="size-4 transition-transform group-hover:scale-110" />
          </a>
        </Button>
      </div>
    </div>
  );
}

function Perks() {
  return (
    <section className="container py-16 md:py-24" id="perks">
      <SectionHeader
        align="center"
        description="Everything a self-hoster wants: newer code, faster answers and a say in what comes next."
        title="What you get"
        variant="sm"
      />
      <ul className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
        {PERKS.map((perk, index) => (
          <Reveal
            as="li"
            className="surface col gap-6 p-6 md:p-8"
            delay={index * 80}
            key={perk.title}
          >
            <div className="min-h-40">{perk.visual}</div>
            <div className="col gap-2">
              <h3 className="font-semibold text-lg tracking-tight">
                {perk.title}
              </h3>
              <p className="text-neutral-600">{perk.description}</p>
              {perk.link && (
                <Link
                  className="row mt-1 w-fit items-center gap-1.5 font-medium text-sm transition-colors hover:text-blue-700"
                  href={perk.link.href}
                >
                  {perk.link.text}
                  <ArrowRightIcon className="size-4" />
                </Link>
              )}
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

function WhereItGoes() {
  return (
    <Band
      innerClassName="grid grid-cols-1 gap-12 md:grid-cols-[5fr_7fr] md:gap-20"
      tone="grey"
    >
      <Reveal className="col gap-6">
        <SectionLabel>Where the money goes</SectionLabel>
        <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
          Self-hosting stays free. Supporters keep it that way.
        </h2>
        <p className="text-lg text-neutral-600">
          OpenPanel is built by a small team in Stockholm. Every supporter pays
          for real hours of work on the open-source version you run.
        </p>
        <p className="text-neutral-500 text-sm">
          Not self-hosting?{' '}
          <Link
            className="font-medium text-neutral-900 underline-offset-4 hover:underline"
            href="/pricing"
          >
            OpenPanel Cloud
          </Link>{' '}
          funds the project too, and starts at $2.50 a month.
        </p>
      </Reveal>
      <ul className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2">
        {FUNDS.map((item, index) => (
          <Reveal
            as="li"
            className="col gap-3"
            delay={index * 80}
            key={item.title}
          >
            <span className="center-center size-10 rounded-xl bg-white shadow-sm ring-1 ring-black/5">
              <HeartIcon className="size-4 text-neutral-900" />
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

export default function SupporterPage() {
  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="supporter-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <PageHero
        description="Self-hosting OpenPanel is free and stays free. Become a supporter to fund the work behind it, and run every new build the day it is merged."
        title="Support OpenPanel and get every build first"
      >
        <SupporterOffer />
      </PageHero>
      <Perks />
      <WhereItGoes />
      <FaqSection
        description="Anything else? Ask us on Discord or email hello@openpanel.dev."
        items={FAQ}
        title="Supporter questions"
      />
      <CtaBanner
        ctaLink={SUPPORTER_CHECKOUT_URL}
        ctaText="Become a supporter"
        description="$20 a month keeps open-source analytics independent, and puts the newest OpenPanel on your server with one command."
        footnote={false}
        secondary={{ href: SUPPORTER_DOCS_URL, text: 'Read the setup guide' }}
        title="Ready to back OpenPanel?"
      />
    </>
  );
}
