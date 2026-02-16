import {
  ArrowRightIcon,
  BarChart3Icon,
  CalendarIcon,
  CookieIcon,
  GithubIcon,
  InfinityIcon,
  LayersIcon,
  LineChartIcon,
  RefreshCwIcon,
  RocketIcon,
  ServerIcon,
  ShieldCheckIcon,
  UnlockIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { CtaBanner } from '@/app/(home)/_sections/cta-banner';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { FaqItem, Faqs } from '@/components/faq';
import { FeatureCard } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { DataOwnershipIllustration } from '@/components/illustrations/data-ownership';
import { PrivacyIllustration } from '@/components/illustrations/privacy';
import { ProductAnalyticsIllustration } from '@/components/illustrations/product-analytics';
import { WebAnalyticsIllustration } from '@/components/illustrations/web-analytics';
import { Perks } from '@/components/perks';
import { Section, SectionHeader } from '@/components/section';
import { Testimonial } from '@/components/testimonial';
import { Button } from '@/components/ui/button';
import { WindowImage } from '@/components/window-image';
import { url } from '@/lib/layout.shared';
import { getOgImageUrl, getPageMetadata } from '@/lib/metadata';
import { cn } from '@/lib/utils';

export const metadata: Metadata = getPageMetadata({
  title: 'Open Source Analytics | Web & Product Analytics Platform',
  description:
    'OpenPanel is an open source analytics platform for web and product teams. Privacy-first, cookieless, self-hostable. Combine web analytics and product analytics in one tool. Free trial.',
  url: url('/open-source-analytics'),
  image: getOgImageUrl('/open-source-analytics'),
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Open Source Analytics | Web & Product Analytics Platform | OpenPanel',
  description:
    'OpenPanel is an open source analytics platform for web and product teams. Privacy-first, cookieless, self-hostable. Combine web analytics and product analytics in one tool.',
  url: url('/open-source-analytics'),
  publisher: {
    '@type': 'Organization',
    name: 'OpenPanel',
    logo: {
      '@type': 'ImageObject',
      url: url('/logo.png'),
    },
  },
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'OpenPanel',
    applicationCategory: 'AnalyticsApplication',
    operatingSystem: 'Web',
    url: url('/'),
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free 30-day trial, self-host for free',
    },
  },
};

const heroPerks = [
  { text: 'Open source (AGPL-3.0)', icon: GithubIcon },
  { text: 'Self-hostable', icon: ServerIcon },
  { text: 'Cookieless tracking', icon: CookieIcon },
  { text: 'GDPR compliant', icon: ShieldCheckIcon },
  { text: 'Web + product analytics', icon: BarChart3Icon },
  { text: '30-day free trial', icon: CalendarIcon },
];

