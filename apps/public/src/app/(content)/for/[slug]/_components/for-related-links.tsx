import { LinkPills } from '@/components/blocks/link-pills';
import type { ForRelatedLinks } from '@/lib/for';

export function ForRelatedLinksSection({
  relatedLinks,
}: {
  relatedLinks?: ForRelatedLinks;
}) {
  return (
    <LinkPills
      groups={[
        { title: 'Guides', links: relatedLinks?.guides ?? [] },
        { title: 'Articles', links: relatedLinks?.articles ?? [] },
        { title: 'Comparisons', links: relatedLinks?.comparisons ?? [] },
      ]}
    />
  );
}
