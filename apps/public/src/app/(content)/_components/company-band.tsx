import {
  ArrowUpRightIcon,
  GithubIcon,
  LightbulbIcon,
  type LucideIcon,
  MailIcon,
  MessagesSquareIcon,
  TwitterIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Band } from '@/components/band';
import { Reveal } from '@/components/reveal';
import { SectionLabel } from '@/components/section';

export interface ContactChannel {
  name: string;
  handle: string;
  href: string;
  icon: LucideIcon;
}

export const CONTACT_CHANNELS: ContactChannel[] = [
  {
    name: 'Email',
    handle: 'hello@openpanel.dev',
    href: 'mailto:hello@openpanel.dev',
    icon: MailIcon,
  },
  {
    name: 'Discord',
    handle: 'Chat with the team and community',
    href: 'https://go.openpanel.dev/discord',
    icon: MessagesSquareIcon,
  },
  {
    name: 'GitHub',
    handle: 'Openpanel-dev/openpanel',
    href: 'https://github.com/Openpanel-dev/openpanel',
    icon: GithubIcon,
  },
  {
    name: 'X',
    handle: '@OpenPanelDev and @CarlLindesvard',
    href: 'https://x.com/OpenPanelDev',
    icon: TwitterIcon,
  },
  {
    name: 'Feedback board',
    handle: 'feedback.openpanel.dev',
    href: 'https://feedback.openpanel.dev',
    icon: LightbulbIcon,
  },
];

const COMPARE_LINKS = [
  { name: 'Mixpanel', href: '/compare/mixpanel-alternative' },
  { name: 'Google Analytics', href: '/compare/google-analytics-alternative' },
  { name: 'Plausible', href: '/compare/plausible-alternative' },
  { name: 'PostHog', href: '/compare/posthog-alternative' },
];

export function ChannelRow({ channel }: { channel: ContactChannel }) {
  const isMail = channel.href.startsWith('mailto:');
  return (
    <a
      className="surface surface-hover group row items-center gap-4 p-4"
      href={channel.href}
      {...(isMail ? {} : { rel: 'noopener', target: '_blank' })}
    >
      <span className="center-center size-10 shrink-0 rounded-xl bg-neutral-50 ring-1 ring-black/5">
        <channel.icon className="size-4" />
      </span>
      <span className="col min-w-0 flex-1">
        <span className="font-medium">{channel.name}</span>
        <span className="truncate text-neutral-500 text-sm">
          {channel.handle}
        </span>
      </span>
      <ArrowUpRightIcon className="size-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-neutral-900" />
    </a>
  );
}

// Who we are and how to reach us. Shared by /about and /contact.
export function CompanyBand() {
  return (
    <Band
      innerClassName="grid grid-cols-1 gap-12 md:grid-cols-[5fr_7fr] md:gap-20"
      tone="grey"
    >
      <Reveal className="col gap-6">
        <SectionLabel>The company</SectionLabel>
        <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
          OpenPanel AB, Stockholm
        </h2>
        <p className="text-lg text-neutral-600">
          A small, independent team in Sweden. You talk to the people who build
          the product, not a ticket queue.
        </p>
        <address className="text-neutral-600 not-italic leading-relaxed">
          OpenPanel AB
          <br />
          Sankt Eriksgatan 100
          <br />
          113 31 Stockholm
          <br />
          Sweden
        </address>
        <p className="text-neutral-500 text-sm">
          Comparing tools? See OpenPanel next to{' '}
          {COMPARE_LINKS.map((item, index) => (
            <span key={item.href}>
              <Link
                className="font-medium text-neutral-900 underline-offset-4 hover:underline"
                href={item.href}
              >
                {item.name}
              </Link>
              {index < COMPARE_LINKS.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </p>
      </Reveal>
      <Reveal className="col gap-3" delay={120}>
        {CONTACT_CHANNELS.map((channel) => (
          <ChannelRow channel={channel} key={channel.name} />
        ))}
      </Reveal>
    </Band>
  );
}
