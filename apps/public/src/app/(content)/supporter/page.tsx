import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
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
        id="supporter-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HeroContainer>
        <div className="col center-center flex-1">
          <SectionHeader
            as="h1"
            align="center"
            className="flex-1"
            title={
              <>
                Help us build
                <br />
                the future of open analytics
              </>
            }
            description="Your support accelerates development, funds infrastructure, and helps us build features faster. Plus, you get exclusive perks and early access to everything we ship."
          />
          <div className="col gap-4 justify-center items-center mt-8">
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
      </HeroContainer>

      <div className="container">
        {/* Main Content with Sidebar */}
        <div className="grid lg:grid-cols-[1fr_380px] gap-8 mb-16">
          {/* Main Content */}
          <div className="col gap-16">
            {/* Why Support Section */}
            <Section className="my-0">
              <SectionHeader
                title="Why your support matters"
                description="We're not a big corporation – just a small team passionate about building something useful for developers. OpenPanel started because we believed analytics tools shouldn't be complicated or locked behind expensive enterprise subscriptions."
              />
              <div className="col gap-6 mt-8">
                <p className="text-muted-foreground">
                  When you become a supporter, you're directly funding:
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <FeatureCard
                    title="Active Development"
                    description="More time fixing bugs, adding features, and improving documentation"
                    icon={ZapIcon}
                  />
                  <FeatureCard
                    title="Infrastructure"
                    description="Keeping servers running, CI/CD pipelines, and development tools"
                    icon={ZapIcon}
                  />
                  <FeatureCard
                    title="Independence"
                    description="Staying focused on what matters: building a tool developers actually want"
                    icon={ZapIcon}
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
                title="What you get as a supporter"
                description="Exclusive perks and early access to everything we ship."
              />
              <div className="grid md:grid-cols-2 gap-6 mt-8">
                <FeatureCard
                  title="Latest Docker Images"
                  description="Get bleeding-edge builds on every commit. Access new features weeks before public release."
                  icon={RocketIcon}
                >
                  <Link
                    href="/docs/self-hosting/supporter-access-latest-docker-images"
                    className="text-sm text-primary hover:underline mt-2"
                  >
                    Learn more →
                  </Link>
                </FeatureCard>
                <FeatureCard
                  title="Prioritized Support"
                  description="Get help faster with priority support in our Discord community. Your questions get answered first."
                  icon={MessageSquareIcon}
                />
                <FeatureCard
                  title="Feature Requests"
                  description="Your ideas and feature requests get prioritized in our roadmap. Shape the future of OpenPanel."
                  icon={SparklesIcon}
                />
                <FeatureCard
                  title="Exclusive Discord Role"
                  description="Special badge and recognition in our community. Show your support with pride."
                  icon={StarIcon}
                />
              </div>
            </Section>

            {/* Impact Section */}
            <Section className="my-0">
              <SectionHeader
                title="Your impact"
                description="Every dollar you contribute goes directly into development, infrastructure, and making OpenPanel better. Here's what your support enables:"
              />
              <div className="grid md:grid-cols-2 gap-6 mt-8">
                <FeatureCard
                  title="100% Open Source"
                  description="Full transparency. Audit the code, contribute, fork it, or self-host without lock-in."
                  icon={GithubIcon}
                />
                <FeatureCard
                  title="24/7 Active Development"
                  description="Continuous improvements and updates. Your support enables faster development cycles."
                  icon={ClockIcon}
                />
                <FeatureCard
                  title="Self-Hostable"
                  description="Deploy OpenPanel anywhere - your server, your cloud, or locally. Full flexibility."
                  icon={InfinityIcon}
                />
              </div>
            </Section>
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

        <CtaBanner
          title="Ready to support OpenPanel?"
          description="Join our community of supporters and help us build the best open-source alternative to Mixpanel. Every contribution helps accelerate development and make OpenPanel better for everyone."
          ctaText="Become a Supporter"
          ctaLink="https://buy.polar.sh/polar_cl_Az1CruNFzQB2bYdMOZmGHqTevW317knWqV44W1FqZmV"
        />
      </div>

      <div className="lg:-mx-20 xl:-mx-40 not-prose mt-16">
        {/* <Testimonials />
        <Faq /> */}
      </div>
    </div>
  );
}
