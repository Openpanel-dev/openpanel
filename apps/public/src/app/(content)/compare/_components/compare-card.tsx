import { ArrowRightIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { FeatureCardContainer } from '@/components/feature-card';

interface CompareCardProps {
  name: string;
  logo?: string;
  description: string;
  url: string;
}

export function CompareCard({
  url,
  name,
  logo,
  description,
}: CompareCardProps) {
  return (
    <Link href={url}>
      <FeatureCardContainer>
        <div className="row items-center gap-3">
          {logo && (
            <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border bg-background p-1.5">
              <Image
                alt={`${name} logo`}
                className="h-full w-full object-contain"
                height={40}
                src={logo}
                width={40}
              />
            </div>
          )}
          <div className="col min-w-0 flex-1 gap-1">
            <h3 className="font-semibold text-lg transition-colors group-hover:text-primary">
              {name}
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
