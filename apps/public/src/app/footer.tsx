import { Logo } from '@/components/Logo';
import Image from 'next/image';
import Link from 'next/link';

import { Heading2, Lead2 } from './copy';
import { JoinWaitlist } from './join-waitlist';

export default function Footer() {
  return (
    <footer className="bg-blue-darker text-white relative mt-40 relative">
      <div className="inset-0 absolute h-full w-full bg-[radial-gradient(circle,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)]"></div>
      <div className="relative container flex flex-col items-center text-center">
        <div className="my-24">
          <Heading2 className="text-white mb-2">Get early access</Heading2>
          <Lead2>Ready to set your analytics free? Get on our waitlist.</Lead2>

          <div className="mt-8">
            <JoinWaitlist className="text-white bg-white/20 border-white/30 focus:ring-white" />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl">
          <div className="p-3 bg-white/20">
            <Image
              src="/demo/overview-min.png"
              width={1080}
              height={608}
              alt="Openpanel overview page"
              className="w-full rounded-lg"
            />
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0">
        <div className="h-px w-full bg-[radial-gradient(circle,rgba(255,255,255,0.7)_0%,rgba(255,255,255,0.7)_50%,rgba(255,255,255,0)_100%)]"></div>
        <div className="p-4 bg-blue-darker">
          <div className="container">
            <div className="flex justify-between items-center text-sm">
              <Logo />
              <div className="flex gap-4">
                <Link className="hover:underline" href="/terms">
                  Terms and Conditions
                </Link>
                <Link className="hover:underline" href="/privacy">
                  Privacy Policy
                </Link>
                <a
                  className="hover:underline"
                  href="https://twitter.com/CarlLindesvard"
                  target="_blank"
                  rel="nofollow"
                >
                  Follow on X
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
