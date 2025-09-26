import { cn } from '@/lib/utils';
import { ArrowDownIcon } from 'lucide-react';
import Image from 'next/image';
import { Section, SectionHeader } from './section';
import { Tag } from './tag';
import { Tooltip } from './ui/tooltip';

const images = [
  {
    name: 'Helpy UI',
    url: 'https://helpy-ui.com',
    logo: 'helpy-ui.png',
    border: true,
  },
  {
    name: 'KiddoKitchen',
    url: 'https://kiddokitchen.se',
    logo: 'kiddokitchen.png',
    border: false,
  },
  {
    name: 'Maneken',
    url: 'https://maneken.app',
    logo: 'maneken.jpg',
    border: false,
  },
  {
    name: 'Midday',
    url: 'https://midday.ai',
    logo: 'midday.png',
    border: true,
  },
  {
    name: 'Screenzen',
    url: 'https://www.screenzen.co',
    logo: 'screenzen.avif',
    border: true,
  },
  {
    name: 'Tiptip',
    url: 'https://tiptip.id',
    logo: 'tiptip.jpg',
    border: true,
  },
];

export function WhyOpenPanel() {
  return (
    <div className="bg-background-light my-12 col">
      <Section className="container my-0 py-20">
        <SectionHeader
          title="Why OpenPanel?"
          description="We built OpenPanel to get the best of both web and product analytics. With that in mind we have created a simple but very powerful platform that can handle most companies needs."
        />
        <div className="center-center col gap-4 -mt-4">
          <Tag>
            <ArrowDownIcon className="size-4" strokeWidth={1.5} />
            With 2000+ registered projects
          </Tag>
          <div className="row gap-4 justify-center flex-wrap">
            {images.map((image) => (
              <a
                href={image.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                key={image.logo}
                className={cn(
                  'group rounded-lg bg-white center-center size-20 hover:scale-110 transition-all duration-300',
                  image.border && 'p-2 border border-border shadow-sm',
                )}
                title={image.name}
              >
                <Image
                  src={`/logos/${image.logo}`}
                  alt={image.name}
                  width={80}
                  height={80}
                  className="rounded-lg grayscale group-hover:grayscale-0 transition-all duration-300"
                />
              </a>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}
