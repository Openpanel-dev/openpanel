import { db } from '@openpanel/db';

import { PreviewCarousel } from './carousel';
import { Heading2, Lead2, Paragraph } from './copy';
import { Hero } from './hero';
import { Sections } from './section';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function Page() {
  const waitlistCount = await db.waitlist.count();
  return (
    <div>
      <Hero waitlistCount={waitlistCount} />
      <div className="container">
        <div className="my-24">
          <Heading2 className="md:text-5xl mb-2 leading-none">
            Analytics should be easy
            <br />
            and powerful
          </Heading2>
          <Lead2>
            The power of Mixpanel, the ease of Plausible and nothing from Google
            Analytics 😉
          </Lead2>
        </div>
        <Sections />
      </div>
      <div className="container mt-40">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="mb-4 md:w-1/2 flex-shrink-0 relative">
            <Heading2>Another analytic tool? Really?</Heading2>
            {/* <SirenIcon
              strokeWidth={0.5}
              size={300}
              className="opacity-10 absolute -rotate-12 -left-20 -top-10"
            /> */}
          </div>
          <div className="flex flex-col gap-4 max-w-3xl">
            <h3 className="text-lg font-bold text-blue-dark">TL;DR</h3>
            <Paragraph>
              Our open-source analytic library fills a crucial gap by combining
              the strengths of Mixpanel's powerful features with Plausible's
              clear overview page. Motivated by the lack of an open-source
              alternative to Mixpanel and inspired by Plausible's simplicity, we
              aim to create an intuitive platform with predictable pricing. With
              a single-tier pricing model and limits only on monthly event
              counts, our goal is to democratize analytics, offering
              unrestricted access to all features while ensuring affordability
              and transparency for users of all project sizes.
            </Paragraph>

            <h3 className="text-lg font-bold text-blue-dark mt-12">The why</h3>
            <Paragraph>
              Our open-source analytic library emerged from a clear need within
              the analytics community. While platforms like Mixpanel offer
              powerful and user-friendly features, they lack a comprehensive
              overview page akin to Plausible's, which succinctly summarizes
              essential metrics. Recognizing this gap, we saw an opportunity to
              combine the strengths of both platforms while addressing their
              respective shortcomings.
            </Paragraph>

            <Paragraph>
              One significant motivation behind our endeavor was the absence of
              an open-source alternative to Mixpanel. We believe in the
              importance of accessibility and transparency in analytics, which
              led us to embark on creating a solution that anyone can freely use
              and contribute to.
            </Paragraph>

            <Paragraph>
              Inspired by Plausible's exemplary approach to simplicity and
              clarity, we aim to build upon their foundation and further refine
              the user experience. By harnessing the best practices demonstrated
              by Plausible, we aspire to create an intuitive and streamlined
              analytics platform that empowers users to derive actionable
              insights effortlessly.
            </Paragraph>

            <Paragraph>
              Our own experiences with traditional analytics platforms like
              Mixpanel underscored another critical aspect driving our project:
              the need for predictable pricing. As project owners ourselves, we
              encountered the frustration of escalating costs as our user base
              grew. Therefore, we are committed to offering a single-tier
              pricing model that provides unlimited access to all features
              without the fear of unexpected expenses.
            </Paragraph>

            <Paragraph>
              In line with our commitment to fairness and accessibility, our
              pricing model will only impose limits on the number of events
              users can send each month. This approach, akin to Plausible's,
              ensures that users have the freedom to explore and utilize our
              platform to its fullest potential without arbitrary restrictions
              on reports or user counts. Ultimately, our goal is to democratize
              analytics by offering a reliable, transparent, and cost-effective
              solution for projects of all sizes.
            </Paragraph>
          </div>
        </div>
      </div>
    </div>
  );
}
