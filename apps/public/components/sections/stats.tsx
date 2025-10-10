import Link from 'next/link';
import { VerticalLine } from '../line';
import { PlusLine } from '../line';
import { HorizontalLine } from '../line';
import { Section } from '../section';
import { Button } from '../ui/button';
import { WorldMap } from '../world-map';

function shortNumber(num: number) {
  if (num < 1e3) return num;
  if (num >= 1e3 && num < 1e6) return `${+(num / 1e3).toFixed(1)}K`;
  if (num >= 1e6 && num < 1e9) return `${+(num / 1e6).toFixed(1)}M`;
  if (num >= 1e9 && num < 1e12) return `${+(num / 1e9).toFixed(1)}B`;
  if (num >= 1e12) return `${+(num / 1e12).toFixed(1)}T`;
}

export async function Stats() {
  const { projectsCount, eventsCount, eventsLast24hCount } = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/misc/stats`,
  )
    .then((res) => res.json())
    .catch(() => ({
      projectsCount: 0,
      eventsCount: 0,
      eventsLast24hCount: 0,
    }));

  return (
    <StatsPure
      projectCount={projectsCount}
      eventCount={eventsCount}
      last24hCount={eventsLast24hCount}
    />
  );
}

export function StatsPure({
  projectCount,
  eventCount,
  last24hCount,
}: { projectCount: number; eventCount: number; last24hCount: number }) {
  return (
    <Section className="bg-gradient-to-b from-background via-background-dark to-background-dark py-64 pt-44 relative overflow-hidden -mt-16">
      {/* Map */}
      <div className="absolute inset-0 -top-20 center-center items-start select-none opacity-10">
        <div className="min-w-[1400px] w-full">
          <WorldMap />
          {/* Gradient over Map */}
          <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
        </div>
      </div>

      <div className="relative">
        <HorizontalLine />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 container center-center">
          <div className="col gap-2 uppercase center-center relative p-4">
            <VerticalLine className="hidden lg:block left-0" />
            <PlusLine className="hidden lg:block top-0 left-0" />
            <div className="text-muted-foreground text-xs">Active projects</div>
            <div className="text-5xl font-bold font-mono">{projectCount}</div>
          </div>
          <div className="col gap-2 uppercase center-center relative p-4">
            <VerticalLine className="hidden lg:block left-0" />
            <div className="text-muted-foreground text-xs">Total events</div>
            <div className="text-5xl font-bold font-mono">
              {shortNumber(eventCount)}
            </div>
          </div>
          <div className="col gap-2 uppercase center-center relative p-4">
            <VerticalLine className="hidden lg:block left-0" />
            <VerticalLine className="hidden lg:block right-0" />
            <PlusLine className="hidden lg:block bottom-0 left-0" />
            <div className="text-muted-foreground text-xs">
              Events last 24 h
            </div>
            <div className="text-5xl font-bold font-mono">
              {shortNumber(last24hCount)}
            </div>
          </div>
        </div>
        <HorizontalLine />
      </div>
      <div className="center-center col gap-4 absolute bottom-20 left-0 right-0 z-10">
        <p>Get the analytics you deserve</p>
        <Button asChild>
          <Link href="https://dashboard.openpanel.dev/onboarding">
            Try it for free
          </Link>
        </Button>
      </div>
    </Section>
  );
}
