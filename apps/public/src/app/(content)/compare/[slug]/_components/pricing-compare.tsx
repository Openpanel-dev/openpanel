import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { CompetitorMark } from './versus-mark';
import { Logo } from '@/components/logo';
import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';
import type { ComparePriceAtVolume, ComparePricing } from '@/lib/compare';

const OPENPANEL_FROM = '$2.50';
const OPENPANEL_FROM_NOTE = 'a month for 5,000 events. Self-hosting is free.';

function VolumeTable({
  volumes,
  competitorName,
}: {
  volumes: ComparePriceAtVolume[];
  competitorName: string;
}) {
  return (
    <div className="surface overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-neutral-200 border-b text-neutral-500">
            <th className="px-5 py-3 font-medium" scope="col">
              Events a month
            </th>
            <th
              className="bg-blue-50/60 px-5 py-3 font-semibold text-neutral-900"
              scope="col"
            >
              OpenPanel
            </th>
            <th
              className="px-5 py-3 font-semibold text-neutral-900"
              scope="col"
            >
              {competitorName}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {volumes.map((row) => (
            <tr key={row.volume}>
              <th className="px-5 py-3 font-medium" scope="row">
                {row.volume}
              </th>
              <td className="bg-blue-50/40 px-5 py-3 font-mono tabular-nums">
                {row.openpanel}
              </td>
              <td className="px-5 py-3 font-mono text-neutral-600 tabular-nums">
                {row.competitor}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Two cards: what each side costs and how the model works.
export function PricingCompare({
  pricing,
  competitorName,
  competitorSlug,
}: {
  pricing: ComparePricing;
  competitorName: string;
  competitorSlug: string;
}) {
  const competitor = pricing.competitor;
  return (
    <section className="col container gap-10 py-16 md:py-24">
      <Reveal>
        <SectionHeader
          align="center"
          description={pricing.intro}
          label="Pricing"
          title={pricing.title}
          variant="sm"
        />
      </Reveal>
      <Reveal className="grid grid-cols-1 gap-4 md:grid-cols-2" delay={80}>
        <div className="surface col gap-5 p-6 md:p-8">
          <span className="row items-center gap-2">
            <span className="center-center size-7 rounded-lg bg-blue-600">
              <Logo className="h-3 w-auto text-white" />
            </span>
            <span className="font-semibold text-lg">OpenPanel</span>
          </span>
          <div className="col gap-1">
            <span className="font-mono font-semibold text-4xl tabular-nums tracking-tight">
              {OPENPANEL_FROM}
            </span>
            <span className="text-neutral-500 text-sm">
              {OPENPANEL_FROM_NOTE}
            </span>
          </div>
          <p className="font-medium text-sm">{pricing.openpanel.model}</p>
          <p className="text-neutral-600 text-sm leading-relaxed">
            {pricing.openpanel.description}
          </p>
          <Link
            className="row w-fit items-center gap-1.5 font-medium text-sm transition-colors hover:text-blue-700"
            href="/pricing"
          >
            Every tier
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        <div className="surface col gap-5 p-6 md:p-8">
          <CompetitorMark name={competitorName} slug={competitorSlug} />
          <div className="col gap-1">
            <span className="font-semibold text-2xl tracking-tight">
              {competitor.model}
            </span>
            {competitor.free_tier && (
              <span className="text-neutral-500 text-sm">
                Free tier: {competitor.free_tier}
              </span>
            )}
          </div>
          <p className="text-neutral-600 text-sm leading-relaxed">
            {competitor.description}
          </p>
          {competitor.pricing_url && (
            <Link
              className="row w-fit items-center gap-1.5 font-medium text-sm transition-colors hover:text-blue-700"
              href={competitor.pricing_url}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              {competitorName} pricing page
              <ArrowRightIcon className="size-4" />
            </Link>
          )}
        </div>
      </Reveal>
      {pricing.volumes && pricing.volumes.length > 0 && (
        <Reveal delay={140}>
          <VolumeTable
            competitorName={competitorName}
            volumes={pricing.volumes}
          />
        </Reveal>
      )}
    </section>
  );
}
