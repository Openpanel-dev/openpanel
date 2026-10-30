import Image from 'next/image';
import { Testimonials } from './testimonials';

// Add a company here once they have agreed to be shown.
const LOGOS = [
  { name: 'Midday', url: 'https://midday.ai', logo: '/logos/midday.png' },
  {
    name: 'Screenzen',
    url: 'https://www.screenzen.co',
    logo: '/logos/screenzen.png',
  },
  { name: 'Tiptip', url: 'https://tiptip.id', logo: '/logos/tiptip.png' },
  { name: 'Maneken', url: 'https://maneken.app', logo: '/logos/maneken.png' },
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
];

export function SocialProof() {
  return (
    <>
      <section className="col container items-center gap-6 py-16 md:py-20">
        <p className="text-muted-foreground text-sm">
          Trusted by thousands of projects, from side projects to teams with
          billions of events
        </p>
        <ul className="row flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {LOGOS.map((item) => (
            <li key={item.name}>
              <a
                className="block opacity-60 transition-opacity hover:opacity-100"
                href={item.url}
                rel="noopener noreferrer nofollow"
                target="_blank"
                title={item.name}
              >
                <Image
                  alt={item.name}
                  className="size-12 object-contain grayscale"
                  height={48}
                  src={item.logo}
                  width={48}
                />
              </a>
            </li>
          ))}
        </ul>
      </section>
      <Testimonials className="my-0" limit={3} withHeader={false} />
    </>
  );
}
