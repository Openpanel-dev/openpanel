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

export default function HomePage() {
  return (
    <>
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
