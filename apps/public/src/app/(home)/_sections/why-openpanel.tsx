'use client';

import { FeatureCardBackground } from '@/components/feature-card';
import { Section, SectionHeader, SectionLabel } from '@/components/section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { QuoteIcon } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import Markdown from 'react-markdown';

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
  const [showMore, setShowMore] = useState(false);
  return (
    <Section className="container gap-16">
      <SectionHeader label="Trusted by founders" title="Who uses OpenPanel?" />
      <div className="col overflow-hidden">
        <SectionLabel className="text-muted-foreground bg-background -mb-2 z-5 self-start pr-4">
          USED BY
        </SectionLabel>
        <div className="grid grid-cols-3 md:grid-cols-6 -mx-4 border-y py-4">
          {images.map((image) => (
            <div key={image.logo} className="px-4 border-r last:border-r-0 ">
              <a
                href={image.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                key={image.logo}
                className={cn('relative group center-center aspect-square')}
                title={image.name}
              >
                <FeatureCardBackground />
                <Image
                  src={image.logo}
                  alt={image.name}
                  width={64}
                  height={64}
                  className={cn('size-16 object-contain dark:invert')}
                />
              </a>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 -mx-4 border-y py-4">
          {quotes.slice(0, showMore ? quotes.length : 2).map((quote) => (
            <figure
              key={quote.author}
              className="px-4 py-4 md:odd:border-r group"
            >
              <QuoteIcon className="size-10 text-muted-foreground/50 stroke-1 mb-2 group-hover:text-foreground group-hover:rotate-6 transition-all" />
              <blockquote className="text-xl prose">
                <Markdown>{quote.quote}</Markdown>
              </blockquote>
              <figcaption className="row justify-between text-muted-foreground text-sm mt-4">
                <span>{quote.author}</span>
                {quote.site && (
                  <cite className="not-italic">
                    <a
                      href={quote.site}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {quote.site.replace('https://', '')}
                    </a>
                  </cite>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
        <Button
          onClick={() => setShowMore((p) => !p)}
          type="button"
          variant="outline"
          className="self-end mt-4"
        >
          {showMore ? 'Show less' : 'View more reviews'}
        </Button>
      </div>
    </Section>
  );
}
