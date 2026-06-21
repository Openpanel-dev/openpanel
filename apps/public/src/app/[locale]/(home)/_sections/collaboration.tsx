import { FeatureCard } from '@/components/feature-card';
import { GetStartedButton } from '@/components/get-started-button';
import { Section, SectionHeader } from '@/components/section';
import { Button } from '@/components/ui/button';
import {
  ChartBarIcon,
  ChevronRightIcon,
  LayoutDashboardIcon,
  WorkflowIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { CollaborationChart } from './collaboration-chart';
import { localizedHref, toAppLocale } from '@/i18n/routing';

const features = [
  {
    key: 'data_visualization',
    icon: ChartBarIcon,
    slug: 'data-visualization',
  },
  {
    key: 'share_collaborate',
    icon: LayoutDashboardIcon,
    slug: 'share-and-collaborate',
  },
  {
    key: 'integrations',
    icon: WorkflowIcon,
    slug: 'integrations',
  },
] as const;

export function Collaboration() {
  const locale = toAppLocale(useLocale());
  const t = useTranslations('home');

  return (
    <Section className="container">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
        <CollaborationChart />
        <div>
          <SectionHeader
            title={t('collaboration_title')}
            description={t('collaboration_description')}
          />

          <GetStartedButton className="mt-6" />

          <div className="col gap-6 mt-16">
            {features.map((feature) => (
              <Link
                href={localizedHref(`/features/${feature.slug}`, locale)}
                className="group relative col gap-2 pr-10 overflow-hidden"
                key={feature.key}
              >
                <h3 className="font-semibold">
                  <feature.icon className="size-6 inline-block mr-2 relative -top-0.5" />
                  {t(`collaboration_features_${feature.key}_title`)}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t(`collaboration_features_${feature.key}_description`)}
                </p>
                <ChevronRightIcon
                  className="absolute right-0 top-1/2 size-5 -translate-y-1/2 text-muted-foreground transition-transform duration-200 translate-x-full group-hover:translate-x-0"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
