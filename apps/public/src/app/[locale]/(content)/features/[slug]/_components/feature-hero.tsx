import { HeroContainer } from '@/app/[locale]/(home)/_sections/hero';
import { GetStartedButton } from '@/components/get-started-button';
import { Perks } from '@/components/perks';
import { SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import type { AppLocale } from '@/i18n/routing';
import type { FeatureHero as FeatureHeroData } from '@/lib/features';
import { CheckCircle2Icon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface FeatureHeroProps {
  hero: FeatureHeroData;
  locale: AppLocale;
}

export function FeatureHero({ hero, locale }: FeatureHeroProps) {
  const t = useTranslations('common');

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
              {t('test_live_demo')}
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
