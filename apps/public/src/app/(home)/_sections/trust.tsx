import {
  CookieIcon,
  GithubIcon,
  type LucideIcon,
  ServerIcon,
} from 'lucide-react';
import Link from 'next/link';
import { EuFlag } from '@/components/eu-flag';
import { SectionHeader } from '@/components/section';

interface Reason {
  title: string;
  description: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
}

const REASONS: Reason[] = [
  {
    title: 'Open source',
    description:
      'AGPL licensed. Every line is on GitHub, no enterprise edition.',
    icon: GithubIcon,
  },
  {
    title: 'Self-host for free',
    description:
      'Docker Compose and one setup script. Your servers, your data, no limits.',
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
    <section className="col container gap-12 py-16 md:py-24">
      <SectionHeader
        align="center"
        description="Open-source product analytics you can run yourself, or let us run for you."
        title="Why teams pick OpenPanel"
        variant="sm"
      />
      <ul className="grid grid-cols-1 divide-y divide-neutral-200 rounded-3xl bg-white ring-1 ring-black/4 sm:grid-cols-2 sm:divide-y-0 md:grid-cols-4 md:divide-x">
        {REASONS.map((reason) => (
          <li className="col gap-3 p-7" key={reason.title}>
            <span className="center-center size-9 rounded-xl bg-neutral-100">
              <reason.icon className="size-4" />
            </span>
            <span className="font-medium">{reason.title}</span>
            <span className="text-neutral-600 text-sm leading-relaxed">
              {reason.description}
            </span>
          </li>
        ))}
      </ul>
      <p className="row flex-wrap items-center justify-center gap-x-2 gap-y-1 text-neutral-500 text-sm">
        <span>Switching? OpenPanel compared to</span>
        {COMPARE_LINKS.map((item) => (
          <Link
            className="font-medium text-neutral-900 underline-offset-4 hover:underline"
            href={item.href}
            key={item.href}
          >
            {item.name}
          </Link>
        ))}
        <Link className="underline-offset-4 hover:underline" href="/compare">
          and more
        </Link>
      </p>
    </section>
  );
}
