import { Logo } from '@/components/Logo';
import { ALink } from '@/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';

import { Heading2, Lead2 } from './copy';
import { JoinWaitlist } from './join-waitlist';

export default function Footer() {
  return (
    <footer className="bg-blue-darker relative relative mt-40 text-white">
      <div className="absolute inset-0 h-full w-full bg-[radial-gradient(circle,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)]"></div>
      <div className="container relative flex flex-col items-center text-center">
        <div className="my-24">
          <Heading2 className="mb-2 text-white">Get early access</Heading2>
          <Lead2>
            Ready to set your analytics free? Create your account today!
          </Lead2>

          <div className="mt-8">
            <ALink
              className="font-semibold"
              size="lg"
              href="https://dashboard.openpanel.dev"
            >
              Create your account
            </ALink>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl">
          <div className="bg-white/20 p-2">
            <Image
              src="/demo-2/1.png"
              width={1080}
              height={608}
              alt="Openpanel overview page"
              className="w-full rounded-lg"
            />
          </div>
        </div>
      </div>
      <div className="relative z-10 -mt-8">
        <div className="h-px w-full bg-[radial-gradient(circle,rgba(255,255,255,0.7)_0%,rgba(255,255,255,0.7)_50%,rgba(255,255,255,0)_100%)]"></div>
        <div className="bg-blue-darker p-4">
          <div className="container">
            <div className="flex flex-col gap-4 text-sm md:flex-row md:items-center md:justify-between">
              <Logo />
              <div className="flex flex-col gap-4 md:flex-row">
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
