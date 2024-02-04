import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import {
  BarChart2,
  CookieIcon,
  Globe2Icon,
  LayoutPanelTopIcon,
  LockIcon,
  UsersIcon,
} from 'lucide-react';

import { HomeCarousel } from './carousel';
import { Heading1, Heading2, Lead, Paragraph } from './copy';
import { JoinWaitlist } from './join-waitlist';

const features = [
  {
    title: 'Great overview',
    icon: LayoutPanelTopIcon,
  },
  {
    title: 'Beautiful charts',
    icon: BarChart2,
  },
  {
    title: 'Privacy focused',
    icon: LockIcon,
  },
  {
    title: 'Open-source',
    icon: Globe2Icon,
  },
  {
    title: 'No cookies',
    icon: CookieIcon,
  },
  {
    title: 'User journey',
    icon: UsersIcon,
  },
];

export default function Page() {
  return (
    <div>
      <div className="max-w-6xl p-4 mx-auto absolute top-0 left-0 right-0 py-6">
        <div className="flex justify-between">
          <Logo />
        </div>
      </div>

      <div className="flex flex-col items-center bg-gradient-to-br from-white via-white to-blue-200 w-full text-center text-blue-950">
        <div className="py-20 pt-32 p-4 flex flex-col items-center max-w-3xl ">
          <Heading1 className="mb-4 fancy-text">
            A open-source
            <br />
            alternative to Mixpanel
          </Heading1>
          <Lead className="mb-8">
            Combine Mixpanel and Plausible and you get Openpanel. A simple
            analytics tool that respects privacy.
          </Lead>
          <JoinWaitlist />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 mt-8">
            {features.map(({ icon: Icon, title }) => (
              <div className="flex gap-2 items-center justify-center">
                <Icon />
                {title}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-blue-800 p-4 py-8 md:py-16 text-center">
        <Heading2 className="text-slate-100 mb-4">
          Get a feel how it looks
        </Heading2>
        <Lead className="text-slate-200 mb-16">
          We've crafted a clean and intuitive interface because analytics should
          <br />
          be straightforward, unlike the complexity often associated with Google
          Analytics. 😅
        </Lead>
        <HomeCarousel />
      </div>
      <div className="p-4 py-8 md:py-16 text-center flex flex-col items-center">
        <Heading2 className="mb-4">Another analytic tool?</Heading2>
        <div className="flex flex-col gap-4 max-w-3xl">
          <Paragraph>
            <strong>TL;DR</strong> Our open-source analytic library fills a
            crucial gap by combining the strengths of Mixpanel's powerful
            features with Plausible's clear overview page. Motivated by the lack
            of an open-source alternative to Mixpanel and inspired by
            Plausible's simplicity, we aim to create an intuitive platform with
            predictable pricing. With a single-tier pricing model and limits
            only on monthly event counts, our goal is to democratize analytics,
            offering unrestricted access to all features while ensuring
            affordability and transparency for users of all project sizes.
          </Paragraph>

          <div className="flex gap-2 w-full justify-center my-8">
            <div className="rounded-full h-2 w-10 bg-blue-200"></div>
            <div className="rounded-full h-2 w-10 bg-blue-400"></div>
            <div className="rounded-full h-2 w-10 bg-blue-600"></div>
            <div className="rounded-full h-2 w-10 bg-blue-800"></div>
          </div>

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
            One significant motivation behind our endeavor was the absence of an
            open-source alternative to Mixpanel. We believe in the importance of
            accessibility and transparency in analytics, which led us to embark
            on creating a solution that anyone can freely use and contribute to.
          </Paragraph>

          <Paragraph>
            Inspired by Plausible's exemplary approach to simplicity and
            clarity, we aim to build upon their foundation and further refine
            the user experience. By harnessing the best practices demonstrated
            by Plausible, we aspire to create an intuitive and streamlined
            analytics platform that empowers users to derive actionable insights
            effortlessly.
          </Paragraph>

          <Paragraph>
            Our own experiences with traditional analytics platforms like
            Mixpanel underscored another critical aspect driving our project:
            the need for predictable pricing. As project owners ourselves, we
            encountered the frustration of escalating costs as our user base
            grew. Therefore, we are committed to offering a single-tier pricing
            model that provides unlimited access to all features without the
            fear of unexpected expenses.
          </Paragraph>

          <Paragraph>
            In line with our commitment to fairness and accessibility, our
            pricing model will only impose limits on the number of events users
            can send each month. This approach, akin to Plausible's, ensures
            that users have the freedom to explore and utilize our platform to
            its fullest potential without arbitrary restrictions on reports or
            user counts. Ultimately, our goal is to democratize analytics by
            offering a reliable, transparent, and cost-effective solution for
            projects of all sizes.
          </Paragraph>
        </div>
      </div>
    </div>
  );
}
