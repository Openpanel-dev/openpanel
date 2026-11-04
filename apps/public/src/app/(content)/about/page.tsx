import {
  CookieIcon,
  GithubIcon,
  LayersIcon,
  type LucideIcon,
  ReceiptIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { CompanyBand } from '../_components/company-band';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { Testimonials } from '@/app/(home)/_sections/testimonials';
import { CountUp } from '@/components/count-up';
import { GetStartedButton } from '@/components/get-started-button';
import { PageHero } from '@/components/page-hero';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { pageSource } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

const SLUG = ['about'];

export function generateMetadata(): Metadata {
  const page = pageSource.getPage(SLUG);
  if (!page) {
    return { title: 'Page Not Found' };
  }
  return getPageMetadata({
    title: page.data.title,
    description: page.data.description,
    url: url(page.url),
    image: getOgImageUrl(page.url),
  });
}

// Counts from production, rounded down. Update them now and then.
const STATS = [
  { value: '7,000+', label: 'projects on OpenPanel Cloud' },
  { value: '1,100+', label: 'organizations' },
  { value: '7,000+', label: 'stars on GitHub' },
  { value: 'Billions', label: 'of events tracked' },
];

interface Principle {
  title: string;
  text: string;
  icon: LucideIcon;
}

const PRINCIPLES: Principle[] = [
  {
    title: 'Open by default',
    text: 'AGPL licensed, every line on GitHub, and self-hosting is free with no event limits.',
    icon: GithubIcon,
  },
  {
    title: 'Private by design',
    text: 'Cookie-less tracking out of the box, cloud data stored in the EU, and you can always export it.',
    icon: CookieIcon,
  },
  {
    title: 'One tool, not three',
    text: 'Web analytics, product analytics and AI observability, sharing the same users and events.',
    icon: LayersIcon,
  },
  {
    title: 'A fair price',
    text: 'Pay for events. Seats, projects, dashboards and features are unlimited, from $2.50 a month.',
    icon: ReceiptIcon,
  },
];

function Stats() {
  return (
    <section className="container pb-8">
      <Reveal className="surface grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-neutral-100">
        {STATS.map((stat) => (
          <div className="col gap-1 p-6 md:p-8" key={stat.label}>
            <span className="font-semibold text-4xl tracking-[-0.03em]">
              <CountUp value={stat.value} />
            </span>
            <span className="text-neutral-500 text-sm">{stat.label}</span>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

function FounderCard() {
  return (
    <div className="surface col gap-5 p-6 md:sticky md:top-28">
      <div className="row items-center gap-4">
        <Image
          alt="Carl-Gerhard Lindesvärd"
          className="size-14 rounded-full object-cover"
          height={56}
          src="/twitter-carl.jpg"
          width={56}
        />
        <div className="col">
          <span className="font-medium">Carl-Gerhard Lindesvärd</span>
          <span className="text-neutral-500 text-sm">Founder, OpenPanel</span>
        </div>
      </div>
      <p className="text-neutral-600 text-sm leading-relaxed">
        Building OpenPanel from Stockholm since 2023. Happy to talk analytics,
        open source or anything you are stuck on.
      </p>
      <div className="row flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <a href="https://x.com/CarlLindesvard" rel="noopener">
            Follow on X
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/contact">Get in touch</Link>
        </Button>
      </div>
    </div>
  );
}

function Principles() {
  return (
    <section className="container py-16 md:py-24">
      <SectionHeader
        align="center"
        description="The rules we hold ourselves to when we decide what to build and how to charge for it."
        title="What we believe"
        variant="sm"
      />
      <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PRINCIPLES.map((principle, index) => (
          <Reveal
            as="li"
            className="surface col gap-4 p-6"
            delay={index * 80}
            key={principle.title}
          >
            <span className="center-center size-10 rounded-xl bg-neutral-50 ring-1 ring-black/5">
              <principle.icon className="size-4" />
            </span>
            <h3 className="font-semibold tracking-tight">{principle.title}</h3>
            <p className="text-neutral-600 text-sm leading-relaxed">
              {principle.text}
            </p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

export default function AboutPage() {
  const page = pageSource.getPage(SLUG);
  const Body = page?.data.body;
  if (!(page && Body)) {
    return notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: page.data.title,
    description: page.data.description,
    url: url(page.url),
    publisher: {
      '@type': 'Organization',
      name: 'OpenPanel',
      legalName: 'OpenPanel AB',
      logo: { '@type': 'ImageObject', url: url('/logo.png') },
      founder: { '@type': 'Person', name: 'Carl-Gerhard Lindesvärd' },
    },
  };

  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="about-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <PageHero
        actions={
          <>
            <GetStartedButton />
            <Button asChild className="px-6" size="lg" variant="outline">
              <Link href="#story">Read our story</Link>
            </Button>
          </>
        }
        description="OpenPanel is open-source web and product analytics, built in Stockholm. A Mixpanel alternative you can run in our EU cloud or on your own servers."
        title="We build OpenPanel so analytics stays open"
      />
      <Stats />
      <section
        className="container grid scroll-mt-24 grid-cols-1 gap-10 py-16 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-16 md:py-24"
        id="story"
      >
        <div>
          <FounderCard />
        </div>
        <article className="prose max-w-none text-lg [&_h2]:mt-12 [&_h2]:font-semibold [&_h2]:text-2xl [&_h2]:tracking-[-0.02em] [&_p]:text-neutral-700 [&_p]:leading-relaxed">
          <Body components={getMDXComponents()} />
        </article>
      </section>
      <Principles />
      <CompanyBand />
      <Testimonials className="my-0 py-16 md:py-24" />
      <CtaBanner />
    </>
  );
}
