'use client';

import { cn } from '@/utils/cn';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ArrowUpFromDotIcon,
  BarChart2Icon,
  BellIcon,
  BookmarkIcon,
  CheckCircle,
  ClockIcon,
  CloudIcon,
  CloudLightningIcon,
  CompassIcon,
  ConeIcon,
  DatabaseIcon,
  DollarSignIcon,
  DownloadIcon,
  FilterIcon,
  FolderIcon,
  HandCoinsIcon,
  HandshakeIcon,
  KeyIcon,
  PieChartIcon,
  RouteIcon,
  ServerIcon,
  ShieldPlusIcon,
  ShoppingCartIcon,
  StarIcon,
  ThumbsUpIcon,
  TrendingUpIcon,
  UserRoundSearchIcon,
  UsersIcon,
  WebhookIcon,
} from 'lucide-react';

import { Widget } from './widget';

interface SectionItem {
  title: string;
  description: string | React.ReactNode;
  icon: LucideIcon;
  color: string;
  soon?: string;
  icons: LucideIcon[];
  className: string;
}

const sections: SectionItem[] = [
  {
    title: 'Own Your Own Data',
    description: (
      <>
        <p>
          Take control of your data privacy and ownership with our platform,
          ensuring full transparency and security.
        </p>
        <p>
          All our serveres are hosted in EU (Stockholm) and we are fully GDPR
          compliant.
        </p>
      </>
    ),
    icon: KeyIcon,
    color: '#2563EB',
    icons: [FolderIcon, DatabaseIcon, ShieldPlusIcon, KeyIcon],
    className: 'bg-blue-light',
  },
  {
    title: 'Cloud or Self-Hosting',
    description: (
      <p>
        Choose between the flexibility of cloud-based hosting or the autonomy of
        self-hosting to tailor your analytics infrastructure to your needs.
      </p>
    ),
    icon: CloudIcon,
    color: '#ff7557',
    icons: [CloudIcon, CheckCircle, ServerIcon, DownloadIcon],
    className: '', // 'bg-[#ff7557]',
  },
  {
    title: 'Real-Time Events',
    description: (
      <p>
        Stay up-to-date with real-time event tracking, enabling instant insights
        into user actions as they happen.
      </p>
    ),
    icon: ClockIcon,
    color: '#7fe1d8',
    icons: [CloudLightningIcon, ShoppingCartIcon, ArrowUpFromDotIcon],
    className: '', // bg-[#7fe1d8]
  },
  {
    title: 'Deep Dive into User Behaviors',
    description: (
      <p>
        Gain profound insights into user behavior with comprehensive analytics
        tools, allowing you to understand your audience's actions and
        preferences.
      </p>
    ),
    icon: UserRoundSearchIcon,
    color: '#f8bc3c',
    icons: [UsersIcon, RouteIcon, BookmarkIcon],
    className: 'bg-blue-dark', //'bg-[#f8bc3c]',
  },
  {
    title: 'Powerful Report Explorer',
    description: (
      <p>
        Explore and analyze your data effortlessly with our powerful report
        explorer, simplifying the process of deriving meaningful insights.
      </p>
    ),
    icon: CompassIcon,
    color: '#b3596e',
    icons: [ThumbsUpIcon, TrendingUpIcon, PieChartIcon, BarChart2Icon],
    className: 'bg-[#ff7557]',
  },
  {
    soon: 'Coming soon',
    title: 'Funnels',
    description: (
      <p>
        Track user conversion funnels seamlessly, providing valuable insights
        into user journey optimization.
      </p>
    ),
    icon: ConeIcon,
    color: '#72bef4',
    icons: [ConeIcon, FilterIcon],
    className: '', //'bg-[#72bef4]',
  },
  {
    soon: 'Coming with our native app',
    title: 'Push Notifications',
    description: (
      <p>
        Stay informed about conversions, events, and peaks with our upcoming
        push notification tool, empowering you to monitor and respond to
        critical activities in real-time.
      </p>
    ),
    icon: BellIcon,
    color: '#ffb27a',
    icons: [WebhookIcon, BellIcon],
    className: '', //'bg-[#ffb27a]',
  },
  {
    title: 'Cost-Effective Alternative to Mixpanel',
    description: (
      <p>
        Enjoy the same powerful analytics capabilities as Mixpanel at a fraction
        of the cost, ensuring affordability without compromising on quality.
      </p>
    ),
    icon: DollarSignIcon,
    color: '#0f7ea0',
    icons: [DollarSignIcon, HandCoinsIcon, HandshakeIcon, StarIcon],
    className: 'bg-[#3ba974]',
  },
  {
    soon: 'Something Plausible lacks',
    title: 'Great Support for React Native',
    description: (
      <p>
        Benefit from robust support for React Native, ensuring seamless
        integration and compatibility for your projects, a feature notably
        lacking in other platforms like Plausible.
      </p>
    ),
    icon: (({ className }: LucideProps) => {
      return (
        <img src="/react-native.svg" alt="React Native" className={className} />
      );
    }) as unknown as LucideIcon,
    color: '#3ba974',
    icons: [FolderIcon, DatabaseIcon, ShieldPlusIcon, KeyIcon],
    className: 'bg-[#e19900]',
  },
];

// To lazy to think now...
function checkIndex(index: number) {
  switch (index) {
    case 0:
    case 3:
    case 4:
    case 7:
    case 8:
    case 10:
      return true;
    default:
      return false;
  }
}

export function Sections() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 gap-y-16">
        {sections.map((section, i) => {
          const even = checkIndex(i);

          const offsets = even
            ? [
                '-top-10 -left-10 rotate-12',
                'top-10 -rotate-12',
                '-right-5',
                '-right-10 -top-20',
              ]
            : ['-top-10 -left-20 rotate-12', 'top-10 -rotate-12', '-right-5'];

          const className = even
            ? cn('[&_*]:text-white/90 col-span-2', section.className)
            : cn('border border-border', section.className);

          return (
            <Widget
              key={section.title}
              title={section.title}
              className={className}
              icons={section.icons}
              offsets={offsets}
            >
              {section.description}
            </Widget>
          );
        })}
      </div>
    </>
  );
}
