import { cn } from '@/utils/cn';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ClockIcon,
  CloudIcon,
  CookieIcon,
  DollarSignIcon,
  HandshakeIcon,
  KeyIcon,
  ShieldIcon,
  WebhookIcon,
} from 'lucide-react';
import Image from 'next/image';

import { Heading2, Heading4 } from './copy';

const items = [
  {
    title: 'Own Your Own Data',
    description: (
      <p>
        We believe that you should own your own data. That&apos;s why we
        don&apos;t sell your data to third parties.{' '}
        <strong>Ever. Period.</strong>
      </p>
    ),
    icon: KeyIcon,
    color: '#2563EB',
    className: 'bg-blue-light',
  },
  {
    title: 'GDPR Compliant',
    description: (
      <p>
        All our serveres are hosted in EU (Stockholm) and we are fully GDPR
        compliant.
      </p>
    ),
    icon: ShieldIcon,
    color: '#b051d3',
    className: 'bg-[#b051d3]',
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
  {
    title: 'Powerful Export API',
    description: <p>Use our powerful export API to access your data.</p>,
    icon: WebhookIcon,
    color: '#3ba974',
    className: 'bg-[#e93838]',
  },
];

export function PunchLines() {
  return (
    <div className="bg-blue-darker relative py-32">
      <div className="absolute inset-0 h-full w-full bg-[radial-gradient(circle,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)]" />
      <div className="relative">
        <Heading2 className="mb-16 text-center text-white">
          Not convinced?
        </Heading2>
        <div className="container">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  className="rounded-xl border border-border bg-white p-6"
                  key={item.title}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-14 w-14 items-center justify-center rounded-full',
                      item.color,
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
    </div>
  );
}
