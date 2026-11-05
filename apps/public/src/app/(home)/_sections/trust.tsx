import {
  CookieIcon,
  GithubIcon,
  type LucideIcon,
  ServerIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Band } from '@/components/band';
import { EuFlag } from '@/components/eu-flag';
import { Reveal } from '@/components/reveal';
import { SectionLabel } from '@/components/section';

interface Reason {
  title: string;
  description: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
}

const REASONS: Reason[] = [
  {
    title: 'Open source',
    description:
      'AGPL licensed. Every line is on GitHub, and there is no enterprise edition hiding the good parts.',
    icon: GithubIcon,
  },
  {
    title: 'Self-host for free',
    description:
      'Docker Compose and one setup script. Your servers, your data, no event limits.',
    icon: ServerIcon,
  },
  {
    title: 'EU cloud',
    description:
      'Hosted in the EU, GDPR compliant, from $2.50 a month. Unlimited everything except events.',
    icon: EuFlag,
  },
  {
    title: 'No cookies',
    description:
      'Cookie-less tracking out of the box, so you can skip the consent banner.',
    icon: CookieIcon,
  },
];

const COMPARE_LINKS = [
  { name: 'Mixpanel', href: '/compare/mixpanel-alternative' },
  { name: 'PostHog', href: '/compare/posthog-alternative' },
  { name: 'Plausible', href: '/compare/plausible-alternative' },
  { name: 'Google Analytics', href: '/compare/google-analytics-alternative' },
];

export function Trust() {
  return (
    <Band
      innerClassName="grid grid-cols-1 gap-12 md:grid-cols-[5fr_7fr] md:gap-20"
      tone="grey"
    >
      <Reveal className="col gap-6">
        <SectionLabel>Why OpenPanel</SectionLabel>
        <h2 className="text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-4xl">
          Open source, so you decide where your data lives
        </h2>
        <p className="text-lg text-neutral-600">
          Run it on your own servers for free, or let us run it for you in the
          EU. Same product, same features, no lock-in either way.
        </p>
        <p className="text-neutral-500 text-sm">
          Switching? See OpenPanel compared to{' '}
          {COMPARE_LINKS.map((item, index) => (
            <span key={item.href}>
              <Link
                className="font-medium text-neutral-900 underline-offset-4 hover:underline"
                href={item.href}
              >
                {item.name}
              </Link>
              {index < COMPARE_LINKS.length - 1 ? ', ' : ' '}
            </span>
          ))}
          and{' '}
          <Link
            className="font-medium text-neutral-900 underline-offset-4 hover:underline"
            href="/compare"
          >
            more
          </Link>
          , or read our list of the{' '}
          <Link
            className="font-medium text-neutral-900 underline-offset-4 hover:underline"
            href="/articles/mixpanel-alternatives"
          >
            best Mixpanel alternatives
          </Link>
          .
        </p>
      </Reveal>
      <ul className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2">
        {REASONS.map((reason, index) => (
          <Reveal
            as="li"
            className="col gap-3"
            delay={index * 80}
            key={reason.title}
          >
            <span className="center-center size-10 rounded-xl bg-white shadow-sm ring-1 ring-black/5">
              <reason.icon className="size-4" />
            </span>
            <span className="font-medium text-lg">{reason.title}</span>
            <span className="text-neutral-600 leading-relaxed">
              {reason.description}
            </span>
          </Reveal>
        ))}
      </ul>
    </Band>
  );
}
