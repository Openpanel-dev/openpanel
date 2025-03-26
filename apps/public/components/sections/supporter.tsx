import { HeartHandshakeIcon } from 'lucide-react';
import Link from 'next/link';
import { SingleSwirl } from '../Swirls';
import { SectionHeader } from '../section';
import { Tag } from '../tag';
import { Button } from '../ui/button';

export function Supporter() {
  return (
    <section className="overflow-hidden relative bg-foreground dark:bg-background-dark text-background dark:text-foreground rounded-xl p-0 pb-32 pt-16 mx-auto">
      <SingleSwirl className="pointer-events-none absolute top-0 bottom-0 left-0" />
      <SingleSwirl className="pointer-events-none rotate-180 absolute top-0 bottom-0 -right-0 opacity-50" />
      <div className="container center-center col">
        <SectionHeader
          tag={
            <Tag>
              <HeartHandshakeIcon className="size-4" />
              Support OpenPanel
            </Tag>
          }
          title="Support the future of open analytics"
          description="Join our community of supporters and help us build the best open-source alternative to Mixpanel. Every contribution helps keep OpenPanel free and accessible."
        />
        <Button size="lg" variant="secondary" asChild>
          <Link href="https://buy.polar.sh/polar_cl_Az1CruNFzQB2bYdMOZmGHqTevW317knWqV44W1FqZmV">
            Become a supporter
          </Link>
        </Button>
        <div className="text-xs text-muted-foreground max-w-sm mt-4">
          Pay what you want and help us keep the lights on.
        </div>
      </div>
    </section>
  );
}
