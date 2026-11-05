import { ArrowRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { CompanyBand } from '../_components/company-band';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { PageHero } from '@/components/page-hero';
import { Reveal } from '@/components/reveal';
import { Button } from '@/components/ui/button';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { pageSource } from '@/lib/source';

const SLUG = ['contact'];

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

interface Intent {
  title: string;
  text: string;
  link: { href: string; text: string };
}

const INTENTS: Intent[] = [
  {
    title: 'Pricing, billing or a custom plan',
    text: 'Questions about your plan, an invoice or volume pricing above 50M events.',
    link: { href: 'mailto:hello@openpanel.dev', text: 'hello@openpanel.dev' },
  },
  {
    title: 'Something is broken',
    text: 'Open an issue with steps to reproduce, and we will pick it up.',
    link: {
      href: 'https://github.com/Openpanel-dev/openpanel/issues',
      text: 'Open a GitHub issue',
    },
  },
  {
    title: 'An idea for the product',
    text: 'Post it on the board, or vote for one that is already there.',
    link: {
      href: 'https://feedback.openpanel.dev',
      text: 'Go to the feedback board',
    },
  },
  {
    title: 'Help getting set up',
    text: 'Most answers are in the docs. The rest, ask on Discord.',
    link: { href: '/docs', text: 'Read the docs' },
  },
];

function Intents() {
  return (
    <section className="container pb-16 md:pb-24">
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {INTENTS.map((intent, index) => {
          const isInternal = intent.link.href.startsWith('/');
          return (
            <Reveal
              as="li"
              className="surface col gap-3 p-6 md:p-8"
              delay={index * 80}
              key={intent.title}
            >
              <h2 className="font-semibold text-lg tracking-tight">
                {intent.title}
              </h2>
              <p className="text-neutral-600">{intent.text}</p>
              {isInternal ? (
                <Link
                  className="row mt-auto w-fit items-center gap-1.5 pt-2 font-medium text-sm transition-colors hover:text-blue-700"
                  href={intent.link.href}
                >
                  {intent.link.text}
                  <ArrowRightIcon className="size-4" />
                </Link>
              ) : (
                <a
                  className="row mt-auto w-fit items-center gap-1.5 pt-2 font-medium text-sm transition-colors hover:text-blue-700"
                  href={intent.link.href}
                >
                  {intent.link.text}
                  <ArrowRightIcon className="size-4" />
                </a>
              )}
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

export default function ContactPage() {
  const page = pageSource.getPage(SLUG);
  if (!page) {
    return notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: page.data.title,
    description: page.data.description,
    url: url(page.url),
    publisher: {
      '@type': 'Organization',
      name: 'OpenPanel',
      legalName: 'OpenPanel AB',
      email: 'hello@openpanel.dev',
      logo: { '@type': 'ImageObject', url: url('/logo.png') },
    },
  };

  return (
    <>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="contact-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <PageHero
        actions={
          <>
            <Button asChild className="px-6" size="lg">
              <a href="mailto:hello@openpanel.dev">Email us</a>
            </Button>
            <Button asChild className="px-6" size="lg" variant="outline">
              <a href="https://go.openpanel.dev/discord" rel="noopener">
                Join the Discord
              </a>
            </Button>
          </>
        }
        description="No sales team, no ticket queue. Your message goes to the people who build OpenPanel, and we answer ourselves."
        title="Contact the people who build OpenPanel"
      />
      <Intents />
      <CompanyBand />
      <CtaBanner />
    </>
  );
}
