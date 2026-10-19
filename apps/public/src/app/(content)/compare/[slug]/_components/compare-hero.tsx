import Image from 'next/image';
import Link from 'next/link';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { GetStartedButton } from '@/components/get-started-button';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import type {
  CompareCompetitor,
  CompareHero as CompareHeroData,
  CompareMeta,
  CompareSummary,
} from '@/lib/compare';
import { getAuthor } from '@/lib/layout.shared';

const VERDICT_ITEM_LIMIT = 4;

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
    <div className="row flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-sm">
      {author?.image && (
        <Image
          alt={author.name}
          className="size-8 rounded-full"
          height={32}
          src={author.image}
          width={32}
        />
      )}
      <span className="font-medium text-foreground">{meta.author}</span>
      <span>
        <span aria-hidden>· </span>
        <time dateTime={meta.updated}>Updated {formatDate(meta.updated)}</time>
      </span>
      {meta.prices_checked && (
        <span>
          <span aria-hidden>· </span>
          Prices checked {formatDate(meta.prices_checked)}
        </span>
      )}
    </div>
  );
}

function VerdictColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="col gap-3">
      <h3 className="font-semibold">{title}</h3>
      <ul className="col gap-2">
        {items.slice(0, VERDICT_ITEM_LIMIT).map((item) => (
          <li
            className="text-muted-foreground text-sm leading-relaxed"
            key={item}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CompareHeroProps {
  hero: CompareHeroData;
  competitor: CompareCompetitor;
  summary: CompareSummary;
  meta?: CompareMeta;
}

export function CompareHero({
  hero,
  competitor,
  summary,
  meta,
}: CompareHeroProps) {
  return (
    <HeroContainer className="-mb-32" divider={false}>
      <div className="col w-full gap-10">
        <div className="col max-w-4xl gap-6">
          <div className="row items-center gap-3 text-muted-foreground text-sm">
            <Logo className="h-6" />
            <span>vs</span>
            <span className="rounded-full border px-3 py-1 font-medium text-foreground">
              {competitor.name}
            </span>
          </div>
          <h1 className="font-semibold text-4xl leading-tight md:text-5xl">
            {hero.heading}
          </h1>
          <p className="text-lg text-muted-foreground">{hero.subheading}</p>
          {meta && <Byline meta={meta} />}
        </div>

        <div className="col max-w-4xl gap-6 rounded-2xl border bg-background p-6 md:p-8">
          <p className="font-medium text-lg">{summary.one_liner}</p>
          <div className="grid gap-8 md:grid-cols-2">
            <VerdictColumn
              items={summary.best_for_openpanel}
              title="Pick OpenPanel if"
            />
            <VerdictColumn
              items={summary.best_for_competitor}
              title={`Pick ${competitor.name} if`}
            />
          </div>
          <div className="row flex-wrap gap-3">
            <GetStartedButton />
            <Button asChild size="lg" variant="outline">
              <Link
                href="https://demo.openpanel.dev"
                rel="noreferrer noopener nofollow"
                target="_blank"
              >
                See live demo
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </HeroContainer>
  );
}
