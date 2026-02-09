import {
  OPENPANEL_BASE_URL,
  OPENPANEL_DESCRIPTION,
  OPENPANEL_NAME,
} from '@/lib/openpanel-brand';
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

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: OPENPANEL_NAME,
      url: OPENPANEL_BASE_URL,
      sameAs: ['https://github.com/Openpanel-dev/openpanel'],
      description: OPENPANEL_DESCRIPTION,
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
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
