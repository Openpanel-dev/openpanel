import { FeatureCardBackground } from '@/components/feature-card';
import { Section, SectionHeader, SectionLabel } from '@/components/section';
import { Tag } from '@/components/tag';
import { cn } from '@/lib/utils';
import { ArrowDownIcon } from 'lucide-react';
import Image from 'next/image';

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

export function WhyOpenPanel() {
  return (
    <Section className="container gap-16">
      <SectionHeader
        label="Trusted by builders"
        title="Join thousands of companies using OpenPanel to understand their users"
      />
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
      </div>
    </Section>
  );
}
