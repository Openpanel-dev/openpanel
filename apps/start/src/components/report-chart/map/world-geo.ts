import type { FeatureCollection, MultiPolygon } from 'geojson';
import countries from 'react-svg-worldmap/dist/countries.geo';
import type { ChoroplethFeatureProperties } from '@/components/charts/choropleth';

/**
 * Country outlines keyed by ISO 3166 alpha-2 code, the code our country
 * breakdowns use. They come with react-svg-worldmap, already a dependency,
 * in its own compact shape (`N` name, `I` code, `C` MultiPolygon coordinates).
 */
export const WORLD_COUNTRIES: FeatureCollection<
  MultiPolygon,
  ChoroplethFeatureProperties
> = {
  type: 'FeatureCollection',
  features: countries.features.map((country) => ({
    type: 'Feature',
    id: country.I,
    properties: { name: country.N, id: country.I },
    geometry: { type: 'MultiPolygon', coordinates: country.C },
  })),
};
