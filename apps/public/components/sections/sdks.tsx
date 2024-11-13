import { Section, SectionHeader } from '@/components/section';
import { Tag } from '@/components/tag';
import { type Framework, frameworks } from '@openpanel/sdk-info';
import { CodeIcon, ShieldQuestionIcon } from 'lucide-react';
import Link from 'next/link';
import { HorizontalLine, PlusLine, VerticalLine } from '../line';
import { Button } from '../ui/button';

export function Sdks() {
  return (
    <Section className="container overflow-hidden">
      <SectionHeader
        tag={
          <Tag>
            <ShieldQuestionIcon className="size-4" strokeWidth={1.5} />
            Easy to use
          </Tag>
        }
        title="SDKs"
        description="Use our modules to integrate with your favourite framework and start collecting events with ease. Enjoy quick and seamless setup."
      />
      <div className="col gap-16">
        <div className="relative">
          <HorizontalLine className="-top-px opacity-40 -left-32 -right-32" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 container">
            {frameworks.slice(0, 5).map((sdk, index) => (
              <SdkCard key={sdk.name} sdk={sdk} index={index} />
            ))}
          </div>
          <HorizontalLine className="opacity-40 -left-32 -right-32" />
        </div>

        <div className="relative">
          <HorizontalLine className="-top-px opacity-40 -left-32 -right-32" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 container">
            {frameworks.slice(5, 10).map((sdk, index) => (
              <SdkCard key={sdk.name} sdk={sdk} index={index} />
            ))}
          </div>
          <HorizontalLine className="opacity-40 -left-32 -right-32" />
        </div>

        <div className="center-center gap-2 col">
          <h3 className="text-muted-foreground text-sm">And many more!</h3>
          <Button asChild>
            <Link href="/docs">Read our docs</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}

function SdkCard({
  sdk,
  index,
}: {
  sdk: Framework;
  index: number;
}) {
  return (
    <Link
      key={sdk.name}
      href={sdk.href}
      className="group relative z-10 col gap-2 uppercase center-center aspect-video bg-background-light rounded-lg shadow-[inset_0_0_0_1px_theme(colors.border),0_0_30px_0px_hsl(var(--border)/0.5)] transition-all hover:scale-105 hover:bg-background-dark"
    >
      {index === 0 && <PlusLine className="opacity-30 top-0 left-0" />}
      {index === 2 && <PlusLine className="opacity-80 bottom-0 right-0" />}
      <VerticalLine className="left-0 opacity-40" />
      <VerticalLine className="right-0 opacity-40" />
      <div className="absolute inset-0 center-center overflow-hidden opacity-20">
        <sdk.IconComponent className="size-32 top-[33%] relative group-hover:top-[30%] group-hover:scale-105 transition-all" />
      </div>
      <div
        className="center-center gap-1 col w-full h-full relative rounded-lg"
        style={{
          background:
            'radial-gradient(circle, hsl(var(--background)) 0%, hsl(var(--background)/0.7) 100%)',
        }}
      >
        <sdk.IconComponent className="size-8" />
        {/* <h4 className="text-muted-foreground text-[10px]">{sdk.name}</h4> */}
      </div>
    </Link>
  );
}
