import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import { CompareTrustCompliance } from '@/lib/compare';
import { ShieldIcon, MapPinIcon, ServerIcon } from 'lucide-react';
import { CheckIcon, XIcon } from 'lucide-react';

interface TrustComplianceProps {
  trust: CompareTrustCompliance;
}

export function TrustCompliance({ trust }: TrustComplianceProps) {
  return (
    <Section className="container">
      <SectionHeader
        title={trust.title}
        description={trust.intro}
        variant="sm"
      />
      <div className="grid md:grid-cols-2 gap-6 mt-12">
        <FeatureCard
          title="OpenPanel"
          description=""
          className="border-green-500/20 bg-green-500/5"
        >
          <div className="col gap-4 mt-4">
            <div className="col gap-2">
              <div className="row gap-2 items-center text-sm">
                <ShieldIcon className="size-4" />
                <span className="font-medium">Data Processing</span>
              </div>
              <p className="text-sm text-muted-foreground ml-6">
                {trust.openpanel.data_processing}
              </p>
            </div>
            <div className="col gap-2">
              <div className="row gap-2 items-center text-sm">
                <MapPinIcon className="size-4" />
                <span className="font-medium">Data Location</span>
              </div>
              <p className="text-sm text-muted-foreground ml-6">
                {trust.openpanel.data_location}
              </p>
            </div>
            <div className="col gap-2">
              <div className="row gap-2 items-center text-sm">
                <ServerIcon className="size-4" />
                <span className="font-medium">Self-Hosting</span>
              </div>
              <div className="row gap-2 items-center text-sm ml-6">
                {trust.openpanel.self_hosting ? (
                  <>
                    <CheckIcon className="size-4 text-green-500" />
                    <span className="text-muted-foreground">Available</span>
                  </>
                ) : (
                  <>
                    <XIcon className="size-4 text-red-500" />
                    <span className="text-muted-foreground">Not available</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </FeatureCard>
        <FeatureCard title="Competitor" description="">
          <div className="col gap-4 mt-4">
            <div className="col gap-2">
              <div className="row gap-2 items-center text-sm">
                <ShieldIcon className="size-4" />
                <span className="font-medium">Data Processing</span>
              </div>
              <p className="text-sm text-muted-foreground ml-6">
                {trust.competitor.data_processing}
              </p>
            </div>
            <div className="col gap-2">
              <div className="row gap-2 items-center text-sm">
                <MapPinIcon className="size-4" />
                <span className="font-medium">Data Location</span>
              </div>
              <p className="text-sm text-muted-foreground ml-6">
                {trust.competitor.data_location}
              </p>
            </div>
            <div className="col gap-2">
              <div className="row gap-2 items-center text-sm">
                <ServerIcon className="size-4" />
                <span className="font-medium">Self-Hosting</span>
              </div>
              <div className="row gap-2 items-center text-sm ml-6">
                {trust.competitor.self_hosting ? (
                  <>
                    <CheckIcon className="size-4 text-green-500" />
                    <span className="text-muted-foreground">Available</span>
                  </>
                ) : (
                  <>
                    <XIcon className="size-4 text-red-500" />
                    <span className="text-muted-foreground">Not available</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </FeatureCard>
      </div>
    </Section>
  );
}

