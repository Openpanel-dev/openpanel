'use client';

import { cn } from '@/utils/cn';
import Image from 'next/image';

import { Heading3 } from './copy';

interface FeatureItem {
  title: string;
  description: string | React.ReactNode;
  className: string;
  image: string;
}

const features: FeatureItem[] = [
  {
    title: 'Visualize Your Data',
    description: (
      <p>
        Gain a deep understanding of your data with our visualization tools.
      </p>
    ),
    className: '',
    image: '/demo-3/img-1.png',
  },
  {
    title: 'Get a good overview',
    description: (
      <p>
        Even though we want to provide advanced charts and graphs, we also want
        you to understand your data at a glance.
      </p>
    ),
    className: 'bg-slate-100',
    image: '/demo-3/img-2.png',
  },
  {
    title: 'Real-Time Data Access',
    description: (
      <>
        <p>
          Access all your events in real-time. No delays or waiting for data to
          be accessible.
        </p>
        <p>
          Mark events as conversions to highlight and get notifications with our
          iOS/Android app (app coming soon!)
        </p>
      </>
    ),
    className: '',
    image: '/demo-3/img-3.png',
  },
  {
    title: 'Unlimited dashboards with charts',
    description: (
      <>
        <p>
          Create beautiful charts and graphs to visualize your data and share
          them with your team.
        </p>
        <div className="flex flex-wrap gap-2">
          <div className="rounded border border-border px-3 py-1">
            ✅ Linear
          </div>
          <div className="rounded border border-border px-3 py-1">✅ Area</div>
          <div className="rounded border border-border px-3 py-1">✅ Bar</div>
          <div className="rounded border border-border px-3 py-1">✅ Map</div>
          <div className="rounded border border-border px-3 py-1">✅ Pie</div>
          <div className="rounded border border-border px-3 py-1">
            ✅ Funnels
          </div>
          <div className="rounded border border-border px-3 py-1">
            ✅ Histogram
          </div>
          <div className="rounded border border-border px-3 py-1">
            ✅ Metrics
          </div>
        </div>
      </>
    ),
    className: 'bg-slate-100',
    image: '/demo-3/img-4.png',
  },
  {
    title: 'Understand your users',
    description: (
      <>
        <p>
          Deep dive into your user&apos;s behavior and understand how they
          interact with your app/website.
        </p>
      </>
    ),
    className: '',
    image: '/demo-3/img-5.png',
  },
];

export function Features() {
  return (
    <div className="flex flex-col">
      {features.map((feature, i) => {
        return (
          <Feature key={feature.title} {...feature} even={i % 2 === 0}>
            {feature.description}
          </Feature>
        );
      })}
    </div>
  );
}

export function Feature({
  title,
  children,
  className,
  image,
  even,
}: FeatureItem & { even: boolean; children: React.ReactNode }) {
  return (
    <section className={cn('group py-16', className)}>
      <div
        className={cn(
          'container flex min-h-[300px] items-center justify-between gap-16 max-md:flex-col-reverse',
          !even && 'md:flex-row-reverse',
        )}
      >
        <div className="flex w-full flex-col">
          <Heading3 className="mb-2">{title}</Heading3>
          <div className="prose-xl">{children}</div>
        </div>
        <div className="w-full">
          <Image
            src={image}
            alt={title}
            width={600}
            height={400}
            className="w-full max-w-xl rounded-xl border-8 border-black/5 transition-transform duration-500 group-hover:rotate-1 group-hover:scale-[101%]"
          />
        </div>
      </div>
    </section>
  );
}
