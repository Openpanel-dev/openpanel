import { AnalyticsInsights } from './_sections/analytics-insights';
import { Collaboration } from './_sections/collaboration';
import { CtaBanner } from './_sections/cta-banner';
import { DataPrivacy } from './_sections/data-privacy';
import { Faq } from './_sections/faq';
import { Hero } from './_sections/hero';
import { Pricing } from './_sections/pricing';
import { Sdks } from './_sections/sdks';
import { Testimonials } from './_sections/testimonials';
import { WhyOpenPanel } from './_sections/why-openpanel';
import {
  OPENPANEL_BASE_URL,
  OPENPANEL_DESCRIPTION,
  OPENPANEL_NAME,
  OPENPANEL_SITE_NAME,
} from '@/lib/openpanel-brand';

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: OPENPANEL_SITE_NAME,
      alternateName: ['OpenPanel', 'OpenPanel.dev'],
      url: OPENPANEL_BASE_URL,
    },
    {
      '@type': 'Organization',
      name: OPENPANEL_SITE_NAME,
      url: OPENPANEL_BASE_URL,
      sameAs: [
        'https://github.com/Openpanel-dev/openpanel',
        'https://x.com/OpenPanelDev',
      ],
      description: OPENPANEL_DESCRIPTION,
      keywords:
        'openpanel, product analytics, web analytics, mixpanel alternative, open source analytics',
    },
    {
      '@type': 'SoftwareApplication',
      name: OPENPANEL_NAME,
      applicationCategory: 'AnalyticsApplication',
      operatingSystem: 'Web',
      url: OPENPANEL_BASE_URL,
      description: OPENPANEL_DESCRIPTION,
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <Hero />
      <WhyOpenPanel />
      <AnalyticsInsights />
      <Collaboration />
      <Testimonials />
      <Pricing />
      <DataPrivacy />
      <Sdks />
      <Faq />
      <CtaBanner />
    </>
  );
}
