import { CheckIcon } from 'lucide-react';
import Image from 'next/image';
import { Reveal } from '@/components/reveal';
import type { CompareMeta, CompareSummary } from '@/lib/compare';
import { getAuthor } from '@/lib/layout.shared';
import { cn } from '@/lib/utils';

const ITEM_LIMIT = 4;

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatDate(isoDate: string) {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

function Byline({ meta }: { meta: CompareMeta }) {
  const author = getAuthor(meta.author);
  return (
    <p className="row flex-wrap items-center justify-center gap-x-3 gap-y-1 text-neutral-500 text-sm">
      {author?.image && (
        <Image
          alt=""
          className="size-6 rounded-full"
          height={24}
          src={author.image}
          width={24}
        />
      )}
      <span className="font-medium text-neutral-900">{meta.author}</span>
      <time dateTime={meta.updated}>Updated {formatDate(meta.updated)}</time>
      {meta.prices_checked && (
        <span>Prices checked {formatDate(meta.prices_checked)}</span>
      )}
    </p>
  );
}

function Column({
  title,
  items,
  primary,
}: {
  title: string;
  items: string[];
  primary?: boolean;
}) {
  return (
    <div className="surface col gap-4 p-6 md:p-8">
      <h3 className="font-semibold text-lg tracking-[-0.01em]">{title}</h3>
      <ul className="col gap-3">
        {items.slice(0, ITEM_LIMIT).map((item) => (
          <li className="row items-start gap-3 text-neutral-700" key={item}>
            <span
              className={cn(
                'center-center mt-0.5 size-5 shrink-0 rounded-full',
                primary
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 text-neutral-500'
              )}
            >
              <CheckIcon className="size-3" />
            </span>
            <span className="text-sm leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The honest answer first: who should pick which tool.
export function Verdict({
  summary,
  competitorName,
  meta,
}: {
  summary: CompareSummary;
  competitorName: string;
  meta?: CompareMeta;
}) {
  return (
    <section className="col container gap-8 py-16 md:py-20">
      <Reveal className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Column
          items={summary.best_for_openpanel}
          primary
          title="Pick OpenPanel if"
        />
        <Column
          items={summary.best_for_competitor}
          title={`Pick ${competitorName} if`}
        />
      </Reveal>
      {meta && (
        <Reveal delay={80}>
          <Byline meta={meta} />
        </Reveal>
      )}
    </section>
  );
}
