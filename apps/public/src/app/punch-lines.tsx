import { cn } from '@/utils/cn';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ClockIcon,
  CloudIcon,
  CookieIcon,
  DollarSignIcon,
  HandshakeIcon,
  KeyIcon,
} from 'lucide-react';
import Image from 'next/image';

import { Heading2, Heading3, Heading4 } from './copy';

const items = [
  {
    title: 'Own Your Own Data',
    description: (
      <p>
        All our serveres are hosted in EU (Stockholm) and we are fully GDPR
        compliant.
      </p>
    ),
    icon: KeyIcon,
    color: '#2563EB',
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
    className: '', // bg-[#7fe1d8]
  },
  {
    title: 'No cookies!',
    description: (
      <p>
        Our trackers are cookie-free, skip that annyoing cookie consent banner!
      </p>
    ),
    icon: CookieIcon,
    color: '#f8bc3c',
    className: 'bg-blue-dark', //'bg-[#f8bc3c]',
  },
  {
    title: 'Cost-Effective',
    description: (
      <p>
        We have combined the best from Mixpanel and Plausible. Cut the costs and
        keep the features.
      </p>
    ),
    icon: DollarSignIcon,
    color: '#0f7ea0',
    className: 'bg-[#3ba974]',
  },
  {
    title: 'Predictable pricing',
    description: (
      <p>You only pay for events, everything else is included. No surprises.</p>
    ),
    icon: HandshakeIcon,
    color: '#0f7ea0',
    className: 'bg-[#3ba974]',
  },
  {
    title: 'First Class React Native Support',
    description: (
      <p>
        Our SDK is built with React Native in mind, making it easy to integrate
        with your mobile apps.
      </p>
    ),
    icon: (({ className }: LucideProps) => {
      return (
        <Image
          src="/react-native.svg"
          alt="React Native"
          className={cn(className, 'p-3')}
          width={50}
          height={50}
        />
      );
    }) as unknown as LucideIcon,
    color: '#3ba974',
    className: 'bg-[#e19900]',
  },
];

export function PunchLines() {
  return (
    <div className="bg-slate-700 py-32">
      <Heading2 className="text-white text-center mb-16">
        Not convinced?
      </Heading2>
      <div className="container">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                className="border border-border p-6 rounded-xl bg-white"
                key={item.title}
              >
                <div
                  className={cn(
                    'h-14 w-14 rounded-full flex items-center justify-center mb-4',
                    item.color
                  )}
                  style={{ background: item.color }}
                >
                  <Icon color="#fff" />
                </div>
                <Heading4>{item.title}</Heading4>
                <div className="prose">{item.description}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
