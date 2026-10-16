import {
  BarChartIcon,
  CheckIcon,
  CodeIcon,
  GlobeIcon,
  HeartHandshakeIcon,
  LinkIcon,
  MailIcon,
  MessageSquareIcon,
  SparklesIcon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { FaqItem, Faqs } from '@/components/faq';
import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';

export const metadata: Metadata = getPageMetadata({
  title: 'Free Analytics for Open Source Projects | OpenPanel OSS Program',
  description:
    "Get free web and product analytics for your open source project. Track up to 2.5M events/month. Apply to OpenPanel's open source program today.",
  url: url('/open-source'),
  image: getOgImageUrl('/open-source'),
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Free Analytics for Open Source Projects | OpenPanel OSS Program',
  description:
    "Get free web and product analytics for your open source project. Track up to 2.5M events/month. Apply to OpenPanel's open source program today.",
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

export default function OpenSourcePage() {
  return (
    <div>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="open-source-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />
      <HeroContainer>
        <div className="col center-center flex-1">
          <SectionHeader
            align="center"
            as="h1"
            className="flex-1"
            description="Track your users, understand adoption, and grow your project - all without cost. Get free analytics for your open source project with up to 2.5M events per month."
            title={
              <>
                Free Analytics for
                <br />
                Open Source Projects
              </>
            }
          />
          <div className="col mt-8 items-center justify-center gap-4">
            <Button asChild size="lg">
              <Link href="mailto:oss@openpanel.dev">
                Apply for Free Access
                <MailIcon className="size-4" />
              </Link>
            </Button>
            <p className="text-muted-foreground text-sm">
              Up to 2.5M events/month • No credit card required
            </p>
          </div>
        </div>
      </HeroContainer>

      <div className="container">
        <div className="col gap-16">
          {/* What You Get Section */}
          <Section className="my-0">
            <SectionHeader
              description="Everything you need to understand your users and grow your open source project."
              title="What you get"
            />
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <FeatureCard
                description="More than enough for most open source projects. Track page views, user actions, and custom events without worrying about limits."
                icon={BarChartIcon}
                title="2.5 Million Events/Month"
              />
              <FeatureCard
                description="Same powerful capabilities as paid plans. Funnels, retention analysis, custom dashboards, and real-time analytics."
                icon={ZapIcon}
                title="Full Feature Access"
              />
              <FeatureCard
                description="Invite your entire contributor team. Collaborate with maintainers and core contributors on understanding your project's growth."
                icon={UsersIcon}
                title="Unlimited Team Members"
              />
              <FeatureCard
                description="Dedicated help for open source maintainers. Get faster responses and priority assistance when you need it."
                icon={MessageSquareIcon}
                title="Priority Support"
              />
            </div>
          </Section>

          {/* Why We Do This Section */}
          <Section className="my-0">
            <SectionHeader
              description="OpenPanel is built by and for the open source community. We believe in giving back."
              title="Why we do this"
            />
            <div className="col mt-8 gap-6">
              <p className="text-muted-foreground">
                We started OpenPanel because we believed analytics tools
                shouldn't be complicated or locked behind expensive enterprise
                subscriptions. As an open source project ourselves, we
                understand the challenges of building and growing a project
                without the resources of big corporations.
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                <FeatureCard
                  description="OpenPanel is open source. We know what it's like to build in the open."
                  icon={CodeIcon}
                  title="Built for OSS"
                />
                <FeatureCard
                  description="Analytics shouldn't be a barrier to understanding your users. We're removing that barrier."
                  icon={HeartHandshakeIcon}
                  title="No Barriers"
                />
                <FeatureCard
                  description="We're giving back to the projects that inspire us and the community that supports us."
                  icon={SparklesIcon}
                  title="Giving Back"
                />
              </div>
            </div>
          </Section>

          {/* What We Ask In Return Section */}
          <Section className="my-0">
            <SectionHeader
              description="We keep it simple. Just a small way to help us grow and support more projects."
              title="What we ask in return"
            />
            <div className="row mt-8 gap-6">
              <div className="col gap-6">
                <FeatureCard
                  description="A simple link on your website or README helps others discover OpenPanel. It's a win-win for the community."
                  icon={LinkIcon}
                  title="Backlink to OpenPanel"
                >
                  <p className="mt-2 text-muted-foreground text-sm">
                    Example: "Analytics powered by{' '}
                    <Link
                      className="text-primary hover:underline"
                      href="https://openpanel.dev"
                    >
                      OpenPanel
                    </Link>
                    "
                  </p>
                </FeatureCard>
                <FeatureCard
                  description="Showcase your visitor count with our real-time analytics widget. It's completely optional but helps spread the word."
                  icon={GlobeIcon}
                  title="Display a Widget"
                >
                  <a
                    href="https://openpanel.dev"
                    style={{
                      display: 'inline-block',
                      overflow: 'hidden',
                      borderRadius: '8px',
                      width: '250px',
                      height: '48px',
                    }}
                  >
                    <iframe
                      height="48"
                      src="https://dashboard.openpanel.dev/widget/badge?shareId=ancygl&color=%231F1F1F"
                      style={{
                        border: 'none',
                        overflow: 'hidden',
                        pointerEvents: 'none',
                      }}
                      title="OpenPanel Analytics Badge"
                      width="100%"
                    />
                  </a>
                </FeatureCard>
                <p className="text-muted-foreground">
                  That's it. No complicated requirements, no hidden fees, no
                  catch. We just want to help open source projects succeed.
                </p>
              </div>
              <div>
                <div className="text-center text-muted-foreground text-xs">
                  <iframe
                    className="mb-2 rounded-xl border"
                    height="400"
                    src="https://dashboard.openpanel.dev/widget/realtime?shareId=26wVGY"
                    title="Realtime Widget"
                    width="300"
                  />
                  Analytics from{' '}
                  <a className="underline" href="https://openpanel.dev">
                    OpenPanel.dev
                  </a>
                </div>
              </div>
            </div>
          </Section>

          {/* Eligibility Criteria Section */}
          <Section className="my-0">
            <SectionHeader
              description="We want to support legitimate open source projects that are making a difference."
              title="Eligibility criteria"
            />
            <div className="col mt-8 gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex gap-3">
                  <CheckIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="mb-1 font-semibold">OSI-Approved License</h3>
                    <p className="text-muted-foreground text-sm">
                      Your project must use an OSI-approved open source license
                      (MIT, Apache, GPL, etc.)
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <CheckIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="mb-1 font-semibold">Public Repository</h3>
                    <p className="text-muted-foreground text-sm">
                      Your code must be publicly available on GitHub, GitLab, or
                      similar platforms
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <CheckIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="mb-1 font-semibold">Active Development</h3>
                    <p className="text-muted-foreground text-sm">
                      Show evidence of active development and a growing
                      community
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <CheckIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="mb-1 font-semibold">
                      Non-Commercial Primary Purpose
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      The primary purpose should be non-commercial, though
                      commercial OSS projects may be considered
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* How to Apply Section */}
          <Section className="my-0">
            <SectionHeader
              description="Getting started is simple. Just send us an email with a few details about your project."
              title="How to apply"
            />
            <div className="col mt-8 gap-6">
              <div className="grid gap-6 md:grid-cols-3">
                <div className="col gap-3">
                  <div className="center-center size-10 rounded-full bg-primary/10 font-semibold text-primary">
                    1
                  </div>
                  <h3 className="font-semibold">Send us an email</h3>
                  <p className="text-muted-foreground text-sm">
                    Reach out to{' '}
                    <Link
                      className="text-primary hover:underline"
                      href="mailto:oss@openpanel.dev"
                    >
                      oss@openpanel.dev
                    </Link>{' '}
                    with your project details
                  </p>
                </div>
                <div className="col gap-3">
                  <div className="center-center size-10 rounded-full bg-primary/10 font-semibold text-primary">
                    2
                  </div>
                  <h3 className="font-semibold">Include project info</h3>
                  <p className="text-muted-foreground text-sm">
                    Share your project URL, license type, and a brief
                    description of what you're building
                  </p>
                </div>
                <div className="col gap-3">
                  <div className="center-center size-10 rounded-full bg-primary/10 font-semibold text-primary">
                    3
                  </div>
                  <h3 className="font-semibold">We'll review</h3>
                  <p className="text-muted-foreground text-sm">
                    We'll evaluate your project and respond within a few
                    business days
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <Button asChild size="lg">
                  <Link href="mailto:oss@openpanel.dev?subject=Open Source Program Application">
                    Apply Now
                    <MailIcon className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </Section>

          {/* FAQ Section */}
          <Section className="my-0">
            <SectionHeader
              description="Everything you need to know about our open source program."
              title="Frequently asked questions"
            />
            <div className="mt-8">
              <Faqs>
                <FaqItem question="What counts as an open-source project?">
                  We consider any project with an OSI-approved open source
                  license (MIT, Apache, GPL, BSD, etc.) that is publicly
                  available and actively maintained. The project should have a
                  non-commercial primary purpose, though we may consider
                  commercial open source projects on a case-by-case basis.
                </FaqItem>
                <FaqItem question="What happens if I exceed 2.5M events per month?">
                  We understand that successful projects grow. If you
                  consistently exceed 2.5M events, we'll reach out to discuss
                  options. We're flexible and want to support your success. In
                  most cases, we can work out a solution that works for both of
                  us.
                </FaqItem>
                <FaqItem question="Can commercial open source projects apply?">
                  Yes, we consider commercial open source projects on a
                  case-by-case basis. If your project is open source but has
                  commercial offerings, please mention this in your application
                  and we'll evaluate accordingly.
                </FaqItem>
                <FaqItem question="How long does the free access last?">
                  As long as your project remains eligible and active, your free
                  access continues. We review projects periodically to ensure
                  they still meet our criteria, but we're committed to
                  supporting projects long-term.
                </FaqItem>
                <FaqItem question="Do I need to display the widget?">
                  No, displaying the widget is completely optional. We only
                  require a backlink to OpenPanel on your website or README. The
                  widget is just a nice way to showcase your analytics if you
                  want to.
                </FaqItem>
                <FaqItem question="What if my project is very small or just starting?">
                  We welcome projects of all sizes! Whether you're just getting
                  started or have a large community, if you meet our eligibility
                  criteria, we'd love to help. Small projects often benefit the
                  most from understanding their users early on.
                </FaqItem>
              </Faqs>
            </div>
          </Section>

          <CtaBanner
            ctaLink="mailto:oss@openpanel.dev?subject=Open Source Program Application"
            ctaText="Apply for Free Access"
            description="Join other open source projects using OpenPanel to understand their users and grow their communities. Apply today and get started in minutes."
            title="Ready to get free analytics for your open source project?"
          />
        </div>
      </div>
    </div>
  );
}
