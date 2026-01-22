import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { FaqItem, Faqs } from '@/components/faq';
import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
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
        id="open-source-schema"
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
                Free Analytics for
                <br />
                Open Source Projects
              </>
            }
            description="Track your users, understand adoption, and grow your project - all without cost. Get free analytics for your open source project with up to 2.5M events per month."
          />
          <div className="col gap-4 justify-center items-center mt-8">
            <Button size="lg" asChild>
              <Link href="mailto:oss@openpanel.dev">
                Apply for Free Access
                <MailIcon className="size-4" />
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground">
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
              title="What you get"
              description="Everything you need to understand your users and grow your open source project."
            />
            <div className="grid md:grid-cols-2 gap-6 mt-8">
              <FeatureCard
                title="2.5 Million Events/Month"
                description="More than enough for most open source projects. Track page views, user actions, and custom events without worrying about limits."
                icon={BarChartIcon}
              />
              <FeatureCard
                title="Full Feature Access"
                description="Same powerful capabilities as paid plans. Funnels, retention analysis, custom dashboards, and real-time analytics."
                icon={ZapIcon}
              />
              <FeatureCard
                title="Unlimited Team Members"
                description="Invite your entire contributor team. Collaborate with maintainers and core contributors on understanding your project's growth."
                icon={UsersIcon}
              />
              <FeatureCard
                title="Priority Support"
                description="Dedicated help for open source maintainers. Get faster responses and priority assistance when you need it."
                icon={MessageSquareIcon}
              />
            </div>
          </Section>

          {/* Why We Do This Section */}
          <Section className="my-0">
            <SectionHeader
              title="Why we do this"
              description="OpenPanel is built by and for the open source community. We believe in giving back."
            />
            <div className="col gap-6 mt-8">
              <p className="text-muted-foreground">
                We started OpenPanel because we believed analytics tools
                shouldn't be complicated or locked behind expensive enterprise
                subscriptions. As an open source project ourselves, we
                understand the challenges of building and growing a project
                without the resources of big corporations.
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                <FeatureCard
                  title="Built for OSS"
                  description="OpenPanel is open source. We know what it's like to build in the open."
                  icon={CodeIcon}
                />
                <FeatureCard
                  title="No Barriers"
                  description="Analytics shouldn't be a barrier to understanding your users. We're removing that barrier."
                  icon={HeartHandshakeIcon}
                />
                <FeatureCard
                  title="Giving Back"
                  description="We're giving back to the projects that inspire us and the community that supports us."
                  icon={SparklesIcon}
                />
              </div>
            </div>
          </Section>

          {/* What We Ask In Return Section */}
          <Section className="my-0">
            <SectionHeader
              title="What we ask in return"
              description="We keep it simple. Just a small way to help us grow and support more projects."
            />
            <div className="row gap-6 mt-8">
              <div className="col gap-6">
                <FeatureCard
                  title="Backlink to OpenPanel"
                  description="A simple link on your website or README helps others discover OpenPanel. It's a win-win for the community."
                  icon={LinkIcon}
                >
                  <p className="text-sm text-muted-foreground mt-2">
                    Example: "Analytics powered by{' '}
                    <Link
                      href="https://openpanel.dev"
                      className="text-primary hover:underline"
                    >
                      OpenPanel
                    </Link>
                    "
                  </p>
                </FeatureCard>
                <FeatureCard
                  title="Display a Widget"
                  description="Showcase your visitor count with our real-time analytics widget. It's completely optional but helps spread the word."
                  icon={GlobeIcon}
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
                      src="https://dashboard.openpanel.dev/widget/badge?shareId=ancygl&color=%231F1F1F"
                      height="48"
                      width="100%"
                      style={{
                        border: 'none',
                        overflow: 'hidden',
                        pointerEvents: 'none',
                      }}
                      title="OpenPanel Analytics Badge"
                    />
                  </a>
                </FeatureCard>
                <p className="text-muted-foreground">
                  That's it. No complicated requirements, no hidden fees, no
                  catch. We just want to help open source projects succeed.
                </p>
              </div>
              <div>
                <div className="text-center text-xs text-muted-foreground">
                  <iframe
                    title="Realtime Widget"
                    src="https://dashboard.openpanel.dev/widget/realtime?shareId=26wVGY"
                    width="300"
                    height="400"
                    className="rounded-xl border mb-2"
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
              title="Eligibility criteria"
              description="We want to support legitimate open source projects that are making a difference."
            />
            <div className="col gap-4 mt-8">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex gap-3">
                  <CheckIcon className="size-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">OSI-Approved License</h3>
                    <p className="text-sm text-muted-foreground">
                      Your project must use an OSI-approved open source license
                      (MIT, Apache, GPL, etc.)
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <CheckIcon className="size-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Public Repository</h3>
                    <p className="text-sm text-muted-foreground">
                      Your code must be publicly available on GitHub, GitLab, or
                      similar platforms
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <CheckIcon className="size-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Active Development</h3>
                    <p className="text-sm text-muted-foreground">
                      Show evidence of active development and a growing
                      community
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <CheckIcon className="size-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">
                      Non-Commercial Primary Purpose
                    </h3>
                    <p className="text-sm text-muted-foreground">
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
              title="How to apply"
              description="Getting started is simple. Just send us an email with a few details about your project."
            />
            <div className="col gap-6 mt-8">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="col gap-3">
                  <div className="size-10 rounded-full bg-primary/10 center-center text-primary font-semibold">
                    1
                  </div>
                  <h3 className="font-semibold">Send us an email</h3>
                  <p className="text-sm text-muted-foreground">
                    Reach out to{' '}
                    <Link
                      href="mailto:oss@openpanel.dev"
                      className="text-primary hover:underline"
                    >
                      oss@openpanel.dev
                    </Link>{' '}
                    with your project details
                  </p>
                </div>
                <div className="col gap-3">
                  <div className="size-10 rounded-full bg-primary/10 center-center text-primary font-semibold">
                    2
                  </div>
                  <h3 className="font-semibold">Include project info</h3>
                  <p className="text-sm text-muted-foreground">
                    Share your project URL, license type, and a brief
                    description of what you're building
                  </p>
                </div>
                <div className="col gap-3">
                  <div className="size-10 rounded-full bg-primary/10 center-center text-primary font-semibold">
                    3
                  </div>
                  <h3 className="font-semibold">We'll review</h3>
                  <p className="text-sm text-muted-foreground">
                    We'll evaluate your project and respond within a few
                    business days
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <Button size="lg" asChild>
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
              title="Frequently asked questions"
              description="Everything you need to know about our open source program."
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
            title="Ready to get free analytics for your open source project?"
            description="Join other open source projects using OpenPanel to understand their users and grow their communities. Apply today and get started in minutes."
            ctaText="Apply for Free Access"
            ctaLink="mailto:oss@openpanel.dev?subject=Open Source Program Application"
          />
        </div>
      </div>
    </div>
  );
}
