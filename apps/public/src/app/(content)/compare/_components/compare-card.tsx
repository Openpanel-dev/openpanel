import { FeatureCard, FeatureCardContainer } from '@/components/feature-card';
import { cn } from '@/lib/utils';
import { ArrowRightIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

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
        <div className="row gap-3 items-center">
          {logo && (
            <div className="relative size-10 shrink-0 rounded-lg overflow-hidden border bg-background p-1.5">
              <Image
                src={logo}
                alt={`${name} logo`}
                width={40}
                height={40}
                className="object-contain w-full h-full"
              />
            </div>
          )}
          <div className="col gap-1 flex-1 min-w-0">
            <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
              {name}
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

