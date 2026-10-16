import {
  CheckIcon,
  MapPinIcon,
  ServerIcon,
  ShieldIcon,
  XIcon,
} from 'lucide-react';
import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import type { CompareTrustCompliance } from '@/lib/compare';

interface TrustComplianceProps {
  trust: CompareTrustCompliance;
}

export function TrustCompliance({ trust }: TrustComplianceProps) {
  return (
    <Section className="container">
      <SectionHeader
        description={trust.intro}
        title={trust.title}
        variant="sm"
      />
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <FeatureCard
          className="border-green-500/20 bg-green-500/5"
          description=""
          title="OpenPanel"
        >
          <div className="col mt-4 gap-4">
            <div className="col gap-2">
              <div className="row items-center gap-2 text-sm">
                <ShieldIcon className="size-4" />
                <span className="font-medium">Data Processing</span>
              </div>
              <p className="ml-6 text-muted-foreground text-sm">
                {trust.openpanel.data_processing}
              </p>
            </div>
            <div className="col gap-2">
              <div className="row items-center gap-2 text-sm">
                <MapPinIcon className="size-4" />
                <span className="font-medium">Data Location</span>
              </div>
              <p className="ml-6 text-muted-foreground text-sm">
                {trust.openpanel.data_location}
              </p>
            </div>
            <div className="col gap-2">
              <div className="row items-center gap-2 text-sm">
                <ServerIcon className="size-4" />
                <span className="font-medium">Self-Hosting</span>
              </div>
              <div className="row ml-6 items-center gap-2 text-sm">
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
        <FeatureCard description="" title="Competitor">
          <div className="col mt-4 gap-4">
            <div className="col gap-2">
              <div className="row items-center gap-2 text-sm">
                <ShieldIcon className="size-4" />
                <span className="font-medium">Data Processing</span>
              </div>
              <p className="ml-6 text-muted-foreground text-sm">
                {trust.competitor.data_processing}
              </p>
            </div>
            <div className="col gap-2">
              <div className="row items-center gap-2 text-sm">
                <MapPinIcon className="size-4" />
                <span className="font-medium">Data Location</span>
              </div>
              <p className="ml-6 text-muted-foreground text-sm">
                {trust.competitor.data_location}
              </p>
            </div>
            <div className="col gap-2">
              <div className="row items-center gap-2 text-sm">
                <ServerIcon className="size-4" />
                <span className="font-medium">Self-Hosting</span>
              </div>
              <div className="row ml-6 items-center gap-2 text-sm">
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
