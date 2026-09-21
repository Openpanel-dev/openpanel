import { CheckIcon } from 'lucide-react';
import Link from 'next/link';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
      <div className="col max-w-3xl gap-6">
        {label && (
          <p className="font-medium text-primary text-sm italic">{label}</p>
        )}
        <h2 className="font-semibold text-4xl leading-tight md:text-5xl">
          {title}
        </h2>
        <p className="text-lg text-muted-foreground">{description}</p>
        {cta && (
          <Button asChild className="w-fit" size="lg">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        )}
        <div className="col mt-4 gap-4">
          {benefits.map((benefit) => (
            <div className="row items-start gap-3" key={benefit}>
              <CheckIcon className="mt-0.5 size-5 shrink-0 text-green-500" />
              <p className="text-muted-foreground">{benefit}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
