// background-image: radial-gradient(circle at 1px 1px, black 1px, transparent 0);
//   background-size: 40px 40px;

import { Logo } from '@/components/Logo';
import {
  BarChart2Icon,
  CookieIcon,
  Globe2Icon,
  LayoutPanelTopIcon,
  LockIcon,
} from 'lucide-react';

import { Heading1, Lead, Lead2 } from './copy';
import { JoinWaitlist } from './join-waitlist';

const features = [
  {
    title: 'Great overview',
    icon: LayoutPanelTopIcon,
  },
  {
    title: 'Beautiful charts',
    icon: BarChart2Icon,
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
];

export function Hero() {
  return (
    <div>
      <div className="absolute top-0 left-0 right-0 py-6">
        <div className="container">
          <div className="flex justify-between">
            <Logo />
          </div>
        </div>
      </div>

      <div
        className="flex flex-col items-center w-full text-center text-blue-950 bg-[radial-gradient(circle_at_2px_2px,#D9DEF6_2px,transparent_0)]"
        style={{
          backgroundSize: '70px 70px',
        }}
      >
        <div className="py-20 pt-32 p-4 flex flex-col items-center max-w-3xl bg-[radial-gradient(circle,rgba(255,255,255,0.7)_0%,rgba(255,255,255,0.7)_50%,rgba(255,255,255,0)_100%)]">
          <Heading1 className="mb-4">
            A open-source
            <br />
            alternative to Mixpanel
          </Heading1>
          <p className="mb-8">
            Combine Mixpanel and Plausible and you get Openpanel. A simple
            analytics tool that respects privacy.
          </p>
          <JoinWaitlist />
          <div className="flex flex-wrap gap-10 mt-8 max-w-xl justify-center">
            {features.map(({ icon: Icon, title }) => (
              <div className="flex gap-2 items-center justify-center">
                <Icon className="text-blue-light  " />
                {title}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
