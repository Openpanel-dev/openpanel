import { CheckIcon } from 'lucide-react';

import { Heading2, Lead2 } from './copy';

export function Pricing() {
  return (
    <div className="bg-slate-200 py-32" id="#pricing">
      <div className="container">
        <section className="container flex flex-col  gap-6 md:max-w-[64rem]">
          <div className="mx-auto flex w-full flex-col gap-4 md:max-w-[58rem]">
            <Heading2>Simple, transparent pricing</Heading2>
            <Lead2 className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
              Everything is included, just decide how many events you want to
              track each month.
            </Lead2>
          </div>
          <div className="grid w-full items-start gap-10 rounded-lg border md:p-10 md:grid-cols-[1fr_200px]">
            <div className="grid gap-6">
              <h3 className="text-xl font-bold sm:text-2xl">
                What&apos;s included for{' '}
                <span className="bg-slate-300 rounded px-0.5">all plans</span>
              </h3>
              <ul className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                <li className="flex items-center">
                  <CheckIcon className="mr-2 h-4 w-4" /> Unlimited websites/apps
                </li>
                <li className="flex items-center">
                  <CheckIcon className="mr-2 h-4 w-4" /> Unlimited Users
                </li>

                <li className="flex items-center">
                  <CheckIcon className="mr-2 h-4 w-4" /> Unlimted dashboards
                </li>
                <li className="flex items-center">
                  <CheckIcon className="mr-2 h-4 w-4" /> Unlimted charts
                </li>
                <li className="flex items-center">
                  <CheckIcon className="mr-2 h-4 w-4" /> Unlimted tracked
                  profiles
                </li>
                <li className="flex items-center font-bold text-slate-900">
                  <CheckIcon className="mr-2 h-4 w-4" /> Yes, its that simple
                </li>
              </ul>
            </div>
            <div className="flex flex-col gap-4 text-left md:text-right">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  From
                </p>
                <h4 className="text-7xl font-bold">$10</h4>
                <p className="text-sm font-medium text-muted-foreground">
                  billed monthly
                </p>
              </div>
              {/* <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
            Get Started
          </Link> */}
            </div>
          </div>
          <div className="mx-auto flex w-full max-w-[58rem] flex-col gap-4">
            <p className="max-w-[85%] leading-normal text-muted-foreground sm:leading-7">
              Exact pricing will come soon, but we asure you, it will be cheaper
              than the competition.
            </p>
            <p className="font-bold">During beta everything is free!</p>
          </div>
        </section>
      </div>
    </div>
  );
}
