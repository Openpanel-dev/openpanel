import { CheckIcon } from 'lucide-react';

import { Heading2, Lead2 } from './copy';

const pricing = [
  { price: 'Free', events: 3000 },
  { price: '$5', events: 10_000 },
  { price: '$10', events: 20_000 },
  { price: '$20', events: 100_000 },
  { price: '$30', events: 200_000 },
  { price: '$50', events: 400_000 },
  { price: '$70', events: 600_000 },
  { price: '$90', events: 1_000_000 },
];

export function Pricing() {
  return (
    <div className="bg-slate-100 py-32" id="pricing">
      <div className="sm:max-w-xl md:max-w-3xl mx-auto px-4">
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
          <div className="grid md:grid-cols-2 gap-6">
            {pricing.map((item) => (
              <div
                key={item.price}
                className="bg-white rounded-lg border border-blue-dark p-6 flex flex-col gap-1"
              >
                <div className="text-3xl font-bold">{item.price}</div>
                <div className="text-lg flex justify-between">
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
