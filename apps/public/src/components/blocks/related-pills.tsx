import Link from 'next/link';
import type { RelatedFeature } from '@/lib/features';
import { MORE_FEATURES, PRIMARY_FEATURES } from '@/lib/nav';

const ICONS = new Map(
  [...PRIMARY_FEATURES, ...MORE_FEATURES].map((feature) => [
    feature.href,
    feature.icon,
  ])
);

// Links to related feature pages as a row of pills, with the nav's icons.
export function RelatedPills({ related }: { related: RelatedFeature[] }) {
  if (related.length === 0) {
    return null;
  }
  return (
    <section className="col container items-center gap-5 py-10 md:py-14">
      <span className="text-neutral-500 text-sm">Works together with</span>
      <ul className="row flex-wrap justify-center gap-2">
        {related.map((item) => {
          const href = `/features/${item.slug}`;
          const Icon = ICONS.get(href);
          return (
            <li key={item.slug}>
              <Link
                className="row items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm ring-1 ring-black/6 transition-colors hover:bg-neutral-900 hover:text-white"
                href={href}
              >
                {Icon && <Icon className="size-3.5" />}
                {item.title}
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            className="row items-center gap-2 rounded-full px-3.5 py-2 font-medium text-sm underline-offset-4 hover:underline"
            href="/features"
          >
            All features
          </Link>
        </li>
      </ul>
    </section>
  );
}
