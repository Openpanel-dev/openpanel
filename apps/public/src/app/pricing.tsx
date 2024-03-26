import { CheckIcon, StarIcon } from 'lucide-react';

import { Heading2, Lead2 } from './copy';

const pricing = [
  { price: 'Free', events: 3000, hint: 'Try it' },
  { price: '$5', events: 10_000 },
  { price: '$10', events: 20_000 },
  { price: '$20', events: 100_000, hint: 'Great value' },
  { price: '$30', events: 200_000 },
  { price: '$50', events: 400_000 },
  { price: '$70', events: 600_000 },
  { price: '$90', events: 1_000_000 },
];

export function Pricing() {
  return (
    <div className="bg-slate-100 py-32" id="pricing">
      <div className="mx-auto px-4 sm:max-w-xl md:max-w-3xl">
        <section className="flex flex-col gap-6">
          <div className="flex w-full flex-col gap-4 md:max-w-[58rem]">
            <Heading2>Simple, transparent pricing</Heading2>
            <Lead2 className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
              Everything is included, just decide how many events you want to
              track each month.
            </Lead2>
          </div>
          <ul className="grid gap-3 text-muted-foreground sm:grid-cols-2 md:grid-cols-3">
            <li className="flex items-center">
              <CheckIcon className="mr-2 h-4 w-4" /> Unlimited websites/apps
            </li>
            <li className="flex items-center">
              <CheckIcon className="mr-2 h-4 w-4" /> Unlimited users
            </li>
            <li className="flex items-center">
              <CheckIcon className="mr-2 h-4 w-4" /> Unlimted dashboards
            </li>
            <li className="flex items-center">
              <CheckIcon className="mr-2 h-4 w-4" /> Unlimted charts
            </li>
            <li className="flex items-center">
              <CheckIcon className="mr-2 h-4 w-4" /> Unlimted tracked profiles
            </li>
            <li className="flex items-center font-bold text-slate-900">
              <CheckIcon className="mr-2 h-4 w-4" /> Yes, its that simple
            </li>
          </ul>
          <div className="grid gap-6 md:grid-cols-2">
            {pricing.map((item) => (
              <div
                key={item.price}
                className="border-blue-dark relative flex flex-col gap-1 rounded-lg border bg-white p-6"
              >
                {item.hint && (
                  <div className="absolute right-2 top-2 flex items-center gap-2 rounded bg-blue-600 px-2 py-1 text-xs text-white">
                    <StarIcon size={12} />
                    {item.hint}
                  </div>
                )}
                <div className="text-3xl font-bold">{item.price}</div>
                <div className="flex justify-between text-lg">
                  <span>
                    {new Intl.NumberFormat('en').format(item.events)} events
                  </span>
                  <span className="text-muted-foreground">per month</span>
                </div>
              </div>
            ))}
          </div>
          <p className="font-bold">Everything is free during beta period!</p>
        </section>
      </div>
    </div>
  );
}
