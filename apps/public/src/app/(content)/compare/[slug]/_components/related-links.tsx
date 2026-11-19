import Link from 'next/link';
import type { RelatedLink, RelatedLinks } from '@/lib/compare';

function Group({
  title,
  links,
  suffix = '',
}: {
  title: string;
  links: RelatedLink[];
  suffix?: string;
}) {
  return (
    <div className="col items-center gap-3">
      <span className="text-neutral-500 text-sm">{title}</span>
      <ul className="row flex-wrap justify-center gap-2">
        {links.map((link) => (
          <li key={link.url}>
            <Link
              className="row items-center rounded-full bg-white px-3.5 py-2 text-sm ring-1 ring-black/6 transition-colors hover:bg-neutral-900 hover:text-white"
              href={link.url}
            >
              {link.title ?? link.name}
              {suffix}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RelatedLinksSection({
  relatedLinks,
}: {
  relatedLinks?: RelatedLinks;
}) {
  const alternatives = relatedLinks?.alternatives ?? [];
  const guides = relatedLinks?.guides ?? [];
  const articles = relatedLinks?.articles ?? [];
  if (alternatives.length + guides.length + articles.length === 0) {
    return null;
  }
  return (
    <section className="col container items-center gap-8 py-12 md:py-16">
      {alternatives.length > 0 && (
        <Group
          links={alternatives}
          suffix=" alternative"
          title="Other comparisons"
        />
      )}
      {guides.length > 0 && <Group links={guides} title="Guides" />}
      {articles.length > 0 && <Group links={articles} title="Articles" />}
    </section>
  );
}
