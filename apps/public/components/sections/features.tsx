import {
  Feature,
  FeatureContent,
  FeatureList,
  FeatureMore,
} from '@/components/feature';
import { Section, SectionHeader } from '@/components/section';
import { Tag } from '@/components/tag';
import {
  AreaChartIcon,
  BarChart2Icon,
  BarChartIcon,
  BatteryIcon,
  ClockIcon,
  CloudIcon,
  ConeIcon,
  CookieIcon,
  DatabaseIcon,
  LineChartIcon,
  MapIcon,
  PieChartIcon,
  UserIcon,
} from 'lucide-react';
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
              '• Visitors',
              '• Referrals',
              '• Top pages',
              '• Top entries',
              '• Top exists',
              '• Devices',
              '• Sessions',
              '• Bounce rate',
              '• Duration',
              '• Geography',
            ]}
          />
          {/* <FeatureMore href="#" className="mt-4">
            And mouch more
          </FeatureMore> */}
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
            title="Supported charts"
            items={[
              <div className="row items-center gap-2" key="line">
                <LineChartIcon
                  className="size-4 text-foreground/70"
                  strokeWidth={1.5}
                />{' '}
                Line
              </div>,
              <div className="row items-center gap-2" key="bar">
                <BarChartIcon
                  className="size-4 text-foreground/70"
                  strokeWidth={1.5}
                />{' '}
                Bar
              </div>,
              <div className="row items-center gap-2" key="pie">
                <PieChartIcon
                  className="size-4 text-foreground/70"
                  strokeWidth={1.5}
                />{' '}
                Pie
              </div>,
              <div className="row items-center gap-2" key="area">
                <AreaChartIcon
                  className="size-4 text-foreground/70"
                  strokeWidth={1.5}
                />{' '}
                Area
              </div>,
              <div className="row items-center gap-2" key="histogram">
                <BarChart2Icon
                  className="size-4 text-foreground/70"
                  strokeWidth={1.5}
                />{' '}
                Histogram
              </div>,
              <div className="row items-center gap-2" key="map">
                <MapIcon
                  className="size-4 text-foreground/70"
                  strokeWidth={1.5}
                />{' '}
                Map
              </div>,
              <div className="row items-center gap-2" key="funnel">
                <ConeIcon
                  className="size-4 text-foreground/70"
                  strokeWidth={1.5}
                />{' '}
                Funnel
              </div>,
              <div className="row items-center gap-2" key="retention">
                <UserIcon
                  className="size-4 text-foreground/70"
                  strokeWidth={1.5}
                />{' '}
                Retention
              </div>,
            ]}
          />
        </Feature>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Feature>
            <FeatureContent
              icon={<ClockIcon className="size-8" strokeWidth={1} />}
              title="Real time analytics"
              content={[
                'Get instant insights into your data. No need to wait for data to be processed, like other tools out there, looking at you GA4...',
              ]}
            />
          </Feature>
          <Feature>
            <FeatureContent
              icon={<DatabaseIcon className="size-8" strokeWidth={1} />}
              title="Own your own data"
              content={[
                'Own your data, no vendor lock-in. Export your all your data or delete it any time',
              ]}
            />
          </Feature>
          <div />
          <div />
          <Feature>
            <FeatureContent
              icon={<CloudIcon className="size-8" strokeWidth={1} />}
              title="Cloud or self-hosted"
              content={[
                'We offer a cloud version of the platform, but you can also self-host it on your own infrastructure.',
              ]}
            />
            <FeatureMore href="#" className="mt-4 -mb-4">
              More about self-hosting
            </FeatureMore>
          </Feature>
          <Feature>
            <FeatureContent
              icon={<CookieIcon className="size-8" strokeWidth={1} />}
              title="No cookies"
              content={[
                'We care about your privacy, so our tracker does not use cookies. This keeps your data safe and secure.',
                'We follow GDPR guidelines closely, ensuring your personal information is protected without using invasive technologies.',
              ]}
            />
          </Feature>
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
