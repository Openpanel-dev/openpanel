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
          Mark events as conversions to highlight and soon notifications with
          out iOS/Android app.
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
        <div className="flex gap-2 flex-wrap">
          <div className="border border-border px-3 py-1 rounded">
            ✅ Linear
          </div>
          <div className="border border-border px-3 py-1 rounded">✅ Area</div>
          <div className="border border-border px-3 py-1 rounded">✅ Bar</div>
          <div className="border border-border px-3 py-1 rounded">✅ Map</div>
          <div className="border border-border px-3 py-1 rounded">✅ Pie</div>
          <div className="border border-border px-3 py-1 rounded">
            ✅ Funnels
          </div>
          <div className="border border-border px-3 py-1 rounded">
            ✅ Histogram
          </div>
          <div className="border border-border px-3 py-1 rounded">
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
          Deep dive into your user's behavior and understand how they interact
          with your app/website.
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
    <section className={cn('py-16 group', className)}>
      <div
        className={cn(
          'container flex min-h-[300px] items-center gap-16 justify-between max-md:flex-col-reverse',
          !even && 'md:flex-row-reverse'
        )}
      >
        <div className="flex flex-col w-full">
          <Heading3 className="mb-2">{title}</Heading3>
          <div className="prose-xl">{children}</div>
        </div>
        <div className="w-full">
          <Image
            src={image}
            alt={title}
            width={600}
            height={400}
            className="border-8 border-black/5 rounded-xl w-full max-w-xl group-hover:rotate-1 group-hover:scale-[101%] transition-transform duration-500"
          />
        </div>
      </div>
    </section>
  );
}
