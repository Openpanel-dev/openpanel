import { Reveal } from '@/components/reveal';
import { SectionHeader } from '@/components/section';

export interface CompareItem {
  label: string;
  caption?: string;
  visual: React.ReactNode;
}

// Two (or three) small replicas side by side, each with a label: for
// before/after and either/or stories.
export function CompareRow({
  label,
  title,
  description,
  items,
}: {
  label?: string;
  title?: string;
  description?: string;
  items: CompareItem[];
}) {
  return (
    <section className="col container gap-12 py-16 md:py-24">
      {title && (
        <Reveal>
          <SectionHeader
            align="center"
            description={description}
            label={label}
            title={title}
            variant="sm"
          />
        </Reveal>
      )}
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((item, index) => (
          <Reveal
            as="li"
            className="surface col gap-4 p-6"
            delay={index * 90}
            key={item.label}
          >
            <div
              aria-hidden
              className="overflow-hidden rounded-xl bg-neutral-50 p-4 ring-1 ring-black/4"
            >
              {item.visual}
            </div>
            <div className="col gap-0.5">
              <span className="font-medium">{item.label}</span>
              {item.caption && (
                <span className="text-neutral-600 text-sm">{item.caption}</span>
              )}
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
