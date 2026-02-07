import { FeatureCardContainer } from '@/components/feature-card';
import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';

interface FeatureCardLinkProps {
  url: string;
  title: string;
  description: string;
}

export function FeatureCardLink({
  url,
  title,
  description,
}: FeatureCardLinkProps) {
  return (
    <Link href={url}>
      <FeatureCardContainer>
        <div className="row gap-3 items-center">
          <div className="col gap-1 flex-1 min-w-0">
            <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
              {title}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {description}
            </p>
          </div>
          <ArrowRightIcon className="opacity-0 group-hover:opacity-100 size-5 shrink-0 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-300" />
        </div>
      </FeatureCardContainer>
    </Link>
  );
}
