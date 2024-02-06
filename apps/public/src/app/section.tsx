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
  CloudLightning,
  CloudLightningIcon,
  CompassIcon,
  ConeIcon,
  DatabaseIcon,
  DollarSignIcon,
  DownloadIcon,
  FileIcon,
  FilterIcon,
  FolderIcon,
  FolderOpenIcon,
  HandCoinsIcon,
  HandshakeIcon,
  KeyIcon,
  PieChartIcon,
  PointerIcon,
  RouteIcon,
  ServerIcon,
  ShieldPlusIcon,
  ShoppingCartIcon,
  SquareUserRound,
  StarIcon,
  ThumbsUp,
  ThumbsUpIcon,
  TrendingUpIcon,
  UserRoundSearchIcon,
  UsersIcon,
  WebhookIcon,
} from 'lucide-react';

import {
  Blob1,
  Blob2,
  Blob3,
  Blob4,
  Blob5,
  Blob6,
  Blob7,
  Blob8,
  Blob9,
} from './blob';
import { Heading2, Lead2 } from './copy';
import { Widget } from './widget';

interface SectionItem {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  soon?: string;
  icons: LucideIcon[];
  className: string;
}

const sections: SectionItem[] = [
  {
    title: 'Own Your Own Data',
    description:
      'Take control of your data privacy and ownership with our platform, ensuring full transparency and security.',
    icon: KeyIcon,
    color: '#2563EB',
    icons: [FolderIcon, DatabaseIcon, ShieldPlusIcon, KeyIcon],
    className: 'bg-blue-light',
  },
  {
    title: 'Cloud or Self-Hosting',
    description:
      'Choose between the flexibility of cloud-based hosting or the autonomy of self-hosting to tailor your analytics infrastructure to your needs.',
    icon: CloudIcon,
    color: '#ff7557',
    icons: [CloudIcon, CheckCircle, ServerIcon, DownloadIcon],
    className: '', // 'bg-[#ff7557]',
  },
  {
    title: 'Real-Time Events',
    description:
      'Stay up-to-date with real-time event tracking, enabling instant insights into user actions as they happen.',
    icon: ClockIcon,
    color: '#7fe1d8',
    icons: [CloudLightningIcon, ShoppingCartIcon, ArrowUpFromDotIcon],
    className: '', // bg-[#7fe1d8]
  },
  {
    title: 'Deep Dive into User Behaviors',
    description:
      "Gain profound insights into user behavior with comprehensive analytics tools, allowing you to understand your audience's actions and preferences.",
    icon: UserRoundSearchIcon,
    color: '#f8bc3c',
    icons: [UsersIcon, RouteIcon, BookmarkIcon],
    className: 'bg-blue-dark', //'bg-[#f8bc3c]',
  },
  {
    title: 'Powerful Report Explorer',
    description:
      'Explore and analyze your data effortlessly with our powerful report explorer, simplifying the process of deriving meaningful insights.',
    icon: CompassIcon,
    color: '#b3596e',
    icons: [ThumbsUpIcon, TrendingUpIcon, PieChartIcon, BarChart2Icon],
    className: 'bg-[#ff7557]',
  },
  {
    soon: 'Coming soon',
    title: 'Funnels',
    description:
      'Track user conversion funnels seamlessly, providing valuable insights into user journey optimization.',
    icon: ConeIcon,
    color: '#72bef4',
    icons: [ConeIcon, FilterIcon],
    className: '', //'bg-[#72bef4]',
  },
  {
    soon: 'Coming with our native app',
    title: 'Push Notifications',
    description:
      'Stay informed about conversions, events, and peaks with our upcoming push notification tool, empowering you to monitor and respond to critical activities in real-time.',
    icon: BellIcon,
    color: '#ffb27a',
    icons: [WebhookIcon, BellIcon],
    className: '', //'bg-[#ffb27a]',
  },
  {
    title: 'Cost-Effective Alternative to Mixpanel',
    description:
      'Enjoy the same powerful analytics capabilities as Mixpanel at a fraction of the cost, ensuring affordability without compromising on quality.',
    icon: DollarSignIcon,
    color: '#0f7ea0',
    icons: [DollarSignIcon, HandCoinsIcon, HandshakeIcon, StarIcon],
    className: 'bg-[#3ba974]',
  },
  {
    soon: 'Something Plausible lacks',
    title: 'Great Support for React Native',
    description:
      'Benefit from robust support for React Native, ensuring seamless integration and compatibility for your projects, a feature notably lacking in other platforms like Plausible.',
    icon: (({ className }: LucideProps) => {
      return (
        <img src="/react-native.svg" alt="React Native" className={className} />
      );
    }) as unknown as LucideIcon,
    color: '#3ba974',
    icons: [FolderIcon, DatabaseIcon, ShieldPlusIcon, KeyIcon],
    className: 'bg-[#f8bc3c]',
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
            ? cn('text-white [&_h3]:text-white col-span-2', section.className)
            : cn('border border-border', section.className);

          return (
            <Widget
              key={section.title}
              title={section.title}
              className={className}
              icons={section.icons}
              offsets={offsets}
            >
              <p>{section.description}</p>
            </Widget>
          );
        })}
      </div>
    </>
  );
}
