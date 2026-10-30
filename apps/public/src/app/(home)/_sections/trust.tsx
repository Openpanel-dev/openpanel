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
      'Hosted in the EU, GDPR compliant, from $2.50 a month with unlimited everything except events.',
    icon: EuFlag,
  },
  {
    title: 'No cookies',
    description:
      'Cookie-less tracking out of the box, so you can skip the consent banner.',
    icon: CookieIcon,
  },
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
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {REASONS.map((reason) => (
          <li className="col gap-3 rounded-2xl border p-6" key={reason.title}>
            <reason.icon className="size-5" />
            <span className="font-medium">{reason.title}</span>
            <span className="text-muted-foreground text-sm leading-relaxed">
              {reason.description}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-center text-muted-foreground">
        Switching? See how OpenPanel compares to{' '}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href="/compare/mixpanel-alternative"
        >
          Mixpanel
        </Link>
        ,{' '}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href="/compare/posthog-alternative"
        >
          PostHog
        </Link>
        ,{' '}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href="/compare/plausible-alternative"
        >
          Plausible
        </Link>{' '}
        and{' '}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href="/compare"
        >
          more
        </Link>
        .
      </p>
    </section>
  );
}
