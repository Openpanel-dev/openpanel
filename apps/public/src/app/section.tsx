'use client';

import { cn } from '@/utils/cn';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  BellIcon,
  ClockIcon,
  CloudIcon,
  CompassIcon,
  ConeIcon,
  DollarSignIcon,
  KeyIcon,
  UserRoundSearchIcon,
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

interface SectionItem {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  soon?: string;
  blob: React.ComponentType<LucideProps>;
}

const sections: SectionItem[] = [
  {
    title: 'Own Your Own Data',
    description:
      'Take control of your data privacy and ownership with our platform, ensuring full transparency and security.',
    icon: KeyIcon,
    color: '#2563EB',
    blob: Blob1,
  },
  {
    title: 'Cloud or Self-Hosting',
    description:
      'Choose between the flexibility of cloud-based hosting or the autonomy of self-hosting to tailor your analytics infrastructure to your needs.',
    icon: CloudIcon,
    color: '#ff7557',
    blob: Blob2,
  },
  {
    title: 'Real-Time Events',
    description:
      'Stay up-to-date with real-time event tracking, enabling instant insights into user actions as they happen.',
    icon: ClockIcon,
    color: '#7fe1d8',
    blob: Blob3,
  },
  {
    title: 'Deep Dive into User Behavior',
    description:
      "Gain profound insights into user behavior with comprehensive analytics tools, allowing you to understand your audience's actions and preferences.",
    icon: UserRoundSearchIcon,
    color: '#f8bc3c',
    blob: Blob4,
  },
  {
    title: 'Powerful Report Explorer',
    description:
      'Explore and analyze your data effortlessly with our powerful report explorer, simplifying the process of deriving meaningful insights.',
    icon: CompassIcon,
    color: '#b3596e',
    blob: Blob5,
  },
  {
    soon: 'Coming soon',
    title: 'Funnels',
    description:
      'Track user conversion funnels seamlessly, providing valuable insights into user journey optimization.',
    icon: ConeIcon,
    color: '#72bef4',
    blob: Blob6,
  },
  {
    soon: 'Coming with our native app',
    title: 'Push Notifications',
    description:
      'Stay informed about conversions, events, and peaks with our upcoming push notification tool, empowering you to monitor and respond to critical activities in real-time.',
    icon: BellIcon,
    color: '#ffb27a',
    blob: Blob7,
  },
  {
    title: 'Cost-Effective Alternative to Mixpanel',
    description:
      'Enjoy the same powerful analytics capabilities as Mixpanel at a fraction of the cost, ensuring affordability without compromising on quality.',
    icon: DollarSignIcon,
    color: '#0f7ea0',
    blob: Blob8,
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
    blob: Blob9,
  },
];

interface SectionProps extends SectionItem {
  reverse?: boolean;
}
export function Section({
  title,
  description,
  icon: Icon,
  blob: Blob,
  color,
  soon,
  reverse,
}: SectionProps) {
  return (
    <div key={title} className={'border-b border-border'}>
      <div className="w-full max-w-6xl mx-auto px-4">
        <div className={cn('flex py-16', reverse && 'flex-row-reverse')}>
          <div className="w-1/2 flex-shrink-0 justify-center items-center flex">
            <div className="bg-slate-50 rounded-3xl">
              <Blob
                style={{ fill: color }}
                className="w-[600px] opacity-20 transition-transform animate-[spin_60s_ease-in-out_infinite] -m-[100px]"
              />
            </div>
            <Icon className="w-40 h-40 absolute" strokeWidth={2} />
          </div>
          <div className="justify-center flex-col flex">
            {!!soon && (
              <div className="rounded-full border border-border p-2 px-4 leading-none mb-4 self-start">
                {soon}
              </div>
            )}
            <Heading2 className="mb-4">{title}</Heading2>
            <Lead2>{description}</Lead2>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sections() {
  return (
    <>
      {sections.map((section, index) => (
        <Section key={index} {...section} reverse={index % 2 === 1} />
      ))}
    </>
  );
}
