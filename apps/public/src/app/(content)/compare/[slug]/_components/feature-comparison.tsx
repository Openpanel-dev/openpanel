import { CheckIcon, XIcon } from 'lucide-react';
import { Section, SectionHeader } from '@/components/section';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { CompareFeatureGroup } from '@/lib/compare';

interface FeatureComparisonProps {
  featureGroups: CompareFeatureGroup[];
}

function renderFeatureValue(value: boolean | string) {
  if (typeof value === 'boolean') {
    return value ? (
      <CheckIcon className="size-5 text-green-500" />
    ) : (
      <XIcon className="size-5 text-red-500" />
    );
  }
  return <span className="text-muted-foreground text-sm">{value}</span>;
}

export function FeatureComparison({ featureGroups }: FeatureComparisonProps) {
  return (
    <Section className="container">
      <SectionHeader
        align="center"
        description="Detailed breakdown of capabilities"
        title="Feature comparison"
      />
      <div className="col mt-12 gap-4">
        {featureGroups.map((group) => (
          <div className="overflow-hidden rounded-3xl border" key={group.group}>
            <Accordion className="w-full" collapsible type="single">
              <AccordionItem className="border-0" value={group.group}>
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <h3 className="font-semibold text-lg">{group.group}</h3>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <div className="col gap-4">
                    {group.features.map((feature) => (
                      <div
                        className="grid gap-4 border-b py-3 last:border-b-0 md:grid-cols-3"
                        key={feature.name}
                      >
                        <div className="font-medium text-sm">
                          {feature.name}
                        </div>
                        <div className="row items-center gap-2">
                          {renderFeatureValue(feature.openpanel)}
                        </div>
                        <div className="row items-center gap-2 text-muted-foreground">
                          {renderFeatureValue(feature.competitor)}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        ))}
      </div>
    </Section>
  );
}
