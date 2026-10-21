import type { GeoProjection } from 'd3-geo';
import { geoArea, geoCircle, geoGraticule, geoMercator, geoPath } from 'd3-geo';
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldAtlasUrl from 'world-atlas/countries-50m.json?url';

/** Mercator runs to infinity at the poles; this band holds every inhabited place. */
const NORTH_LIMIT = 84;
const SOUTH_LIMIT = -58;
/** Where d3's Mercator clips; panning up or down stops here, so there is never an edge. */
const PAN_LATITUDE_LIMIT = 85;
const GRATICULE_STEP_DEGREES = 10;
const HIDDEN_COUNTRIES = new Set(['Antarctica']);
const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  'United States of America': 'United States',
  'Dem. Rep. Congo': 'DR Congo',
  'Central African Rep.': 'CAR',
};
const EARTH_AXIAL_TILT = 23.44;
const DAYS_PER_YEAR = 365;
const DAYS_FROM_SOLSTICE_TO_YEAR_END = 10;
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 1440;

interface CountryProperties {
  name: string;
}
type CountryFeature = Feature<Polygon | MultiPolygon, CountryProperties>;
type CountriesTopology = Topology<{
  countries: GeometryCollection<CountryProperties>;
}>;

export interface WorldShapes {
  countries: CountryFeature[];
  borders: MultiLineString;
}

export interface CountryLabel {
  name: string;
  x: number;
  y: number;
  /** Projected area at zoom 1, so labels can appear as countries grow on screen. */
  area: number;
}

export interface MapGeometry {
  projection: GeoProjection;
  land: Path2D;
  borders: Path2D;
  graticule: Path2D;
  labels: CountryLabel[];
  /** One world's projected width; the map repeats sideways at this interval. */
  worldWidth: number;
  /** Where the world starts horizontally, so copies line up with it. */
  worldLeft: number;
  /** Infinite sideways, Mercator's own limit up and down. */
  panBounds: [[number, number], [number, number]];
}

export async function loadWorldShapes(): Promise<WorldShapes> {
  const response = await fetch(worldAtlasUrl);
  const topology: CountriesTopology = await response.json();
  const collection = feature(
    topology,
    topology.objects.countries
  ) as FeatureCollection<Polygon | MultiPolygon, CountryProperties>;

  return {
    countries: collection.features.filter(
      (country) => !HIDDEN_COUNTRIES.has(country.properties.name)
    ),
    borders: mesh(
      topology,
      topology.objects.countries,
      (a, b) => a !== b
    ) as MultiLineString,
  };
}

function projectMercatorY(latitude: number) {
  const radians = (latitude * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

/** Scales the map so it covers the viewport edge to edge, like `object-fit: cover`. */
function createCoverProjection(width: number, height: number) {
  const top = projectMercatorY(NORTH_LIMIT);
  const bottom = projectMercatorY(SOUTH_LIMIT);
  const scale = Math.max(width / (2 * Math.PI), height / (top - bottom));
  const middle = (top + bottom) / 2;

  return geoMercator()
    .scale(scale)
    .translate([width / 2, height / 2 + middle * scale]);
}

function getLargestPolygon(country: CountryFeature): Feature<Polygon> {
  const polygons =
    country.geometry.type === 'Polygon'
      ? [country.geometry.coordinates]
      : country.geometry.coordinates;

  let largest: Feature<Polygon> | null = null;
  let largestArea = -1;
  for (const coordinates of polygons) {
    const candidate: Feature<Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates },
    };
    const area = geoArea(candidate);
    if (area > largestArea) {
      largest = candidate;
      largestArea = area;
    }
  }

  return largest ?? (country as Feature<Polygon>);
}

function createCountryLabels(
  countries: CountryFeature[],
  path: ReturnType<typeof geoPath>
): CountryLabel[] {
  const labels: CountryLabel[] = [];
  for (const country of countries) {
    const mainland = getLargestPolygon(country);
    const [x, y] = path.centroid(mainland);
    if (!(Number.isFinite(x) && Number.isFinite(y))) {
      continue;
    }
    const name = country.properties.name;
    labels.push({
      name: COUNTRY_NAME_OVERRIDES[name] ?? name,
      x,
      y,
      area: path.area(mainland),
    });
  }

  return labels.sort((a, b) => b.area - a.area);
}

export function createMapGeometry(
  shapes: WorldShapes,
  size: { width: number; height: number }
): MapGeometry {
  const projection = createCoverProjection(size.width, size.height);
  const path = geoPath(projection);
  const [worldLeft, panTop] = projection([-180, PAN_LATITUDE_LIMIT]) ?? [0, 0];
  const [, panBottom] = projection([0, -PAN_LATITUDE_LIMIT]) ?? [
    0,
    size.height,
  ];
  const graticule = geoGraticule()
    .extent([
      [-180, -PAN_LATITUDE_LIMIT],
      [180, PAN_LATITUDE_LIMIT],
    ])
    .step([GRATICULE_STEP_DEGREES, GRATICULE_STEP_DEGREES]);

  return {
    projection,
    land: new Path2D(
      path({ type: 'FeatureCollection', features: shapes.countries }) ?? ''
    ),
    borders: new Path2D(path(shapes.borders) ?? ''),
    graticule: new Path2D(path(graticule()) ?? ''),
    labels: createCountryLabels(shapes.countries, path),
    worldWidth: 2 * Math.PI * projection.scale(),
    worldLeft,
    panBounds: [
      [Number.NEGATIVE_INFINITY, panTop],
      [Number.POSITIVE_INFINITY, panBottom],
    ],
  };
}

/** Where the sun is straight overhead; precise enough to shade night on a map. */
export function getSubsolarPoint(date: Date): [number, number] {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - startOfYear) / MS_PER_DAY;
  const latitude =
    -EARTH_AXIAL_TILT *
    Math.cos(
      ((2 * Math.PI) / DAYS_PER_YEAR) *
        (dayOfYear + DAYS_FROM_SOLSTICE_TO_YEAR_END)
    );
  const minutesIntoDay = date.getUTCHours() * 60 + date.getUTCMinutes();
  const longitude = 180 - (minutesIntoDay / MINUTES_PER_DAY) * 360;

  return [longitude, latitude];
}

export function createNightPaths(projection: GeoProjection, date: Date) {
  const [sunLongitude, sunLatitude] = getSubsolarPoint(date);
  const antipode: [number, number] = [sunLongitude + 180, -sunLatitude];
  const night = geoCircle().center(antipode).radius(90)();
  const path = geoPath(projection);
  const terminator: LineString = {
    type: 'LineString',
    coordinates: night.coordinates[0] ?? [],
  };

  return {
    area: new Path2D(path(night) ?? ''),
    edge: new Path2D(path(terminator) ?? ''),
  };
}
