import { ALink } from '@/components/ui/button';

import { chQuery } from '@openpanel/db';

import { Heading1, Lead2 } from './copy';

export async function Hero() {
  const projects = await chQuery<{ project_id: string; count: number }>(
    'SELECT project_id, count(*) as count from events GROUP by project_id order by count()'
  );
  const projectCount = projects.length;
  const eventCount = projects.reduce((acc, { count }) => acc + count, 0);
  return (
    <div className="relative overflow-hidden">
      {/* <div className="bg-blue-50 w-2/5 h-full absolute top-0 right-0"></div> */}
      <div className="container relative flex min-h-[700px] flex-col items-center gap-4 max-md:pt-32 md:h-screen md:flex-row md:gap-8">
        <div className="flex-1 max-md:text-center sm:min-w-[350px] lg:min-w-[400px]">
          <div className="mb-4 flex justify-center md:justify-start">
            <div className="rounded-full border border-border p-2 px-4 text-sm">
              NOW OPEN BETA!
            </div>
          </div>
          <Heading1 className="mb-4 text-slate-950">
            An open-source
            <br />
            alternative to Mixpanel
          </Heading1>
          <Lead2 className="mb-12">
            The power of Mixpanel, the ease of Plausible and nothing from Google
            Analytics 😉
          </Lead2>

          <div className="flex justify-center gap-2 md:justify-start">
            <ALink
              className="font-semibold"
              size="lg"
              href="https://dashboard.openpanel.dev"
            >
              Create account
            </ALink>
            <ALink
              className="font-semibold"
              size="lg"
              variant="secondary"
              href="https://dashboard.openpanel.dev/share/overview/ZQsEhG"
            >
              See demo
            </ALink>
          </div>
          <p className="mt-2">
            We have{' '}
            <span className="font-semibold">{projectCount} projects</span>{' '}
            receiving{' '}
            <span className="font-semibold">
              {new Intl.NumberFormat('en').format(eventCount)} events
            </span>{' '}
            in total!
          </p>
        </div>
        <div className="mt-16 w-full md:pt-16">
          <div className="flex h-[max(90vh,650px)] rounded-2xl bg-black/5 md:p-2">
            <iframe
              src="https://dashboard.openpanel.dev/share/overview/ZQsEhG"
              className="h-[max(90vh,650px)] w-full rounded-xl"
              title="Openpanel Dashboard"
              scrolling="no"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
