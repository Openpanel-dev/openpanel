import { DollarSignIcon } from 'lucide-react';
import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import type { ComparePricing } from '@/lib/compare';
import { cn } from '@/lib/utils';

interface PricingComparisonRow {
  feature: string;
  openpanel: string;
  competitor: string;
}

interface PricingComparisonProps {
  pricing: ComparePricing;
  pricingTable?: PricingComparisonRow[];
  competitorName: string;
}

export function PricingComparison({
  pricing,
  pricingTable = [],
  competitorName,
}: PricingComparisonProps) {
  return (
    <Section className="container">
      <SectionHeader
        align="center"
        description={pricing.intro}
        title={pricing.title}
      />
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <FeatureCard
          className="border-green-500/20 bg-green-500/5"
          description={pricing.openpanel.model}
          icon={DollarSignIcon}
          title="OpenPanel"
        >
          <div className="col mt-4 gap-3">
            <p className="text-muted-foreground text-sm">
              {pricing.openpanel.description}
            </p>
          </div>
        </FeatureCard>
        <FeatureCard
          description={pricing.competitor.model}
          icon={DollarSignIcon}
          title={competitorName}
        >
          <div className="col mt-4 gap-3">
            <p className="text-muted-foreground text-sm">
              {pricing.competitor.description}
            </p>
            {pricing.competitor.free_tier && (
              <p className="text-muted-foreground text-xs">
                Free tier: {pricing.competitor.free_tier}
              </p>
            )}
          </div>
        </FeatureCard>
      </div>
      {pricingTable.length > 0 && (
        <div className="mt-12 overflow-hidden rounded-3xl border">
          <div className="divide-y divide-border">
            {pricingTable.map((row, index) => (
              <div
                className={cn(
                  'grid gap-4 p-6 md:grid-cols-3',
                  index % 2 === 0 ? 'bg-muted/30' : 'bg-background'
                )}
                key={row.feature}
              >
                <div className="font-semibold text-sm md:text-base">
                  {row.feature}
                </div>
                <div className="text-sm">{row.openpanel}</div>
                <div className="text-muted-foreground text-sm">
                  {row.competitor}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
