import {
  DETAIL_CARD_ANCHOR_OFFSET,
  DETAIL_CARD_GAP,
  DETAIL_CARD_INSET,
  DETAIL_CARD_MIN_HEIGHT,
  DETAIL_CARD_WIDTH,
  MARKER_MAX_RADIUS,
  MARKER_MIN_RADIUS,
  MARKER_RADIUS_PER_SQRT_VISITOR,
  PLACE_MAX_LOCATIONS,
} from './map-constants';
import type { DisplayMarker, MapLocation, RealtimeMapPoint } from './map-types';

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

const regionDisplayNames =
  typeof Intl !== 'undefined'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function normalizeLocationValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isValidPoint(point: RealtimeMapPoint) {
  return Number.isFinite(point.lat) && Number.isFinite(point.long);
}

export interface MapPlace {
  id: string;
  label: string;
  count: number;
  lat: number;
  long: number;
  locations: MapLocation[];
}

/** A city is one dot: GeoIP gives one city several nearby coordinates, which would stack. */
function getPlaceId(point: RealtimeMapPoint) {
  const country = normalizeLocationValue(point.country) ?? '';
  const city = normalizeLocationValue(point.city);
  if (city) {
    return `${country}:${city}`;
  }
  return `${country}:${point.long.toFixed(2)}:${point.lat.toFixed(2)}`;
}

export function groupPointsByPlace(points: RealtimeMapPoint[]): MapPlace[] {
  const places = new Map<string, MapPlace>();

  for (const point of points) {
    if (!isValidPoint(point)) {
      continue;
    }
    const id = getPlaceId(point);
    const location: MapLocation = {
      city: point.city,
      country: point.country,
      lat: point.lat,
      long: point.long,
    };
    const place = places.get(id);
    if (!place) {
      places.set(id, {
        id,
        label: getPointLabel(point),
        count: point.count,
        lat: point.lat,
        long: point.long,
        locations: [location],
      });
      continue;
    }
    const total = place.count + point.count;
    place.lat = (place.lat * place.count + point.lat * point.count) / total;
    place.long = (place.long * place.count + point.long * point.count) / total;
    place.count = total;
    if (place.locations.length < PLACE_MAX_LOCATIONS) {
      place.locations.push(location);
    }
  }

  return [...places.values()];
}

export function formatCountryLabel(country?: string) {
  const normalized = normalizeLocationValue(country);

  if (!normalized) {
    return undefined;
  }

  if (!COUNTRY_CODE_PATTERN.test(normalized)) {
    return normalized;
  }

  return regionDisplayNames?.of(normalized) ?? normalized;
}

function getPointLabel(point: RealtimeMapPoint) {
  const city = normalizeLocationValue(point.city);
  const country = formatCountryLabel(point.country);
  return [city, country].filter(Boolean).join(', ') || 'Unknown location';
}

export function getMarkerRadius(count: number) {
  const radius =
    MARKER_MIN_RADIUS + Math.sqrt(count) * MARKER_RADIUS_PER_SQRT_VISITOR;
  return Math.min(MARKER_MAX_RADIUS, radius);
}

/** Sits beside the dot, never on it, so the place you clicked stays in view. */
export function getBadgeOverlayPosition(
  marker: DisplayMarker,
  size: { width: number; height: number }
) {
  const overlayWidth = Math.min(
    DETAIL_CARD_WIDTH,
    size.width - DETAIL_CARD_INSET * 2
  );
  const rightOfDot = marker.screenPoint.x + DETAIL_CARD_GAP;
  const leftOfDot = marker.screenPoint.x - DETAIL_CARD_GAP - overlayWidth;
  const fitsOnRight =
    rightOfDot + overlayWidth <= size.width - DETAIL_CARD_INSET;
  const left = Math.max(
    DETAIL_CARD_INSET,
    fitsOnRight ? rightOfDot : leftOfDot
  );
  const top = Math.max(
    DETAIL_CARD_INSET,
    Math.min(
      marker.screenPoint.y - DETAIL_CARD_ANCHOR_OFFSET,
      size.height - DETAIL_CARD_MIN_HEIGHT
    )
  );

  return { left, overlayWidth, top };
}

export function getProfileDisplayName(profile: {
  firstName: string;
  lastName: string;
  email: string;
  id: string;
}) {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  return name || profile.email || profile.id;
}
