import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckIcon } from 'lucide-react';
import Link from 'next/link';

interface BenefitsSectionProps {
  label?: string;
  title: string;
  description: string;
  cta?: {
    label: string;
    href: string;
  };
  benefits: string[];
  className?: string;
}

export function BenefitsSection({
  label,
  title,
  description,
  cta,
  benefits,
  className,
}: BenefitsSectionProps) {
  return (
    <Section className={cn('container', className)}>
      <div className="max-w-3xl col gap-6">
        {label && (
          <p className="text-sm italic text-primary font-medium">{label}</p>
        )}
        <h2 className="text-4xl md:text-5xl font-semibold leading-tight">
          {title}
        </h2>
        <p className="text-lg text-muted-foreground">{description}</p>
        {cta && (
          <Button size="lg" asChild className="w-fit">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        )}
        <div className="col gap-4 mt-4">
          {benefits.map((benefit) => (
            <div key={benefit} className="row gap-3 items-start">
              <CheckIcon className="size-5 text-green-500 shrink-0 mt-0.5" />
              <p className="text-muted-foreground">{benefit}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
