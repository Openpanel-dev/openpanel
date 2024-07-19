import { ALink } from '@/components/ui/button';

import { chQuery, TABLE_NAMES } from '@openpanel/db';

import AnimatedText from './animated-text';
import { Heading1, Lead2 } from './copy';

function shortNumber(num: number) {
  if (num < 1e3) return num;
  if (num >= 1e3 && num < 1e6) return +(num / 1e3).toFixed(1) + 'K';
  if (num >= 1e6 && num < 1e9) return +(num / 1e6).toFixed(1) + 'M';
  if (num >= 1e9 && num < 1e12) return +(num / 1e9).toFixed(1) + 'B';
  if (num >= 1e12) return +(num / 1e12).toFixed(1) + 'T';
}

export async function Hero() {
  const projects = await chQuery<{ project_id: string; count: number }>(
    `SELECT project_id, count(*) as count from ${TABLE_NAMES.events} GROUP by project_id order by count()`
  );
  const projectCount = projects.length;
  const eventCount = projects.reduce((acc, { count }) => acc + count, 0);
  return (
    <div className="relative overflow-hidden">
      {/* <div className="bg-blue-50 w-2/5 h-full absolute top-0 right-0"></div> */}
      <div className="container relative flex min-h-[700px] flex-col items-center gap-4 max-md:pt-32 md:h-screen md:flex-row md:gap-8">
        <div className="flex-1 max-md:text-center sm:min-w-[350px] lg:min-w-[400px]">
          <div className="mb-4 flex justify-center md:justify-start">
            <div className="rounded-md border border-border p-1.5 px-4 text-sm font-medium">
              FREE DURING BETA
            </div>
          </div>
          <Heading1 className="mb-4 text-slate-950">
            An open-source
            <br />
            alternative to{' '}
            <AnimatedText
              texts={[
                {
                  text: 'Mixpanel',
                  color: '#5028C0',
                },
                {
                  text: 'Google Analytics',
                  color: '#FAAE17',
                },
                {
                  text: 'Plausible',
                  color: '#5850EC',
                },
              ]}
            />
          </Heading1>
          <Lead2 className="mb-12">
            The power of Mixpanel, the ease of Plausible and nothing from Google
            Analytics 😉
          </Lead2>

          <div className="flex justify-center gap-2 md:justify-start">
            <ALink
              className="font-semibold"
              size="lg"
              href="https://dashboard.openpanel.dev/register"
            >
              Get started
            </ALink>
          </div>
          <div className="mt-8 flex justify-center gap-8 md:justify-start">
            <div>
              <div className="text-sm uppercase text-muted-foreground">
                Collected events
              </div>
              <div className="font-serif text-3xl font-semibold">
                {shortNumber(eventCount)}
              </div>
            </div>
            <div>
              <div className="text-sm uppercase text-muted-foreground">
                Active projects
              </div>
              <div className="font-serif text-3xl font-semibold">
                {projectCount}
              </div>
            </div>
          </div>
        </div>
        <div className="relative mt-12 h-[max(90vh,650px)] w-full md:mt-36">
          <div className="absolute inset-0 flex rounded-2xl ring-8 ring-slate-300">
            <div className="absolute inset-0 w-full animate-pulse overflow-hidden rounded-2xl bg-slate-100" />
            <iframe
              src="https://dashboard.openpanel.dev/share/overview/zef2XC?header=0"
              className="relative z-10 h-[max(90vh,650px)] w-full rounded-2xl"
              title="Openpanel Dashboard"
              scrolling="no"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
