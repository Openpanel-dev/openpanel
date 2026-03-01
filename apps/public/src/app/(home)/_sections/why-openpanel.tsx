'use client';

import { QuoteIcon } from 'lucide-react';
import Image from 'next/image';
import Markdown from 'react-markdown';
import { FeatureCardBackground } from '@/components/feature-card';
import { Section, SectionHeader, SectionLabel } from '@/components/section';
import { cn } from '@/lib/utils';

const images = [
  {
    name: 'Lucide Animated',
    url: 'https://lucide-animated.com',
    logo: '/logos/lucide-animated.png',
  },
  {
    name: 'KiddoKitchen',
    url: 'https://kiddokitchen.se',
    logo: '/logos/kiddokitchen.png',
  },
  {
    name: 'Maneken',
    url: 'https://maneken.app',
    logo: '/logos/maneken.png',
  },
  {
    name: 'Midday',
    url: 'https://midday.ai',
    logo: '/logos/midday.png',
  },
  {
    name: 'Screenzen',
    url: 'https://www.screenzen.co',
    logo: '/logos/screenzen.png',
  },
  {
    name: 'Tiptip',
    url: 'https://tiptip.id',
    logo: '/logos/tiptip.png',
  },
];

const quotes: {
  quote: string;
  author: string;
  site?: string;
}[] = [
  {
    quote:
      'After testing several product analytics tools for Strackr, **we chose OpenPanel and we are very satisfied with the product**. We have been using it since the beta, and there are constant updates. Profiles and Conversion Events are our favorite features.',
    author: 'Julien Hany',
    site: 'https://strackr.com',
  },
  {
    quote: `Before OpenPanel, I was using Plausible, and it was ok. **But OpenPanel is like 10 leagues ahead!!** Better UX/UI, many more features, and incredible support from the founder. Bonus point: it's 1 click install on Coolify!! I won't switch to anything else 😎`,
    author: 'Thomas Sanlis',
    site: 'https://uneed.best',
  },
  {
    quote: `We've been using OpenPanel for almost three months and we're extremely happy with it. After paying a lot to PostHog for years, OpenPanel gives us the same, in many ways better, analytics while keeping full ownership of our data. It's truly self-hosted but surprisingly low maintenance: setup and ongoing upkeep are straightforward, so we spend less time managing tooling and more time acting on insights.\n\nOpenPanel delivers the metrics we need to understand our website and app performance and how users actually interact with them. The dashboards are clear, the data is reliable, and the feature set covers everything we relied on before. The support is absolutely fantastic: responsive, helpful, and knowledgeable, and that made the switch effortless. We honestly don’t want to run any business without OpenPanel anymore.`,
    author: 'Self-hosting users',
  },
];

export function WhyOpenPanel() {
  return (
    <Section className="container gap-16">
      <SectionHeader label="Trusted by founders" title="Who uses OpenPanel?" />
      <div className="col overflow-hidden">
        <SectionLabel className="z-5 -mb-2 self-start bg-background pr-4 text-muted-foreground">
          USED BY
        </SectionLabel>
        <div className="-mx-4 grid grid-cols-3 border-y py-4 md:grid-cols-6">
          {images.map((image) => (
            <div className="border-r px-4 last:border-r-0" key={image.logo}>
              <a
                className={cn('group center-center relative aspect-square')}
                href={image.url}
                key={image.logo}
                rel="noopener noreferrer nofollow"
                target="_blank"
                title={image.name}
              >
                <FeatureCardBackground />
                <Image
                  alt={image.name}
                  className={cn('size-16 object-contain dark:invert')}
                  height={64}
                  src={image.logo}
                  width={64}
                />
              </a>
            </div>
          ))}
        </div>
        <div className="-mx-4 grid grid-cols-1 border-y py-4 md:grid-cols-2">
          {quotes.map((quote) => (
            <figure
              className="group px-4 py-4 md:odd:border-r"
              key={quote.author}
            >
              <QuoteIcon className="mb-2 size-10 stroke-1 text-muted-foreground/50 transition-all group-hover:rotate-6 group-hover:text-foreground" />
              <blockquote className="prose text-xl">
                <Markdown>{quote.quote}</Markdown>
              </blockquote>
              <figcaption className="row mt-4 justify-between text-muted-foreground text-sm">
                <span>{quote.author}</span>
                {quote.site && (
                  <cite className="not-italic">
                    <a
                      href={quote.site}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {quote.site.replace('https://', '')}
                    </a>
                  </cite>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Section>
  );
}
