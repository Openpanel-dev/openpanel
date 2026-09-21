import { SupporterPerks } from 'components/sections/supporter-perks';
import {
  ClockIcon,
  GithubIcon,
  InfinityIcon,
  MessageSquareIcon,
  RocketIcon,
  SparklesIcon,
  StarIcon,
  ZapIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';

export const metadata: Metadata = getPageMetadata({
  title: 'Become a Supporter',
  description:
    'Support OpenPanel and get exclusive perks like latest Docker images, prioritized support, and early access to new features.',
  url: url('/supporter'),
  image: getOgImageUrl('/supporter'),
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Become a Supporter',
  description:
    'Support OpenPanel and get exclusive perks like latest Docker images, prioritized support, and early access to new features.',
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

export default function SupporterPage() {
  return (
    <div>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="supporter-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <HeroContainer>
        <div className="col center-center flex-1">
          <SectionHeader
            align="center"
            as="h1"
            className="flex-1"
            description="Your support accelerates development, funds infrastructure, and helps us build features faster. Plus, you get exclusive perks and early access to everything we ship."
            title={
              <>
                Help us build
                <br />
                the future of open analytics
              </>
            }
          />
          <div className="col mt-8 items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="https://buy.polar.sh/polar_cl_Az1CruNFzQB2bYdMOZmGHqTevW317knWqV44W1FqZmV">
                Become a Supporter
                <SparklesIcon className="size-4" />
              </Link>
            </Button>
            <p className="text-muted-foreground text-sm">
              Starting at $20/month • Cancel anytime
            </p>
          </div>
        </div>
      </HeroContainer>

      <div className="container">
        {/* Main Content with Sidebar */}
        <div className="mb-16 grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* Main Content */}
          <div className="col gap-16">
            {/* Why Support Section */}
            <Section className="my-0">
              <SectionHeader
                description="We're not a big corporation – just a small team passionate about building something useful for developers. OpenPanel started because we believed analytics tools shouldn't be complicated or locked behind expensive enterprise subscriptions."
                title="Why your support matters"
              />
              <div className="col mt-8 gap-6">
                <p className="text-muted-foreground">
                  When you become a supporter, you're directly funding:
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <FeatureCard
                    description="More time fixing bugs, adding features, and improving documentation"
                    icon={ZapIcon}
                    title="Active Development"
                  />
                  <FeatureCard
                    description="Keeping servers running, CI/CD pipelines, and development tools"
                    icon={ZapIcon}
                    title="Infrastructure"
                  />
                  <FeatureCard
                    description="Staying focused on what matters: building a tool developers actually want"
                    icon={ZapIcon}
                    title="Independence"
                  />
                </div>
                <p className="text-muted-foreground">
                  No corporate speak, no fancy promises – just honest work on
                  making OpenPanel better for everyone. Every contribution, no
                  matter the size, helps us stay independent and focused on what
                  matters.
                </p>
              </div>
            </Section>

            {/* What You Get Section */}
            <Section className="my-0">
              <SectionHeader
                description="Exclusive perks and early access to everything we ship."
                title="What you get as a supporter"
              />
              <div className="mt-8 grid gap-6 md:grid-cols-2">
                <FeatureCard
                  description="Get bleeding-edge builds on every commit. Access new features weeks before public release."
                  icon={RocketIcon}
                  title="Latest Docker Images"
                >
                  <Link
                    className="mt-2 text-primary text-sm hover:underline"
                    href="/docs/self-hosting/supporter-access-latest-docker-images"
                  >
                    Learn more →
                  </Link>
                </FeatureCard>
                <FeatureCard
                  description="Get help faster with priority support in our Discord community. Your questions get answered first."
                  icon={MessageSquareIcon}
                  title="Prioritized Support"
                />
                <FeatureCard
                  description="Your ideas and feature requests get prioritized in our roadmap. Shape the future of OpenPanel."
                  icon={SparklesIcon}
                  title="Feature Requests"
                />
                <FeatureCard
                  description="Special badge and recognition in our community. Show your support with pride."
                  icon={StarIcon}
                  title="Exclusive Discord Role"
                />
              </div>
            </Section>

            {/* Impact Section */}
            <Section className="my-0">
              <SectionHeader
                description="Every dollar you contribute goes directly into development, infrastructure, and making OpenPanel better. Here's what your support enables:"
                title="Your impact"
              />
              <div className="mt-8 grid gap-6 md:grid-cols-2">
                <FeatureCard
                  description="Full transparency. Audit the code, contribute, fork it, or self-host without lock-in."
                  icon={GithubIcon}
                  title="100% Open Source"
                />
                <FeatureCard
                  description="Continuous improvements and updates. Your support enables faster development cycles."
                  icon={ClockIcon}
                  title="24/7 Active Development"
                />
                <FeatureCard
                  description="Deploy OpenPanel anywhere - your server, your cloud, or locally. Full flexibility."
                  icon={InfinityIcon}
                  title="Self-Hostable"
                />
              </div>
            </Section>
          </div>

          {/* Sidebar */}
          <aside className="hidden lg:block">
            <SupporterPerks />
          </aside>
        </div>

        {/* Mobile Perks */}
        <div className="mb-16 lg:hidden">
          <SupporterPerks />
        </div>

        <CtaBanner
          ctaLink="https://buy.polar.sh/polar_cl_Az1CruNFzQB2bYdMOZmGHqTevW317knWqV44W1FqZmV"
          ctaText="Become a Supporter"
          description="Join our community of supporters and help us build the best open-source alternative to Mixpanel. Every contribution helps accelerate development and make OpenPanel better for everyone."
          title="Ready to support OpenPanel?"
        />
      </div>

      <div className="not-prose mt-16 lg:-mx-20 xl:-mx-40">
        {/* <Testimonials />
        <Faq /> */}
      </div>
    </div>
  );
}
