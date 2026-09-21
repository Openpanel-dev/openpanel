import { frameworks } from '@openpanel/sdk-info';
import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { FeatureCardContainer } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';

export function Sdks() {
  return (
    <Section className="container">
      <SectionHeader
        className="mb-16"
        description="Integrate OpenPanel with your favorite framework using our lightweight SDKs. A few lines of code and you're tracking."
        title="Get started in minutes"
      />
      <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
        {frameworks.map((sdk) => (
          <Link href={sdk.href} key={sdk.key}>
            <FeatureCardContainer key={sdk.key}>
              <sdk.IconComponent className="size-6" />
              <div className="row items-center justify-between">
                <span className="font-semibold text-sm">{sdk.name}</span>
                <ArrowRightIcon className="size-4" />
              </div>
            </FeatureCardContainer>
          </Link>
        ))}
      </div>
    </Section>
  );
}
