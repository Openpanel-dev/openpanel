import { CheckCircle2Icon } from 'lucide-react';
import Link from 'next/link';
import { CompareToc } from './compare-toc';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { GetStartedButton } from '@/components/get-started-button';
import { Perks } from '@/components/perks';
import { SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import type { CompareHero as CompareHeroData } from '@/lib/compare';

interface CompareHeroProps {
  hero: CompareHeroData;
  tocItems?: Array<{ id: string; label: string }>;
}

export function CompareHero({ hero, tocItems = [] }: CompareHeroProps) {
  return (
    <HeroContainer className="-mb-32" divider={false}>
      <div
        className={
          tocItems.length > 0
            ? 'grid items-start gap-8 md:grid-cols-[1fr_auto]'
            : 'col gap-6'
        }
      >
        <div className="col gap-6">
          <SectionHeader
            as="h1"
            className="flex-1"
            description={hero.subheading}
            title={hero.heading}
            variant="sm"
          />
          <div className="row gap-4">
            <GetStartedButton />
            <Button asChild size="lg" variant="outline">
              <Link
                href={'https://demo.openpanel.dev'}
                rel="noreferrer noopener nofollow"
                target="_blank"
              >
                See live demo
              </Link>
            </Button>
          </div>
          <Perks
            className="flex flex-wrap gap-4"
            perks={hero.badges.map((badge) => ({
              text: badge,
              icon: CheckCircle2Icon,
            }))}
          />
        </div>
        {tocItems.length > 0 && <CompareToc items={tocItems} />}
      </div>
    </HeroContainer>
  );
}
