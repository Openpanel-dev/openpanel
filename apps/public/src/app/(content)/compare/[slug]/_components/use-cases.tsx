import Image from 'next/image';
import { Section, SectionHeader } from '@/components/section';
import type {
  CompareScreenshot,
  CompareUseCase,
  CompareUseCases,
} from '@/lib/compare';
import { cn } from '@/lib/utils';

const SCREENSHOT_WIDTH = 1400;
const SCREENSHOT_HEIGHT = 800;

type UseCaseWithScreenshot = CompareUseCase & { screenshot: CompareScreenshot };

function hasScreenshot(item: CompareUseCase): item is UseCaseWithScreenshot {
  return Boolean(item.screenshot);
}

function UseCaseRow({
  useCase,
  imageFirst,
}: {
  useCase: UseCaseWithScreenshot;
  imageFirst: boolean;
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-8',
        imageFirst ? 'md:grid-cols-[3fr_2fr]' : 'md:grid-cols-[2fr_3fr]'
      )}
    >
      <div className={cn('col gap-3', imageFirst && 'md:order-2')}>
        <h3 className="font-semibold text-xl">{useCase.title}</h3>
        <p className="text-muted-foreground leading-relaxed">
          {useCase.description}
        </p>
      </div>
      <figure className="overflow-hidden rounded-xl border bg-muted/20 p-2">
        <Image
          alt={useCase.screenshot.alt}
          className="h-auto w-full rounded-lg"
          height={SCREENSHOT_HEIGHT}
          src={useCase.screenshot.src}
          width={SCREENSHOT_WIDTH}
        />
      </figure>
    </div>
  );
}

export function UseCases({ useCases }: { useCases: CompareUseCases }) {
  const withScreenshots = useCases.items.filter(hasScreenshot);
  const withoutScreenshots = useCases.items.filter(
    (item) => !hasScreenshot(item)
  );

  return (
    <Section className="container">
      <SectionHeader
        description={useCases.intro}
        title={useCases.title}
        variant="sm"
      />
      {withScreenshots.length > 0 && (
        <div className="col mt-12 gap-16">
          {withScreenshots.map((useCase, index) => (
            <UseCaseRow
              imageFirst={index % 2 === 1}
              key={useCase.title}
              useCase={useCase}
            />
          ))}
        </div>
      )}
      {withoutScreenshots.length > 0 && (
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {withoutScreenshots.map((useCase) => (
            <div
              className="col gap-2 rounded-2xl border p-6"
              key={useCase.title}
            >
              <h3 className="font-semibold">{useCase.title}</h3>
              <p className="text-muted-foreground text-sm">
                {useCase.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
