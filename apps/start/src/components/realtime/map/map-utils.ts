import type { Coordinate, CoordinateCluster } from './coordinates';
import { getClusterDetailLevel } from './coordinates';
import type { DisplayMarker } from './map-types';

export const PILL_W = 220;
export const PILL_H = 32;
export const ANCHOR_R = 3;
export const PILL_GAP = 6;

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

const regionDisplayNames =
  typeof Intl !== 'undefined'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

export function normalizeLocationValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function isValidCoordinate(coordinate: Coordinate) {
  return Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.long);
}

export function getCoordinateIdentity(coordinate: Coordinate) {
  return [
    normalizeLocationValue(coordinate.country) ?? '',
    normalizeLocationValue(coordinate.city) ?? '',
    isValidCoordinate(coordinate) ? coordinate.long.toFixed(4) : 'invalid-long',
    isValidCoordinate(coordinate) ? coordinate.lat.toFixed(4) : 'invalid-lat',
  ].join(':');
}

export function getDisplayMarkerId(members: Coordinate[]) {
  const validMembers = members.filter(isValidCoordinate);

  if (validMembers.length === 0) {
    return 'invalid-cluster';
  }

  return validMembers.map(getCoordinateIdentity).sort().join('|');
}

export function getWeightedScreenPoint(
  markers: Array<{
    count: number;
    screenPoint: {
      x: number;
      y: number;
    };
  }>
) {
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;

  for (const marker of markers) {
    weightedX += marker.screenPoint.x * marker.count;
    weightedY += marker.screenPoint.y * marker.count;
    totalWeight += marker.count;
  }

  return {
    x: weightedX / totalWeight,
    y: weightedY / totalWeight,
  };
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

export function summarizeLocation(members: Coordinate[]) {
  const cities = new Set<string>();
  const countries = new Set<string>();

  for (const member of members) {
    const city = normalizeLocationValue(member.city);
    const country = normalizeLocationValue(member.country);

    if (city) {
      cities.add(city);
    }

    if (country) {
      countries.add(country);
    }
  }

  return {
    cityCount: cities.size,
    countryCount: countries.size,
    firstCity: [...cities][0],
    firstCountry: [...countries][0],
  };
}

export function createDisplayLabel(
  marker: CoordinateCluster,
  zoom: number
): string {
  const detailLevel = getClusterDetailLevel(zoom);

  if (detailLevel === 'country') {
    return (
      formatCountryLabel(marker.location.country) ?? marker.location.city ?? '?'
    );
  }

  if (detailLevel === 'city') {
    return (
      marker.location.city ?? formatCountryLabel(marker.location.country) ?? '?'
    );
  }

  const cityMember = marker.members.find((member) => member.city?.trim());
  return (
    cityMember?.city?.trim() ??
    formatCountryLabel(marker.location.country) ??
    '?'
  );
}

export function getDetailQueryScope(
  marker: CoordinateCluster,
  zoom: number
): DisplayMarker['detailScope'] {
  const detailLevel = getClusterDetailLevel(zoom);

  if (detailLevel === 'country') {
    return 'country';
  }

  if (detailLevel === 'city') {
    return marker.location.city ? 'city' : 'country';
  }

  return 'coordinate';
}

export function getMergedDetailQueryScope(
  zoom: number
): DisplayMarker['detailScope'] {
  const detailLevel = getClusterDetailLevel(zoom);

  return detailLevel === 'country' ? 'country' : 'city';
}

export function createMergedDisplayLabel(
  marker: CoordinateCluster,
  zoom: number
): string {
  const detailLevel = getClusterDetailLevel(zoom);
  const summary = summarizeLocation(marker.members);

  if (detailLevel === 'country') {
    if (summary.countryCount <= 1) {
      return (
        formatCountryLabel(summary.firstCountry) ?? summary.firstCity ?? '?'
      );
    }

    return `${summary.countryCount} countries`;
  }

  if (detailLevel === 'city') {
    if (summary.cityCount === 1 && summary.firstCity) {
      return summary.firstCity;
    }

    if (summary.countryCount === 1) {
      const country = formatCountryLabel(summary.firstCountry);

      if (country && summary.cityCount > 1) {
        return `${country}, ${summary.cityCount} cities`;
      }

      return country ?? `${summary.cityCount} places`;
    }

    if (summary.countryCount > 1) {
      return `${summary.countryCount} countries`;
    }
  }

  if (summary.cityCount === 1 && summary.firstCity) {
    return summary.firstCity;
  }

  if (summary.countryCount === 1) {
    const country = formatCountryLabel(summary.firstCountry);

    if (country && summary.cityCount > 1) {
      return `${country}, ${summary.cityCount} places`;
    }

    return country ?? `${marker.members.length} places`;
  }

  return `${Math.max(summary.countryCount, summary.cityCount, 2)} places`;
}

export function getBadgeOverlayPosition(
  marker: DisplayMarker,
  size: { width: number; height: number }
) {
  const overlayWidth = Math.min(380, size.width - 24);
  const preferredLeft = marker.screenPoint.x - overlayWidth / 2;
  const left = Math.max(
    12,
    Math.min(preferredLeft, size.width - overlayWidth - 12)
  );
  const top = Math.max(
    12,
    Math.min(marker.screenPoint.y + 16, size.height - 340)
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

export function getUniqueCoordinateDetailLocations(members: Coordinate[]) {
  const locationsByKey: Record<
    string,
    {
      city?: string;
      country?: string;
      lat: number;
      long: number;
    }
  > = {};

  for (const member of members) {
    if (!isValidCoordinate(member)) {
      continue;
    }

    const key = [
      normalizeLocationValue(member.country) ?? '',
      normalizeLocationValue(member.city) ?? '',
      member.long.toFixed(4),
      member.lat.toFixed(4),
    ].join(':');

    locationsByKey[key] = {
      city: member.city,
      country: member.country,
      lat: member.lat,
      long: member.long,
    };
  }

  return Object.values(locationsByKey);
}

export function getUniquePlaceDetailLocations(members: Coordinate[]) {
  const locationsByKey: Record<
    string,
    {
      city?: string;
      country?: string;
    }
  > = {};

  for (const member of members) {
    const key = [
      normalizeLocationValue(member.country) ?? '',
      normalizeLocationValue(member.city) ?? '',
    ].join(':');

    locationsByKey[key] = {
      city: member.city,
      country: member.country,
    };
  }

  return Object.values(locationsByKey);
}
