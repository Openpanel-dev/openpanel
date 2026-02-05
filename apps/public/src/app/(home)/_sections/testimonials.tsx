'use client';

import { InfiniteMovingCards } from '@/components/infinite-moving-cards';
import { Section, SectionHeader } from '@/components/section';
import { TwitterCard } from '@/components/twitter-card';
import { useEffect, useMemo, useRef } from 'react';

const testimonials = [
  {
    verified: true,
    avatarUrl: '/twitter-steven.jpg',
    name: 'Steven Tey',
    handle: 'steventey',
    content: [
      'Open-source Mixpanel alternative just dropped → http://git.new/openpanel',
      'It combines the power of Mixpanel + the ease of use of @PlausibleHQ into a fully open-source product.',
      'Built by @CarlLindesvard and it’s already tracking 750K+ events 🤩',
    ],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
  {
    verified: true,
    avatarUrl: '/twitter-pontus.jpg',
    name: 'Pontus Abrahamsson - oss/acc',
    handle: 'pontusab',
    content: ['Thanks, OpenPanel is a beast, love it!'],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
  {
    verified: true,
    avatarUrl: '/twitter-piotr.jpg',
    name: 'Piotr Kulpinski',
    handle: 'piotrkulpinski',
    content: [
      'The Overview tab in OpenPanel is great. It has everything I need from my analytics: the stats, the graph, traffic sources, locations, devices, etc.',
      'The UI is beautiful ✨ Clean, modern look, very pleasing to the eye.',
    ],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
  {
    verified: true,
    avatarUrl: '/twitter-greg.png',
    name: 'greg hodson 🍜',
    handle: 'h0dson',
    content: ['i second this, openpanel is killing it'],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
  {
    verified: true,
    avatarUrl: '/twitter-jacob.jpg',
    name: 'Jacob 🍀 Build in Public',
    handle: 'javayhuwx',
    content: [
      "🤯 wow, it's amazing! Just integrate @OpenPanelDev into http://indiehackers.site last night, and now I can see visitors coming from all round the world.",
      'OpenPanel has a more beautiful UI and much more powerful features when compared to Umami.',
      '#buildinpublic #indiehackers',
    ],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
  {
    verified: true,
    avatarUrl: '/twitter-lee.jpg',
    name: 'Lee',
    handle: 'DutchEngIishman',
    content: [
      'Day two of marketing.',
      'I like this upward trend..',
      'P.S. website went live on Sunday',
      'P.P.S. Openpanel by @CarlLindesvard is awesome.',
    ],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
  {
    verified: true,
    avatarUrl: '/twitter-thomas.jpg',
    name: 'Thomas Sanlis',
    handle: 'T_Zahil',
    content: [
      `We're now sponsoring @OpenPanelDev with Uneed 🥳`,
      `If you're looking for open source analytics, OpenPanel is BY FAR the best I've ever seen`,
      'Bonus: 1-click install on Coolify 🥰',
    ],
    replies: 8,
    retweets: 3,
    likes: 23,
  },
];

export function Testimonials() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>(0);
  const isPausedRef = useRef(false);

  // Duplicate items to create the illusion of infinite scrolling
  const duplicatedTestimonials = useMemo(
    () => [...testimonials, ...testimonials],
    [],
  );

  useEffect(() => {
    const scrollerElement = scrollerRef.current;
    if (!scrollerElement) return;

    const handleScroll = () => {
      // When we've scrolled to the end of the first set, reset to the beginning
      // This creates a seamless infinite scroll effect
      const scrollWidth = scrollerElement.scrollWidth;
      const clientWidth = scrollerElement.clientWidth;
      const scrollLeft = scrollerElement.scrollLeft;

      // Reset scroll position when we reach halfway (end of first set)
      if (scrollLeft + clientWidth >= scrollWidth / 2) {
        scrollerElement.scrollLeft = scrollLeft - scrollWidth / 2;
      }
    };

    // Auto-scroll functionality
    const autoScroll = () => {
      if (!isPausedRef.current && scrollerElement) {
        scrollerElement.scrollLeft += 0.5; // Adjust speed here
        animationFrameRef.current = requestAnimationFrame(autoScroll);
      }
    };

    scrollerElement.addEventListener('scroll', handleScroll);

    // Start auto-scrolling
    animationFrameRef.current = requestAnimationFrame(autoScroll);

    // Pause on hover
    const handleMouseEnter = () => {
      isPausedRef.current = true;
    };
    const handleMouseLeave = () => {
      isPausedRef.current = false;
      animationFrameRef.current = requestAnimationFrame(autoScroll);
    };

    scrollerElement.addEventListener('mouseenter', handleMouseEnter);
    scrollerElement.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      scrollerElement.removeEventListener('scroll', handleScroll);
      scrollerElement.removeEventListener('mouseenter', handleMouseEnter);
      scrollerElement.removeEventListener('mouseleave', handleMouseLeave);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <Section className="overflow-hidden">
      <div className="container mb-16">
        <SectionHeader
          title="Loved by builders everywhere"
          description="From indie hackers to global teams, OpenPanel helps people understand their users effortlessly."
        />
      </div>
      <div className="relative -mx-4 px-4">
        {/* Gradient masks for fade effect */}
        <div
          className="absolute left-0 top-0 bottom-0 w-32 z-10 pointer-events-none"
          style={{
            background:
              'linear-gradient(to right, hsl(var(--background)), transparent)',
          }}
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-32 z-10 pointer-events-none"
          style={{
            background:
              'linear-gradient(to left, hsl(var(--background)), transparent)',
          }}
        />

        <InfiniteMovingCards
          items={testimonials}
          direction="left"
          pauseOnHover
          speed="slow"
          className="gap-8"
          renderItem={(item) => (
            <TwitterCard
              name={item.name}
              handle={item.handle}
              content={item.content}
              avatarUrl={item.avatarUrl}
            />
          )}
        />
      </div>
    </Section>
  );
}
