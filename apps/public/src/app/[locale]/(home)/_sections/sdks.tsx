'use client';

import { FeatureCardContainer } from '@/components/feature-card';
import { Section, SectionHeader } from '@/components/section';
import { frameworks } from '@openpanel/sdk-info';
import { ArrowRightIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { localizedHref, toAppLocale } from '@/i18n/routing';

export function Sdks() {
  const locale = toAppLocale(useLocale());
  const t = useTranslations('home');

  return (
    <Section className="container">
      <SectionHeader
        title={t('sdks_title')}
        description={t('sdks_description')}
        className="mb-16"
      />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
        {frameworks.map((sdk) => (
          <Link href={localizedHref(sdk.href, locale)} key={sdk.key}>
            <FeatureCardContainer key={sdk.key}>
              <sdk.IconComponent className="size-6" />
              <div className="row justify-between items-center">
                <span className="text-sm font-semibold">{sdk.name}</span>
                <ArrowRightIcon className="size-4" />
              </div>
            </FeatureCardContainer>
          </Link>
        ))}
      </div>
    </Section>
  );
}
