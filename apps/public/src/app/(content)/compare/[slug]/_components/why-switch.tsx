import {
  CheckCircleIcon,
  MoonIcon,
  SearchIcon,
  ServerIcon,
  ShieldIcon,
  SparklesIcon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react';
import { Section, SectionHeader } from '@/components/section';
import type { CompareSummary } from '@/lib/compare';

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
        description={summary.intro}
        title={summary.title}
        variant="sm"
      />
      <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {benefits.map((benefit, index) => {
          const Icon = benefitIcons[index] || CheckCircleIcon;
          return (
            <div className="col gap-3" key={benefit}>
              <div className="center-center size-10 rounded-lg bg-primary/10">
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
