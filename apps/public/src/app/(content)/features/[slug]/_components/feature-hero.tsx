import { HeroContainer } from '@/app/(home)/_sections/hero';
import { GetStartedButton } from '@/components/get-started-button';
import { Perks } from '@/components/perks';
import { SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import type { FeatureHero as FeatureHeroData } from '@/lib/features';
import { CheckCircle2Icon } from 'lucide-react';
import Link from 'next/link';

interface FeatureHeroProps {
  hero: FeatureHeroData;
}

export function FeatureHero({ hero }: FeatureHeroProps) {
  return (
    <HeroContainer divider={false} className="-mb-32">
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
            <Link
              href="https://demo.openpanel.dev"
              target="_blank"
              rel="noreferrer noopener nofollow"
            >
              See live demo
            </Link>
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
    </HeroContainer>
  );
}
