import { url } from '@/app/layout.config';
import { HeroContainer } from '@/components/hero';
import { Section, SectionHeader } from '@/components/section';
import { Faq } from '@/components/sections/faq';
import { SupporterPerks } from '@/components/sections/supporter-perks';
import { Testimonials } from '@/components/sections/testimonials';
import { Tag } from '@/components/tag';
import { Button } from '@/components/ui/button';
import {
  ArrowDownIcon,
  HeartHandshakeIcon,
  SparklesIcon,
  ZapIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'Become a Supporter',
  description:
    'Support OpenPanel and get exclusive perks like latest Docker images, prioritized support, and early access to new features.',
  alternates: {
    canonical: url('/supporter'),
  },
  openGraph: {
    title: 'Become a Supporter',
    description:
      'Support OpenPanel and get exclusive perks like latest Docker images, prioritized support, and early access to new features.',
    type: 'website',
    url: url('/supporter'),
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Become a Supporter',
    description:
      'Support OpenPanel and get exclusive perks like latest Docker images, prioritized support, and early access to new features.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Become a Supporter',
  publisher: {
    '@type': 'Organization',
    name: 'OpenPanel',
    logo: {
      '@type': 'ImageObject',
      url: url('/logo.png'),
    },
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': url('/supporter'),
  },
};

export default function SupporterPage() {
  return (
    <div>
      <Script
        id="supporter-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HeroContainer>
        <div className="container relative z-10 col sm:py-44 max-sm:pt-32">
          <div className="col gap-8 text-center">
            <div className="col gap-4">
              <Tag className="self-center">
                <HeartHandshakeIcon className="size-4 text-rose-600" />
                Support Open-Source Analytics
              </Tag>
              <h1 className="text-4xl md:text-5xl font-extrabold leading-[1.1]">
                Help us build the future of{' '}
                <span className="text-primary">open analytics</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Your support accelerates development, funds infrastructure, and
                helps us build features faster. Plus, you get exclusive perks
                and early access to everything we ship.
              </p>
            </div>
            <div className="col gap-4 justify-center items-center">
              <Button size="lg" asChild>
                <Link href="https://buy.polar.sh/polar_cl_Az1CruNFzQB2bYdMOZmGHqTevW317knWqV44W1FqZmV">
                  Become a Supporter
                  <SparklesIcon className="size-4" />
                </Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                Starting at $20/month • Cancel anytime
              </p>
            </div>
          </div>
        </div>
      </HeroContainer>
      <div className="container max-w-7xl">
        {/* Main Content with Sidebar */}
        <div className="grid lg:grid-cols-[1fr_380px] gap-8 mb-16">
          {/* Main Content */}
          <div className="col gap-12">
            {/* Why Support Section */}
            <section className="col gap-6">
              <h2 className="text-3xl font-bold">Why your support matters</h2>
              <div className="col gap-6 text-muted-foreground">
                <p className="text-lg">
                  We're not a big corporation – just a small team passionate
                  about building something useful for developers. OpenPanel
                  started because we believed analytics tools shouldn't be
                  complicated or locked behind expensive enterprise
                  subscriptions.
                </p>
                <p>When you become a supporter, you're directly funding:</p>
                <ul className="col gap-3 list-none pl-0">
                  <li className="flex items-start gap-3">
                    <ZapIcon className="size-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">
                        Active Development
                      </strong>
                      <p className="text-sm mt-1">
                        More time fixing bugs, adding features, and improving
                        documentation
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <ZapIcon className="size-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">
                        Infrastructure
                      </strong>
                      <p className="text-sm mt-1">
                        Keeping servers running, CI/CD pipelines, and
                        development tools
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <ZapIcon className="size-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <strong className="text-foreground">Independence</strong>
                      <p className="text-sm mt-1">
                        Staying focused on what matters: building a tool
                        developers actually want
                      </p>
                    </div>
                  </li>
                </ul>
                <p>
                  No corporate speak, no fancy promises – just honest work on
                  making OpenPanel better for everyone. Every contribution, no
                  matter the size, helps us stay independent and focused on what
                  matters.
                </p>
              </div>
            </section>

            {/* What You Get Section */}
            <section className="col gap-6">
              <h2 className="text-3xl font-bold">
                What you get as a supporter
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-6 rounded-lg border bg-card">
                  <h3 className="font-semibold text-lg mb-2">
                    🚀 Latest Docker Images
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Get bleeding-edge builds on every commit. Access new
                    features weeks before public release.
                  </p>
                  <Link
                    href="/docs/self-hosting/supporter-access-latest-docker-images"
                    className="text-sm text-primary hover:underline"
                  >
                    Learn more →
                  </Link>
                </div>
                <div className="p-6 rounded-lg border bg-card">
                  <h3 className="font-semibold text-lg mb-2">
                    💬 Prioritized Support
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Get help faster with priority support in our Discord
                    community. Your questions get answered first.
                  </p>
                </div>
                <div className="p-6 rounded-lg border bg-card">
                  <h3 className="font-semibold text-lg mb-2">
                    ✨ Feature Requests
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Your ideas and feature requests get prioritized in our
                    roadmap. Shape the future of OpenPanel.
                  </p>
                </div>
                <div className="p-6 rounded-lg border bg-card">
                  <h3 className="font-semibold text-lg mb-2">
                    ⭐ Exclusive Discord Role
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Special badge and recognition in our community. Show your
                    support with pride.
                  </p>
                </div>
              </div>
            </section>

            {/* Impact Section */}
            <section className="p-8 rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10">
              <h2 className="text-2xl font-bold mb-4">Your impact</h2>
              <p className="text-muted-foreground mb-6">
                Every dollar you contribute goes directly into development,
                infrastructure, and making OpenPanel better. Here's what your
                support enables:
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    100%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Open Source
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    24/7
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Active Development
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">∞</div>
                  <div className="text-sm text-muted-foreground">
                    Self-Hostable
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="lg:block hidden">
            <SupporterPerks />
          </aside>
        </div>

        {/* Mobile Perks */}
        <div className="lg:hidden mb-16">
          <SupporterPerks />
        </div>

        {/* CTA Section */}
        <Section className="container my-0 py-20">
          <SectionHeader
            tag={
              <Tag>
                <ArrowDownIcon className="size-4" strokeWidth={1.5} />
                Starting at $20/month
              </Tag>
            }
            title="Ready to support OpenPanel?"
            description="Join our community of supporters and help us build the best open-source alternative to Mixpanel. Every contribution helps accelerate development and make OpenPanel better for everyone."
          />
          <div className="center-center">
            <Button size="lg" asChild>
              <Link href="https://buy.polar.sh/polar_cl_Az1CruNFzQB2bYdMOZmGHqTevW317knWqV44W1FqZmV">
                Become a Supporter Now
                <HeartHandshakeIcon className="size-4" />
              </Link>
            </Button>
          </div>
        </Section>
      </div>

      <div className="lg:-mx-20 xl:-mx-40 not-prose mt-16">
        <Testimonials />
        <Faq />
      </div>
    </div>
  );
}
