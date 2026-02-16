import { ArrowRightIcon, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { FeatureCardContainer } from '@/components/feature-card';

interface FeatureCardLinkProps {
  url: string;
  title: string;
  description: string;
  icon?: LucideIcon;
}

export function FeatureCardLink({
  url,
  title,
  description,
  icon: Icon,
}: FeatureCardLinkProps) {
  return (
    <Link href={url}>
      <FeatureCardContainer>
        <div className="row items-center gap-3">
          <div className="col min-w-0 flex-1 gap-1">
            {Icon && <Icon className="mb-2 size-6 shrink-0" />}
            <h3 className="font-semibold text-lg transition-colors group-hover:text-primary">
              {title}
            </h3>
            <p className="line-clamp-2 text-muted-foreground text-sm">
              {description}
            </p>
          </div>
          <ArrowRightIcon className="size-5 shrink-0 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary group-hover:opacity-100" />
        </div>
      </FeatureCardContainer>
    </Link>
  );
}
