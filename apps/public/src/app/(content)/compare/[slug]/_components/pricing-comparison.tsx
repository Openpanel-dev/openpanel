import { FeatureCard } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import type { ComparePricing } from '@/lib/compare';
import { cn } from '@/lib/utils';
import { DollarSignIcon } from 'lucide-react';

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
        title={pricing.title}
        description={pricing.intro}
        align="center"
      />
      <div className="grid md:grid-cols-2 gap-6 mt-12">
        <FeatureCard
          title="OpenPanel"
          description={pricing.openpanel.model}
          icon={DollarSignIcon}
          className="border-green-500/20 bg-green-500/5"
        >
          <div className="col gap-3 mt-4">
            <p className="text-sm text-muted-foreground">
              {pricing.openpanel.description}
            </p>
          </div>
        </FeatureCard>
        <FeatureCard
          title={competitorName}
          description={pricing.competitor.model}
          icon={DollarSignIcon}
        >
          <div className="col gap-3 mt-4">
            <p className="text-sm text-muted-foreground">
              {pricing.competitor.description}
            </p>
            {pricing.competitor.free_tier && (
              <p className="text-xs text-muted-foreground">
                Free tier: {pricing.competitor.free_tier}
              </p>
            )}
          </div>
        </FeatureCard>
      </div>
      {pricingTable.length > 0 && (
        <div className="mt-12 border rounded-3xl overflow-hidden">
          <div className="divide-y divide-border">
            {pricingTable.map((row, index) => (
              <div
                key={row.feature}
                className={cn(
                  'grid md:grid-cols-3 gap-4 p-6',
                  index % 2 === 0 ? 'bg-muted/30' : 'bg-background',
                )}
              >
                <div className="font-semibold text-sm md:text-base">
                  {row.feature}
                </div>
                <div className="text-sm">{row.openpanel}</div>
                <div className="text-sm text-muted-foreground">
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
