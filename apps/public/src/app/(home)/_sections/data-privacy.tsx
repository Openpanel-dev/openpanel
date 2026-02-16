import { BoltIcon, GithubIcon, ServerIcon } from 'lucide-react';
import Link from 'next/link';
import { FeatureCard } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { DataOwnershipIllustration } from '@/components/illustrations/data-ownership';
import { PrivacyIllustration } from '@/components/illustrations/privacy';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';

const secondaryFeatures = [
  {
    title: 'Open Source',
    description:
      'Full transparency. Audit the code, contribute, fork it, or self-host without lock-in.',
    icon: GithubIcon,
  },
  {
    title: 'Self-hosting',
    description:
      'Deploy OpenPanel anywhere - your server, your cloud, or locally. Full flexibility.',
    icon: ServerIcon,
  },
  {
    title: 'Lightweight & Fast',
    description:
      "A tiny, high-performance tracker that won't slow down your site.",
    icon: BoltIcon,
  },
];

export function DataPrivacy() {
  return (
    <Section className="container">
      <SectionHeader
        description="OpenPanel gives you analytics on your terms - privacy-friendly, open-source, and fully self-hostable. Every part of the platform is designed to put you in control of your data while delivering fast, reliable insights without compromising user trust."
        title={
          <>
            Built for Control,
            <br />
            Transparency & Trust
          </>
        }
      />
      <div className="mt-16 mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <FeatureCard
          description="Privacy-first analytics without cookies, fingerprinting, or invasive tracking. Built for compliance and user trust."
          illustration={<PrivacyIllustration />}
          title="Privacy-first"
          variant="large"
        />
        <FeatureCard
          description="You own your data - no vendors, no sharing, no hidden processing. Store analytics on your own infrastructure and stay in full control."
          illustration={<DataOwnershipIllustration />}
          title="Data Ownership"
          variant="large"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {secondaryFeatures.map((feature) => (
          <FeatureCard
            description={feature.description}
            icon={feature.icon}
            key={feature.title}
            title={feature.title}
          />
        ))}
      </div>
      <div className="row mt-8 gap-4">
        <GetStartedButton />
        <Button asChild className="px-6" size="lg" variant="outline">
          <Link href="/docs/self-hosting/self-hosting">Self-host for free</Link>
        </Button>
      </div>
    </Section>
  );
}
