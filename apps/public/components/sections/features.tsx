import {
  Feature,
  FeatureContent,
  FeatureList,
  FeatureListItem,
  FeatureMore,
  SmallFeature,
} from '@/components/feature';
import { Section, SectionHeader } from '@/components/section';
import { Tag } from '@/components/tag';
import {
  ActivityIcon,
  AreaChartIcon,
  BarChart2Icon,
  BarChartIcon,
  CheckIcon,
  ClockIcon,
  CloudIcon,
  ConeIcon,
  CookieIcon,
  DatabaseIcon,
  GithubIcon,
  LayersIcon,
  LineChartIcon,
  LockIcon,
  MapIcon,
  PieChartIcon,
  ServerIcon,
  Share2Icon,
  ShieldIcon,
  UserIcon,
  WalletIcon,
  ZapIcon,
} from 'lucide-react';
import { BatteryIcon } from '../battery-icon';
import { EventsFeature } from './features/events-feature';
import { ProductAnalyticsFeature } from './features/product-analytics-feature';
import { ProfilesFeature } from './features/profiles-feature';
import { WebAnalyticsFeature } from './features/web-analytics-feature';

export function Features() {
  return (
    <Section className="container">
      <SectionHeader
        className="mb-16"
        tag={
          <Tag>
            <BatteryIcon className="size-4" strokeWidth={1.5} />
            Batteries included
          </Tag>
        }
        title="Everything you need"
        description="We have combined the best features from the most popular analytics tools into one simple to use platform."
      />
      <div className="col gap-16">
        <Feature media={<WebAnalyticsFeature />}>
          <FeatureContent
            title="Web analytics"
            content={[
              'Privacy-friendly analytics with all the important metrics you need, in a simple and modern interface.',
            ]}
          />
          <FeatureList
            className="mt-4"
            title="Get a quick overview"
            items={[
              <FeatureListItem key="line" icon={CheckIcon} title="Visitors" />,
              <FeatureListItem key="line" icon={CheckIcon} title="Referrals" />,
              <FeatureListItem key="line" icon={CheckIcon} title="Top pages" />,
              <FeatureListItem
                key="line"
                icon={CheckIcon}
                title="Top entries"
              />,
              <FeatureListItem
                key="line"
                icon={CheckIcon}
                title="Top exists"
              />,
              <FeatureListItem key="line" icon={CheckIcon} title="Devices" />,
              <FeatureListItem key="line" icon={CheckIcon} title="Sessions" />,
              <FeatureListItem
                key="line"
                icon={CheckIcon}
                title="Bounce rate"
              />,
              <FeatureListItem key="line" icon={CheckIcon} title="Duration" />,
              <FeatureListItem key="line" icon={CheckIcon} title="Geography" />,
            ]}
          />
        </Feature>

        <Feature reverse media={<ProductAnalyticsFeature />}>
          <FeatureContent
            title="Product analytics"
            content={[
              'Turn data into decisions with powerful visualizations and real-time insights.',
            ]}
          />
          <FeatureList
            className="mt-4"
            title="Understand your product"
            items={[
              <FeatureListItem key="funnel" icon={ConeIcon} title="Funnel" />,
              <FeatureListItem
                key="retention"
                icon={UserIcon}
                title="Retention"
              />,
              <FeatureListItem
                key="bar"
                icon={BarChartIcon}
                title="A/B tests"
              />,
              <FeatureListItem
                key="pie"
                icon={PieChartIcon}
                title="Conversion"
              />,
            ]}
          />

          <FeatureList
            className="mt-4"
            title="Supported charts"
            items={[
              <FeatureListItem key="line" icon={LineChartIcon} title="Line" />,
              <FeatureListItem key="bar" icon={BarChartIcon} title="Bar" />,
              <FeatureListItem key="pie" icon={PieChartIcon} title="Pie" />,
              <FeatureListItem key="area" icon={AreaChartIcon} title="Area" />,
              <FeatureListItem
                key="histogram"
                icon={BarChart2Icon}
                title="Histogram"
              />,
              <FeatureListItem key="map" icon={MapIcon} title="Map" />,
            ]}
          />
        </Feature>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SmallFeature className="[&_[data-icon]]:hover:bg-blue-500">
            <FeatureContent
              icon={<ClockIcon className="size-8" strokeWidth={1} />}
              title="Real time analytics"
              content={[
                'Get instant insights into your data. No need to wait for data to be processed, like other tools out there, looking at you GA4...',
              ]}
            />
          </SmallFeature>
          <SmallFeature className="[&_[data-icon]]:hover:bg-purple-500">
            <FeatureContent
              icon={<DatabaseIcon className="size-8" strokeWidth={1} />}
              title="Own your own data"
              content={[
                'Own your data, no vendor lock-in. Export all your data with our export API.',
                'Self-host it on your own infrastructure to have complete control.',
              ]}
            />
          </SmallFeature>
          <SmallFeature className="[&_[data-icon]]:hover:bg-indigo-500">
            <FeatureContent
              icon={<CloudIcon className="size-8" strokeWidth={1} />}
              title="Cloud or self-hosted"
              content={[
                'We offer a cloud version of the platform, but you can also self-host it on your own infrastructure.',
              ]}
            />
            <FeatureMore
              href="/docs/self-hosting/self-hosting"
              className="mt-4 -mb-4"
            >
              More about self-hosting
            </FeatureMore>
          </SmallFeature>
          <SmallFeature className="[&_[data-icon]]:hover:bg-green-500">
            <FeatureContent
              icon={<CookieIcon className="size-8" strokeWidth={1} />}
              title="No cookies"
              content={[
                'We care about your privacy, so our tracker does not use cookies. This keeps your data safe and secure.',
                'We follow GDPR guidelines closely, ensuring your personal information is protected without using invasive technologies.',
              ]}
            />
            <FeatureMore
              href="/articles/cookieless-analytics"
              className="mt-4 -mb-4"
            >
              Cookieless analytics
            </FeatureMore>
          </SmallFeature>

          <SmallFeature className="[&_[data-icon]]:hover:bg-gray-500">
            <FeatureContent
              icon={<GithubIcon className="size-8" strokeWidth={1} />}
              title="Open-source"
              content={[
                'Our code is open and transparent. Contribute, fork, or learn from our implementation.',
              ]}
            />
            <FeatureMore
              href="https://git.new/openpanel"
              className="mt-4 -mb-4"
            >
              View the code
            </FeatureMore>
          </SmallFeature>
          <SmallFeature className="[&_[data-icon]]:hover:bg-purple-500">
            <FeatureContent
              icon={<LockIcon className="size-8" strokeWidth={1} />}
              title="Your data, your rules"
              content={[
                'Complete control over your data. Export, delete, or manage it however you need.',
              ]}
            />
          </SmallFeature>
          <SmallFeature className="[&_[data-icon]]:hover:bg-yellow-500">
            <FeatureContent
              icon={<WalletIcon className="size-8" strokeWidth={1} />}
              title="Affordably priced"
              content={[
                'Transparent pricing that scales with your needs. No hidden fees or surprise charges.',
              ]}
            />
          </SmallFeature>
          <SmallFeature className="[&_[data-icon]]:hover:bg-orange-500">
            <FeatureContent
              icon={<ZapIcon className="size-8" strokeWidth={1} />}
              title="Moving fast"
              content={[
                'Regular updates and improvements. We move quickly to add features you need.',
              ]}
            />
          </SmallFeature>
          <SmallFeature className="[&_[data-icon]]:hover:bg-blue-500">
            <FeatureContent
              icon={<ActivityIcon className="size-8" strokeWidth={1} />}
              title="Real-time data"
              content={[
                'See your analytics as they happen. No waiting for data processing or updates.',
              ]}
            />
          </SmallFeature>
          <SmallFeature className="[&_[data-icon]]:hover:bg-indigo-500">
            <FeatureContent
              icon={<Share2Icon className="size-8" strokeWidth={1} />}
              title="Sharable reports"
              content={[
                'Easily share insights with your team. Export and distribute reports with a single click.',
                <i key="soon">Coming soon</i>,
              ]}
            />
          </SmallFeature>
          <SmallFeature className="[&_[data-icon]]:hover:bg-pink-500">
            <FeatureContent
              icon={<BarChart2Icon className="size-8" strokeWidth={1} />}
              title="Visualize your data"
              content={[
                'Beautiful, interactive visualizations that make your data easy to understand.',
              ]}
            />
          </SmallFeature>
          <SmallFeature className="[&_[data-icon]]:hover:bg-indigo-500">
            <FeatureContent
              icon={<LayersIcon className="size-8" strokeWidth={1} />}
              title="Best of both worlds"
              content={[
                'Combine the power of self-hosting with the convenience of cloud deployment.',
              ]}
            />
          </SmallFeature>
        </div>

        <Feature media={<EventsFeature />}>
          <FeatureContent
            title="Your events"
            content={[
              'Track every user interaction with powerful real-time event analytics. See all event properties, user actions, and conversion data in one place.',
              'From pageviews to custom events, get complete visibility into how users actually use your product.',
            ]}
          />
          <FeatureList
            cols={1}
            className="mt-4"
            title="Some goodies"
            items={[
              '• Events arrive within seconds',
              '• Filter on any property or attribute',
              '• Get notified on important events',
              '• Export and analyze event data',
              '• Track user journeys and conversions',
            ]}
          />
        </Feature>
        <Feature reverse media={<ProfilesFeature />}>
          <FeatureContent
            title="Profiles and sessions"
            content={[
              'Get detailed insights into how users interact with your product through comprehensive profile and session tracking. See everything from basic metrics to detailed behavioral patterns.',
              'Track session duration, page views, and user journeys to understand how people actually use your product.',
            ]}
          />
          <FeatureList
            cols={1}
            className="mt-4"
            title="What can you see?"
            items={[
              '• First and last seen dates',
              '• Session duration and counts',
              '• Page views and activity patterns',
              '• User location and device info',
              '• Browser and OS details',
              '• Event history and interactions',
              '• Real-time activity tracking',
            ]}
          />
        </Feature>
      </div>
    </Section>
  );
}
