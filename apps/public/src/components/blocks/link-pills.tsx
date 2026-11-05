import Link from 'next/link';

export interface LinkPillGroup {
  title: string;
  links: { title: string; url: string }[];
}

// Related links as rows of pills, one row per group. Empty groups are skipped.
export function LinkPills({ groups }: { groups: LinkPillGroup[] }) {
  const shown = groups.filter((group) => group.links.length > 0);
  if (shown.length === 0) {
    return null;
  }
  return (
    <section className="col container items-center gap-8 py-12 md:py-16">
      {shown.map((group) => (
        <div className="col items-center gap-3" key={group.title}>
          <span className="text-neutral-500 text-sm">{group.title}</span>
          <ul className="row flex-wrap justify-center gap-2">
            {group.links.map((link) => (
              <li key={link.url}>
                <Link
                  className="row items-center rounded-full bg-white px-3.5 py-2 text-sm ring-1 ring-black/6 transition-colors hover:bg-neutral-900 hover:text-white"
                  href={link.url}
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
