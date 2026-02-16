import { QuoteIcon } from 'lucide-react';
import { FeatureCardBackground } from '@/components/feature-card';
import { cn } from '@/lib/utils';

interface TestimonialProps {
  quote: string;
  author: string;
  className?: string;
}

export function Testimonial({ quote, author, className }: TestimonialProps) {
  return (
    <figure className={cn('group relative', className)}>
      <FeatureCardBackground interactive={false} />
      <QuoteIcon className="group-hover:-translate-1 mb-2 size-8 stroke-1 text-muted-foreground/50 transition-all group-hover:-rotate-6 group-hover:scale-105 group-hover:text-foreground" />
      <blockquote className="text-2xl">{quote}</blockquote>
      <figcaption className="mt-2 text-muted-foreground text-sm">
        — {author}
      </figcaption>
    </figure>
  );
}
