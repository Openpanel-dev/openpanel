import { Section, SectionHeader } from '@/components/section';
import { CompareFeatureGroup } from '@/lib/compare';
import { CheckIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

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
  return <span className="text-sm text-muted-foreground">{value}</span>;
}

export function FeatureComparison({ featureGroups }: FeatureComparisonProps) {
  return (
    <Section className="container">
      <SectionHeader
        title="Feature comparison"
        description="Detailed breakdown of capabilities"
        align="center"
      />
      <div className="mt-12 col gap-4">
        {featureGroups.map((group) => (
          <div key={group.group} className="border rounded-3xl overflow-hidden">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value={group.group} className="border-0">
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <h3 className="text-lg font-semibold">{group.group}</h3>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <div className="col gap-4">
                    {group.features.map((feature) => (
                      <div
                        key={feature.name}
                        className="grid md:grid-cols-3 gap-4 py-3 border-b last:border-b-0"
                      >
                        <div className="font-medium text-sm">{feature.name}</div>
                        <div className="row gap-2 items-center">
                          {renderFeatureValue(feature.openpanel)}
                        </div>
                        <div className="row gap-2 items-center text-muted-foreground">
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

