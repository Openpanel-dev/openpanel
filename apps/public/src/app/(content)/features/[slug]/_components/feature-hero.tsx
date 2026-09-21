import { CheckCircle2Icon } from 'lucide-react';
import Link from 'next/link';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { GetStartedButton } from '@/components/get-started-button';
import { Perks } from '@/components/perks';
import { SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import type { FeatureHero as FeatureHeroData } from '@/lib/features';

interface FeatureHeroProps {
  hero: FeatureHeroData;
}

export function FeatureHero({ hero }: FeatureHeroProps) {
  return (
    <HeroContainer className="-mb-32" divider={false}>
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
              href="https://demo.openpanel.dev"
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
    </HeroContainer>
  );
}
