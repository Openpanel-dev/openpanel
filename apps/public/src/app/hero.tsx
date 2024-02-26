// background-image: radial-gradient(circle at 1px 1px, black 1px, transparent 0);
//   background-size: 40px 40px;

import { Logo } from '@/components/Logo';
import {
  BarChart2Icon,
  CookieIcon,
  Globe2Icon,
  LayoutPanelTopIcon,
  LockIcon,
  ServerIcon,
} from 'lucide-react';
import Image from 'next/image';

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
  {
    title: 'Self-hosted',
    icon: ServerIcon,
  },
];

export function Hero({ waitlistCount }: { waitlistCount: number }) {
  return (
    <div className="flex flex-col items-center w-full text-center text-blue-950">
      <div className="pt-32 pb-56 p-4 flex flex-col items-center max-w-3xl bg-[radial-gradient(circle,rgba(255,255,255,0.7)_0%,rgba(255,255,255,0.7)_50%,rgba(255,255,255,0)_100%)]">
        <Heading1 className="mb-4">
          An open-source
          <br />
          alternative to Mixpanel
        </Heading1>
        <p>
          Mixpanel + Plausible ={' '}
          <strong className="text-blue-600">Openpanel!</strong> A simple
          analytics tool that your wallet can afford.
        </p>
        <div className="my-12 w-full flex flex-col items-center">
          <JoinWaitlist />
          <div className="mt-2">
            <p>{waitlistCount} people have already signed up! 🚀</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-10 max-w-xl justify-center">
          {features.map(({ icon: Icon, title }) => (
            <div className="flex gap-2 items-center justify-center">
              <Icon className="text-blue-light  " />
              {title}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
