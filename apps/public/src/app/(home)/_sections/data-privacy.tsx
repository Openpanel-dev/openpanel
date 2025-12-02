import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import { BoltIcon, GithubIcon, ServerIcon } from 'lucide-react';
import { DataOwnershipIllustration } from './illustrations/data-ownership';
import { PrivacyIllustration } from './illustrations/privacy';

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
        title={
          <>
            Built for Control,
            <br />
            Transparency & Trust
          </>
        }
        description="OpenPanel gives you analytics on your terms - privacy-friendly, open-source, and fully self-hostable. Every part of the platform is designed to put you in control of your data while delivering fast, reliable insights without compromising user trust."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 mt-16">
        <FeatureCard
          variant="large"
          title="Privacy-first"
          description="Privacy-first analytics without cookies, fingerprinting, or invasive tracking. Built for compliance and user trust."
          illustration={<PrivacyIllustration />}
        />
        <FeatureCard
          variant="large"
          title="Data Ownership"
          description="You own your data - no vendors, no sharing, no hidden processing. Store analytics on your own infrastructure and stay in full control."
          illustration={<DataOwnershipIllustration />}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {secondaryFeatures.map((feature) => (
          <FeatureCard
            key={feature.title}
            title={feature.title}
            description={feature.description}
            icon={feature.icon}
          />
        ))}
      </div>
    </Section>
  );
}
