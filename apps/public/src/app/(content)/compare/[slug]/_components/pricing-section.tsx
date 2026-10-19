import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Section, SectionHeader } from '@/components/section';
import type { ComparePriceAtVolume, ComparePricing } from '@/lib/compare';

interface PricingSectionProps {
  pricing: ComparePricing;
  competitorName: string;
}

function VolumeTable({
  volumes,
  competitorName,
}: {
  volumes: ComparePriceAtVolume[];
  competitorName: string;
}) {
  return (
    <div className="mt-10 overflow-x-auto rounded-2xl border">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b bg-muted/30 text-sm">
            <th className="p-4 font-medium text-muted-foreground">
              Monthly volume
            </th>
            <th className="p-4 font-semibold">OpenPanel</th>
            <th className="p-4 font-semibold">{competitorName}</th>
          </tr>
        </thead>
        <tbody>
          {volumes.map((row) => (
            <tr className="border-b align-top last:border-b-0" key={row.volume}>
              <th className="p-4 font-medium text-sm" scope="row">
                {row.volume}
              </th>
              <td className="p-4 text-sm tabular-nums">{row.openpanel}</td>
              <td className="p-4 text-muted-foreground text-sm tabular-nums">
                {row.competitor}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PricingModel({
  name,
  model,
  description,
  children,
}: {
  name: string;
  model: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="col gap-3 rounded-2xl border p-6">
      <div className="col gap-1">
        <h3 className="font-semibold text-lg">{name}</h3>
        <p className="font-medium text-muted-foreground text-sm">{model}</p>
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>
      {children}
    </div>
  );
}

export function PricingSection({
  pricing,
  competitorName,
}: PricingSectionProps) {
  return (
    <Section className="container">
      <SectionHeader
        description={pricing.intro}
        title={pricing.title}
        variant="sm"
      />
      {pricing.volumes && (
        <VolumeTable
          competitorName={competitorName}
          volumes={pricing.volumes}
        />
      )}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <PricingModel
          description={pricing.openpanel.description}
          model={pricing.openpanel.model}
          name="OpenPanel"
        />
        <PricingModel
          description={pricing.competitor.description}
          model={pricing.competitor.model}
          name={competitorName}
        >
          {pricing.competitor.free_tier && (
            <p className="text-muted-foreground text-xs">
              Free tier: {pricing.competitor.free_tier}
            </p>
          )}
          {pricing.competitor.pricing_url && (
            <Link
              className="row items-center gap-1 text-primary text-xs hover:underline"
              href={pricing.competitor.pricing_url}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              {competitorName} pricing page
              <ArrowRightIcon className="size-3" />
            </Link>
          )}
        </PricingModel>
      </div>
    </Section>
  );
}