export default function OpenSourceAnalyticsPage() {
  return (
    <div>
      <Script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        id="open-source-analytics-schema"
        strategy="beforeInteractive"
        type="application/ld+json"
      />

      {/* Hero */}
      <HeroContainer className="-mb-32 max-sm:**:data-children:pb-0">
        <div className="col w-full gap-8 sm:w-1/2 sm:pr-12">
          <div className="col gap-4">
            <h1 className="font-semibold text-4xl leading-[1.1] md:text-5xl">
              Open Source Analytics for Web and Product Teams
            </h1>
            <p className="text-lg text-muted-foreground">
              OpenPanel is an open source analytics platform that combines web
              analytics and product analytics in one privacy-first tool. Track
              pageviews, events, funnels, retention, and user journeys — all
              without cookies.
            </p>
          </div>
          <div className="row gap-4">
            <GetStartedButton text="Start free trial" />
            <Button asChild className="px-6" size="lg" variant="outline">
              <Link href="/docs/self-hosting/self-hosting">
                Self-host for free
              </Link>
            </Button>
          </div>
          <Perks perks={heroPerks} />
        </div>

        <div className="col group relative max-sm:px-4 sm:w-1/2">
          <div
            className={cn(
              'overflow-hidden rounded-lg border border-border bg-background shadow-lg',
              'sm:absolute sm:-top-12 sm:-bottom-64 sm:left-0 sm:w-[800px]',
              'relative max-sm:-mx-4 max-sm:mt-12 max-sm:h-[800px]'
            )}
          >
            <div className="flex h-12 items-center gap-2 border-border border-b bg-muted/50 px-4">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <div className="h-3 w-3 rounded-full bg-green-500" />
              </div>
              <a
                className="group flex flex-1 items-center gap-2 rounded-md border border-border bg-background/20 px-3 py-1 text-sm"
                href="https://demo.openpanel.dev/demo/shoey/dashboards/e-commerce"
                rel="noreferrer noopener nofollow"
                target="_blank"
              >
                <span className="flex-1 text-muted-foreground">
                  demo.openpanel.dev
                </span>
                <ArrowRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </div>
            <iframe
              className="h-full w-full"
              scrolling="no"
              src="https://demo.openpanel.dev/demo/shoey/dashboards/e-commerce"
              title="OpenPanel e-commerce analytics dashboard demo"
            />
          </div>
        </div>
      </HeroContainer>

      <div className="container">
        <div className="col gap-0">
          {/* Web + Product Analytics in One Platform */}
          <Section>
            <SectionHeader
              description="Most open source analytics tools focus on either web analytics or product analytics. OpenPanel does both — so you don't need to run two separate tools."
              title="Open source web analytics and product analytics in one platform"
            />
            <p className="mt-4 max-w-3xl text-muted-foreground">
              Track pageviews and traffic sources alongside user events,
              funnels, retention curves, and individual user journeys. One
              platform, one tracking snippet, one dashboard.
            </p>
            <div className="mt-8 mb-6 grid gap-6 md:grid-cols-2">
              <FeatureCard
                className="px-0 **:data-content:px-6"
                description="Understand your website performance with privacy-first analytics and clear, actionable insights."
                illustration={<WebAnalyticsIllustration />}
                title="Web Analytics"
                variant="large"
              />
              <FeatureCard
                className="px-0 **:data-content:px-6"
                description="Turn raw data into clarity with real-time visualization of performance, behavior, and trends."
                illustration={<ProductAnalyticsIllustration />}
                title="Product Analytics"
                variant="large"
              />
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <FeatureCard
                description="See visitors, pageviews, referrers, countries, devices, and browsers — updated in real time with no delays."
                icon={LineChartIcon}
                link={{
                  href: '/features/web-analytics',
                  children: 'Learn about web analytics',
                }}
                title="Real-time Web Analytics"
              />
              <FeatureCard
                description="Build conversion funnels to see where users drop off. Identify bottlenecks and optimize your user flow."
                icon={LayersIcon}
                link={{
                  href: '/features/funnels',
                  children: 'Learn about funnels',
                }}
                title="Funnels"
              />
              <FeatureCard
                description="Measure how many users come back over time. Understand engagement patterns and improve long-term retention."
                icon={RefreshCwIcon}
                link={{
                  href: '/features/retention',
                  children: 'Learn about retention',
                }}
                title="Retention Analysis"
              />
              <FeatureCard
                description="Track any custom event — signups, purchases, button clicks, form submissions. Flexible and schema-free."
                icon={BarChart3Icon}
                link={{
                  href: '/features/event-tracking',
                  children: 'Learn about event tracking',
                }}
                title="Event Tracking"
              />
              <FeatureCard
                description="See individual user journeys, session timelines, and profile data. Understand how specific users interact with your product."
                icon={UserIcon}
                link={{
                  href: '/features/identify-users',
                  children: 'Learn about user profiles',
                }}
                title="User Profiles & Sessions"
              />
              <FeatureCard
                description="SDKs for React, Next.js, Vue, Astro, Swift, Kotlin, Python, and more. Add tracking with a few lines of code."
                icon={GithubIcon}
                link={{
                  href: '/docs/sdks',
                  children: 'Browse all SDKs',
                }}
                title="15+ SDKs & Integrations"
              />
            </div>
          </Section>

          {/* Testimonial: Data ownership */}
          <Testimonial
            author="Self-hosting users"
            className="my-16"
            quote={
              '\u201COpenPanel gives us the same, in many ways better, analytics while keeping full ownership of our data. It\u2019s truly self-hosted but surprisingly low maintenance.\u201D'
            }
          />

          <Section>
            <SectionHeader
              description="Open source analytics tools give you full transparency and control over how your data is collected, stored, and analyzed."
              title="What is open source analytics?"
            />
            <div className="col prose prose-neutral dark:prose-invert mt-8 max-w-3xl gap-6">
              <p>
                Open source analytics means the source code of the analytics
                platform is publicly available for anyone to inspect, modify,
                and self-host. Unlike proprietary tools like{' '}
                <Link href="/compare/google-analytics-alternative">
                  Google Analytics
                </Link>{' '}
                or <Link href="/compare/mixpanel-alternative">Mixpanel</Link>,
                open source analytics tools don't lock you into a vendor's
                ecosystem or force you to send your users' data to third-party
                servers.
              </p>
              <p>
                With open source analytics, you can audit exactly what data is
                being collected, verify there are no hidden trackers, deploy the
                software on your own infrastructure, and customize it to fit
                your needs. This matters for privacy-conscious teams, companies
                operating under GDPR or CCPA, and anyone who wants full
                ownership of their analytics data.
              </p>
              <p>
                The open source analytics ecosystem has matured significantly.
                Tools like OpenPanel, Plausible, PostHog, Matomo, and Umami
                offer production-ready alternatives to proprietary platforms —
                with the added benefits of transparency, self-hosting, and
                community-driven development.
              </p>
            </div>
          </Section>

          {/* Screenshot: Overview */}
          <div className="my-16">
            <WindowImage
              alt="OpenPanel open source analytics dashboard showing real-time web analytics overview"
              caption="Get instant insights into your traffic, top pages, referrers, and user behavior — all from one dashboard."
              srcDark="/screenshots/overview-dark.webp"
              srcLight="/screenshots/overview-light.webp"
            />
          </div>

          {/* Why Open Source Analytics Matters */}
          <Section>
            <SectionHeader
              description="Proprietary analytics tools come with trade-offs that open source eliminates."
              title="Why open source analytics matters"
            />
            <div className="mt-8 mb-6 grid gap-6 md:grid-cols-2">
              <FeatureCard
                className="px-0 **:data-content:px-6"
                description="Privacy-first analytics without cookies, fingerprinting, or invasive tracking. Built for compliance and user trust."
                illustration={<PrivacyIllustration />}
                title="Privacy-first"
                variant="large"
              />
              <FeatureCard
                className="px-0 **:data-content:px-6"
                description="You own your data — no vendors, no sharing, no hidden processing. Store analytics on your own infrastructure and stay in full control."
                illustration={<DataOwnershipIllustration />}
                title="Data Ownership"
                variant="large"
              />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <FeatureCard
                description="Export your data anytime. Switch providers without losing history. No proprietary formats, no walled gardens, no enterprise contracts locking you in."
                icon={UnlockIcon}
                title="No Vendor Lock-in"
              />
              <FeatureCard
                description="Transparent roadmap, public code, and community contributions. Report bugs, request features, or contribute directly. The project evolves based on real user needs."
                icon={UsersIcon}
                title="Community-Driven"
              >
                <Link
                  className="text-muted-foreground text-sm transition-colors hover:text-primary"
                  href="https://github.com/Openpanel-dev/openpanel"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View on GitHub
                </Link>
              </FeatureCard>
            </div>
          </Section>

          {/* Screenshot: Dashboard */}
          <div className="my-16">
            <WindowImage
              alt="OpenPanel custom analytics dashboard with charts and visualizations"
              caption="Build custom dashboards with the metrics that matter most to your team."
              srcDark="/screenshots/dashboard-dark.webp"
              srcLight="/screenshots/dashboard-light.webp"
            />
          </div>

          {/* Testimonial: Dashboards & data */}
          <Testimonial
            author="Self-hosting users"
            className="my-16"
            quote={
              '\u201CThe dashboards are clear, the data is reliable, and the feature set covers everything we relied on before. We honestly don\u2019t want to run any business without OpenPanel anymore.\u201D'
            }
          />

          {/* Self-Hosted Analytics */}
          <Section>
            <SectionHeader
              description="Run OpenPanel on your own servers with full data sovereignty. The self-hosted version is identical to the cloud — same features, no limitations."
              title="Self-hosted analytics: deploy on your own infrastructure"
            />
            <div className="col prose prose-neutral dark:prose-invert mt-8 max-w-3xl gap-6">
              <p>
                Self-hosting gives you complete control. Your analytics data
                never leaves your infrastructure — ideal for companies with
                strict compliance requirements, healthcare organizations, or
                anyone who values data sovereignty. A mid-range VPS with 4 vCPU,
                8 GB RAM, and an SSD running Docker Compose is enough for most
                projects.
              </p>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <FeatureCard
                description="One Docker Compose command to get up and running. No complex Kubernetes setup, no DevOps expertise required."
                icon={RocketIcon}
                title="Deploy in Minutes"
              />
              <FeatureCard
                description="Self-hosted OpenPanel has no caps on events, users, dashboards, or data retention. Scale as much as your server allows."
                icon={InfinityIcon}
                title="No Event Limits"
              />
              <FeatureCard
                description="Pull the latest version to get new features, bug fixes, and security patches. Stay current with minimal effort."
                icon={RefreshCwIcon}
                title="Always Up to Date"
              />
            </div>
            <div className="row mt-8 gap-4">
              <GetStartedButton text="Start free cloud trial" />
              <Button asChild size="lg" variant="outline">
                <Link href="/docs/self-hosting/self-hosting">
                  Read self-hosting docs
                </Link>
              </Button>
            </div>
          </Section>

          {/* Testimonial: Support */}
          <Testimonial
            author="Self-hosting users"
            className="my-16"
            quote={
              '\u201CThe support is absolutely fantastic: responsive, helpful, and knowledgeable, and that made the switch effortless. We spend less time managing tooling and more time acting on insights.\u201D'
            }
          />

          {/* How OpenPanel Compares */}
          <Section>
            <SectionHeader
              description="OpenPanel sits at the intersection of simple web analytics and powerful product analytics."
              title="How OpenPanel compares to other open source analytics tools"
            />
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <FeatureCard
                description="Plausible is great for simple pageview analytics. OpenPanel adds product analytics — funnels, retention, user profiles, and event tracking — while keeping the same privacy-first approach."
                icon={BarChart3Icon}
                link={{
                  href: '/compare/plausible-alternative',
                  children: 'Full Plausible comparison',
                }}
                title="OpenPanel vs Plausible"
              />
              <FeatureCard
                description="PostHog is a powerful all-in-one platform. OpenPanel is more affordable once you exceed the free tier, simpler to self-host, and focused on analytics without the complexity."
                icon={BarChart3Icon}
                link={{
                  href: '/compare/posthog-alternative',
                  children: 'Full PostHog comparison',
                }}
                title="OpenPanel vs PostHog"
              />
              <FeatureCard
                description="Mixpanel is proprietary and expensive at scale. OpenPanel is open source with similar product analytics capabilities at a fraction of the cost — and you can self-host for free."
                icon={BarChart3Icon}
                link={{
                  href: '/compare/mixpanel-alternative',
                  children: 'Full Mixpanel comparison',
                }}
                title="OpenPanel vs Mixpanel"
              />
            </div>
            <p className="mt-8 max-w-3xl text-muted-foreground">
              Want a deeper look? Read our{' '}
              <Link
                className="text-primary hover:underline"
                href="/articles/open-source-web-analytics"
              >
                comprehensive comparison of 9 open source analytics tools
              </Link>{' '}
              with pricing tables, feature breakdowns, and honest reviews.
            </p>
          </Section>

          {/* Get Started */}
          <Section>
            <SectionHeader
              description="From zero to tracking in minutes. Choose cloud or self-hosted — both give you the full platform."
              title="Get started with open source analytics"
            />
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <div className="col gap-3">
                <div className="center-center size-10 rounded-full bg-primary/10 font-semibold text-primary">
                  1
                </div>
                <h3 className="font-semibold">Sign up or self-host</h3>
                <p className="text-muted-foreground text-sm">
                  Create a free cloud account or{' '}
                  <Link
                    className="text-primary hover:underline"
                    href="/docs/self-hosting/self-hosting"
                  >
                    deploy with Docker Compose
                  </Link>{' '}
                  on your own server.
                </p>
              </div>
              <div className="col gap-3">
                <div className="center-center size-10 rounded-full bg-primary/10 font-semibold text-primary">
                  2
                </div>
                <h3 className="font-semibold">Add a few lines of code</h3>
                <p className="text-muted-foreground text-sm">
                  Install an{' '}
                  <Link
                    className="text-primary hover:underline"
                    href="/docs/sdks"
                  >
                    SDK for your framework
                  </Link>{' '}
                  — React, Next.js, Vue, Astro, Python, and more.
                </p>
              </div>
              <div className="col gap-3">
                <div className="center-center size-10 rounded-full bg-primary/10 font-semibold text-primary">
                  3
                </div>
                <h3 className="font-semibold">Understand your users</h3>
                <p className="text-muted-foreground text-sm">
                  See real-time data in minutes. Build dashboards, track
                  conversions, and explore{' '}
                  <Link
                    className="text-primary hover:underline"
                    href="/features"
                  >
                    all features
                  </Link>
                  .
                </p>
              </div>
            </div>
            <div className="mt-8">
              <GetStartedButton text="Start free trial" />
            </div>
          </Section>

          {/* FAQ */}
          <Section>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SectionHeader
                className="mb-16"
                description="Common questions from teams evaluating open source analytics platforms."
                title="Frequently asked questions about open source analytics"
              />
              <Faqs>
                <FaqItem question="What is the best open source analytics tool?">
                  {
                    'The best open source analytics tool depends on your needs. **OpenPanel** is the best choice for teams that need both web analytics and product analytics in one platform. **PostHog** is ideal for engineering teams wanting analytics plus feature flags and experiments. **Plausible** is best for simple, privacy-first pageview tracking. **Matomo** is the most mature Google Analytics replacement. See our [full comparison of 9 open source analytics tools](/articles/open-source-web-analytics) for a detailed breakdown.'
                  }
                </FaqItem>
                <FaqItem question="Is open source analytics free to self-host?">
                  {
                    'Yes. OpenPanel, PostHog, Plausible, Matomo, and Umami all offer free self-hosting. Your only cost is the server infrastructure — typically $20-50/month for a VPS that can handle millions of events. OpenPanel also offers a [cloud plan](/pricing) starting at $2.50/month with a 30-day free trial if you prefer not to manage servers.'
                  }
                </FaqItem>
                <FaqItem question="Is OpenPanel GDPR compliant?">
                  {
                    'Yes. OpenPanel uses cookieless tracking by design — no cookies are set, no personal data is collected without explicit consent, and no consent banners are needed. This makes OpenPanel compliant with GDPR, CCPA, and PECR out of the box. Self-hosting gives you additional control by keeping all data on your own infrastructure within your preferred jurisdiction.'
                  }
                </FaqItem>
                <FaqItem question="Can OpenPanel replace Google Analytics?">
                  {`Yes. OpenPanel tracks all the metrics Google Analytics provides — pageviews, sessions, referrers, countries, devices, and more — plus product analytics features that GA doesn't offer, like funnels, retention, and individual user journeys. See our [detailed Google Analytics comparison](/compare/google-analytics-alternative) for a full breakdown.`}
                </FaqItem>
                <FaqItem question="What's the difference between web analytics and product analytics?">
                  {
                    '**Web analytics** focuses on website traffic: pageviews, visitors, referrers, bounce rates, and geographic data. **Product analytics** goes deeper into user behavior: event tracking, conversion funnels, retention curves, and individual user journeys. Most tools offer one or the other. OpenPanel combines both in a single platform, so you get the full picture without running separate tools.'
                  }
                </FaqItem>
                <FaqItem question="How does OpenPanel compare to Plausible and Matomo?">
                  {`**Plausible** is the simplest option — lightweight pageview analytics with no complexity. **Matomo** is the most mature — a full Google Analytics replacement with heatmaps and session recordings (paid plugins). **OpenPanel** sits in between: it's as easy to set up as Plausible but adds product analytics features like funnels, retention, and user profiles that Plausible doesn't offer, at a lower cost than Matomo Cloud. See our [Plausible comparison](/compare/plausible-alternative) and [Matomo comparison](/compare/matomo-alternative) for details.`}
                </FaqItem>
                <FaqItem question="Does OpenPanel use cookies?">
                  {`No. OpenPanel uses cookieless tracking by default. No cookies are set on your visitors' browsers, which means you don't need cookie consent banners. This improves both user experience and data accuracy, since tracking isn't affected by cookie blockers or consent rejections.`}
                </FaqItem>
              </Faqs>
            </div>
          </Section>

          <CtaBanner
            description="Join thousands of teams using OpenPanel. Free 30-day trial, no credit card required. Self-host for free or use our cloud."
            title="Start tracking with open source analytics today"
          />
        </div>
      </div>
    </div>
  );
}
