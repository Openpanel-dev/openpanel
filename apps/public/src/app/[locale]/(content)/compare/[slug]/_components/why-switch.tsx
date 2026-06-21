import { Section, SectionHeader } from '@/components/section';
import { CompareSummary } from '@/lib/compare';
import {
  UsersIcon,
  SparklesIcon,
  SearchIcon,
  MoonIcon,
  ShieldIcon,
  ServerIcon,
  ZapIcon,
  CheckCircleIcon,
} from 'lucide-react';

interface WhySwitchProps {
  summary: CompareSummary;
}

const benefitIcons = [
  UsersIcon,
  SparklesIcon,
  SearchIcon,
  MoonIcon,
  ShieldIcon,
  ServerIcon,
  ZapIcon,
  CheckCircleIcon,
];

export function WhySwitch({ summary }: WhySwitchProps) {
  const benefits = summary.best_for_openpanel.slice(0, 8);

  return (
    <Section className="container">
      <SectionHeader
        title={summary.title}
        description={summary.intro}
        variant="sm"
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mt-12">
        {benefits.map((benefit, index) => {
          const Icon = benefitIcons[index] || CheckCircleIcon;
          return (
            <div key={benefit} className="col gap-3">
              <div className="size-10 rounded-lg bg-primary/10 center-center">
                <Icon className="size-5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">{benefit}</h3>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

