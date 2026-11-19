import { featureVisual } from './for-visuals';
import { CardGrid } from '@/components/blocks/card-grid';
import type { ForFeatures as ForFeaturesData } from '@/lib/for';

// The feature cards, each with a small replica when its title names a
// product area.
export function ForFeatures({ features }: { features: ForFeaturesData }) {
  return (
    <CardGrid
      description={features.intro}
      id="features"
      items={features.items.map((item) => ({
        title: item.title,
        description: item.description,
        visual: featureVisual(item.title),
      }))}
      label="What you get"
      title={features.title}
    />
  );
}
