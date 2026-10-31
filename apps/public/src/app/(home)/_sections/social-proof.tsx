import Image from 'next/image';
import { Testimonials } from './testimonials';
import { cn } from '@/lib/utils';

interface Customer {
  name: string;
  url: string;
  logo?: string;
}

// Image logos are the ones we already had; the rest are shown as wordmarks and
// come from the self-hosting ping table and paid cloud organisations.
const CUSTOMERS: Customer[] = [
  { name: 'Midday', url: 'https://midday.ai', logo: '/logos/midday.png' },
  { name: 'Fullscript', url: 'https://fullscript.com' },
  { name: 'Coding Ninjas', url: 'https://www.codingninjas.com' },
  { name: 'FlexClip', url: 'https://www.flexclip.com' },
  {
    name: 'Screenzen',
    url: 'https://www.screenzen.co',
    logo: '/logos/screenzen.png',
  },
  { name: 'Easypanel', url: 'https://easypanel.io' },
  { name: 'Newton School', url: 'https://www.newtonschool.co' },
  { name: 'Click Frenzy', url: 'https://www.clickfrenzy.com.au' },
  { name: 'Tiptip', url: 'https://tiptip.id', logo: '/logos/tiptip.png' },
  { name: 'Analogue', url: 'https://www.analogue.co' },
  { name: 'F45 Training', url: 'https://f45training.com' },
  { name: 'Clockodo', url: 'https://www.clockodo.com' },
  { name: 'Maneken', url: 'https://maneken.app', logo: '/logos/maneken.png' },
  { name: 'OpenStatus', url: 'https://www.openstatus.dev' },
  { name: 'Adjust', url: 'https://www.adjust.com' },
  {
    name: 'KiddoKitchen',
    url: 'https://kiddokitchen.se',
    logo: '/logos/kiddokitchen.png',
  },
];

function CustomerMark({ customer }: { customer: Customer }) {
  return (
    <a
      className="row shrink-0 items-center gap-2.5 text-neutral-500 transition-colors hover:text-neutral-900"
      href={customer.url}
      rel="noopener noreferrer nofollow"
      target="_blank"
    >
      {customer.logo && (
        <Image
          alt=""
          className="size-7 object-contain grayscale"
          height={28}
          src={customer.logo}
          width={28}
        />
      )}
      <span className="whitespace-nowrap font-semibold text-lg tracking-tight">
        {customer.name}
      </span>
    </a>
  );
}

export function CustomerLogos({ className }: { className?: string }) {
  const track = [...CUSTOMERS, ...CUSTOMERS];
  return (
    <section
      className={cn('col items-center gap-6 pt-16 pb-6 md:pt-20', className)}
    >
      <p className="container text-center font-medium text-neutral-400 text-xs uppercase tracking-wider">
        Trusted by teams tracking billions of events
      </p>
      <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="row w-max animate-scroll gap-14 [--animation-duration:70s] hover:[animation-play-state:paused]">
          {track.map((customer, index) => (
            <CustomerMark
              customer={customer}
              key={`${customer.name}-${index}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function SocialProof() {
  return (
    <>
      <CustomerLogos />
      <Testimonials className="my-0 pt-16 pb-8" />
    </>
  );
}
