import { HeroContainer } from '@/app/(home)/_sections/hero';
import { GetStartedButton } from '@/components/get-started-button';
import { Perks } from '@/components/perks';
import { SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import type { CompareHero as CompareHeroData } from '@/lib/compare';
import { CheckCircle2Icon } from 'lucide-react';
import Link from 'next/link';
import { CompareToc } from './compare-toc';

interface CompareHeroProps {
  hero: CompareHeroData;
  tocItems?: Array<{ id: string; label: string }>;
}

export function CompareHero({ hero, tocItems = [] }: CompareHeroProps) {
  return (
    <HeroContainer divider={false} className="-mb-32">
      <div
        className={
          tocItems.length > 0
            ? 'grid md:grid-cols-[1fr_auto] gap-8 items-start'
            : 'col gap-6'
        }
      >
        <div className="col gap-6">
          <SectionHeader
            as="h1"
            className="flex-1"
            title={hero.heading}
            description={hero.subheading}
            variant="sm"
          />
          <div className="row gap-4">
            <GetStartedButton />
            <Button size="lg" variant="outline" asChild>
              <Link href={'https://demo.openpanel.dev'}>See live demo</Link>
            </Button>
          </div>
          <Perks
            className="flex gap-4 flex-wrap"
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
