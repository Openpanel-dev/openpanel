export interface Coordinate {
  lat: number;
  long: number;
  city?: string;
  country?: string;
  count?: number;
}

export type ClusterDetailLevel = 'country' | 'city' | 'coordinate';

export interface CoordinateCluster {
  center: Coordinate;
  count: number;
  members: Coordinate[];
  location: {
    city?: string;
    country?: string;
  };
}

const COUNTRY_GROUP_MAX_ZOOM = 2;
const CITY_GROUP_MAX_ZOOM = 4.5;

function normalizeLocationValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getClusterDetailLevel(zoom: number): ClusterDetailLevel {
  if (zoom <= COUNTRY_GROUP_MAX_ZOOM) {
    return 'country';
  }

  if (zoom <= CITY_GROUP_MAX_ZOOM) {
    return 'city';
  }

  return 'coordinate';
}

function getLocationSummary(members: Coordinate[]) {
  const cityCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();

  for (const member of members) {
    const city = normalizeLocationValue(member.city);
    const country = normalizeLocationValue(member.country);
    const weight = member.count ?? 1;

    if (city) {
      cityCounts.set(city, (cityCounts.get(city) ?? 0) + weight);
    }

    if (country) {
      countryCounts.set(country, (countryCounts.get(country) ?? 0) + weight);
    }
  }

  const getTopLocation = (counts: Map<string, number>) =>
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    city: getTopLocation(cityCounts),
    country: getTopLocation(countryCounts),
  };
}

function getAggregationKey(
  member: Coordinate,
  detailLevel: Exclude<ClusterDetailLevel, 'coordinate'>
) {
  const city = normalizeLocationValue(member.city);
  const country = normalizeLocationValue(member.country);

  if (detailLevel === 'country') {
    return country ?? city;
  }

  if (country && city) {
    return `${country}::${city}`;
  }

  return city ?? country;
}

function regroupClustersByDetail(
  clusters: CoordinateCluster[],
  detailLevel: Exclude<ClusterDetailLevel, 'coordinate'>
): CoordinateCluster[] {
  const grouped = new Map<string, Coordinate[]>();
  const ungrouped: CoordinateCluster[] = [];

  for (const cluster of clusters) {
    for (const member of cluster.members) {
      const key = getAggregationKey(member, detailLevel);

      if (!key) {
        ungrouped.push({
          members: [member],
          center: calculateClusterCenter([member]),
          count: member.count ?? 1,
          location: {
            city: normalizeLocationValue(member.city),
            country: normalizeLocationValue(member.country),
          },
        });
        continue;
      }

      grouped.set(key, [...(grouped.get(key) ?? []), member]);
    }
  }

  const regrouped = [...grouped.values()].map((members) => {
    const location = getLocationSummary(members);

    return {
      members,
      center: calculateClusterCenter(members),
      count: members.reduce((sum, member) => sum + (member.count ?? 1), 0),
      location,
    };
  });

  return [...regrouped, ...ungrouped];
}

export function haversineDistance(
  coord1: Coordinate,
  coord2: Coordinate
): number {
  const R = 6371; // Earth's radius in kilometers
  const lat1Rad = coord1.lat * (Math.PI / 180);
  const lat2Rad = coord2.lat * (Math.PI / 180);
  const deltaLatRad = (coord2.lat - coord1.lat) * (Math.PI / 180);
  const deltaLonRad = (coord2.long - coord1.long) * (Math.PI / 180);

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLonRad / 2) *
      Math.sin(deltaLonRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in kilometers
}

export function findFarthestPoints(
  coordinates: Coordinate[]
): [Coordinate, Coordinate] {
  if (coordinates.length < 2) {
    throw new Error('At least two coordinates are required');
  }

  let maxDistance = 0;
  let point1: Coordinate = coordinates[0]!;
  let point2: Coordinate = coordinates[1]!;

  for (let i = 0; i < coordinates.length; i++) {
    for (let j = i + 1; j < coordinates.length; j++) {
      const distance = haversineDistance(coordinates[i]!, coordinates[j]!);
      if (distance > maxDistance) {
        maxDistance = distance;
        point1 = coordinates[i]!;
        point2 = coordinates[j]!;
      }
    }
  }

  return [point1, point2];
}

export function getAverageCenter(coordinates: Coordinate[]): Coordinate {
  if (coordinates.length === 0) {
    return { long: 0, lat: 20 };
  }

  let sumLong = 0;
  let sumLat = 0;
  let totalWeight = 0;

  for (const coord of coordinates) {
    const weight = coord.count ?? 1;
    sumLong += coord.long * weight;
    sumLat += coord.lat * weight;
    totalWeight += weight;
  }

  const avgLat = sumLat / totalWeight;
  const avgLong = sumLong / totalWeight;

  return { long: avgLong, lat: avgLat };
}

function sortCoordinates(a: Coordinate, b: Coordinate): number {
  return a.long === b.long ? a.lat - b.lat : a.long - b.long;
}

function cross(o: Coordinate, a: Coordinate, b: Coordinate): number {
  return (
    (a.long - o.long) * (b.lat - o.lat) - (a.lat - o.lat) * (b.long - o.long)
  );
}

// convex hull
export function getOuterMarkers(coordinates: Coordinate[]): Coordinate[] {
  const sorted = [...coordinates].sort(sortCoordinates);

  if (sorted.length <= 3) {
    return sorted;
  }

  const lower: Coordinate[] = [];
  for (const coord of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower.at(-2)!, lower.at(-1)!, coord) <= 0
    ) {
      lower.pop();
    }
    lower.push(coord);
  }

  const upper: Coordinate[] = [];
  for (let i = coordinates.length - 1; i >= 0; i--) {
    while (
      upper.length >= 2 &&
      cross(upper.at(-2)!, upper.at(-1)!, sorted[i]!) <= 0
    ) {
      upper.pop();
    }
    upper.push(sorted[i]!);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function calculateCentroid(polygon: Coordinate[]): Coordinate {
  if (polygon.length < 3) {
    throw new Error('At least three points are required to form a polygon.');
  }

  let area = 0;
  let centroidLat = 0;
  let centroidLong = 0;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const x0 = polygon[j]!.long;
    const y0 = polygon[j]!.lat;
    const x1 = polygon[i]!.long;
    const y1 = polygon[i]!.lat;
    const a = x0 * y1 - x1 * y0;
    area += a;
    centroidLong += (x0 + x1) * a;
    centroidLat += (y0 + y1) * a;
  }

  area /= 2;
  if (area === 0) {
    // This should not happen for a proper convex hull
    throw new Error('Area of the polygon is zero, check the coordinates.');
  }

  centroidLat /= 6 * area;
  centroidLong /= 6 * area;

  return { lat: centroidLat, long: centroidLong };
}

export function calculateGeographicMidpoint(
  coordinate: Coordinate[]
): Coordinate {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLong = Number.POSITIVE_INFINITY;
  let maxLong = Number.NEGATIVE_INFINITY;

  for (const { lat, long } of coordinate) {
    if (lat < minLat) {
      minLat = lat;
    }
    if (lat > maxLat) {
      maxLat = lat;
    }
    if (long < minLong) {
      minLong = long;
    }
    if (long > maxLong) {
      maxLong = long;
    }
  }

  // Handling the wrap around the international date line
  let midLong: number;
  if (maxLong > minLong) {
    midLong = (maxLong + minLong) / 2;
  } else {
    // Adjust calculation when spanning the dateline
    midLong = ((maxLong + 360 + minLong) / 2) % 360;
  }

  const midLat = (maxLat + minLat) / 2;

  return { lat: midLat, long: midLong };
}

export function clusterCoordinates(
  coordinates: Coordinate[],
  radius = 25,
  options: {
    useOptimizedClustering?: boolean;
    zoom?: number;
    stability?: boolean;
    adaptiveRadius?: boolean;
    viewport?: {
      center: Coordinate;
      bounds: {
        minLat: number;
        maxLat: number;
        minLong: number;
        maxLong: number;
      };
    };
  } = {}
) {
  const { zoom = 1, adaptiveRadius = true, viewport } = options;
  const detailLevel = getClusterDetailLevel(zoom);

  // Calculate adaptive radius based on zoom level and coordinate density
  let adjustedRadius = radius;

  if (adaptiveRadius) {
    // Much more aggressive clustering at lower zoom levels
    // At zoom 1: use 3x larger radius for very aggressive clustering
    // At zoom 2: use 2x radius
    // At zoom 4: use 1x radius
    // At zoom 8: use 0.2x radius for precision
    const zoomFactor = Math.max(0.1, 4 / (zoom + 1));
    adjustedRadius = radius * zoomFactor;

    // Further adjust based on coordinate density if viewport is provided
    if (viewport && coordinates.length > 0) {
      const viewportCoords = coordinates.filter(
        (coord) =>
          coord.lat >= viewport.bounds.minLat &&
          coord.lat <= viewport.bounds.maxLat &&
          coord.long >= viewport.bounds.minLong &&
          coord.long <= viewport.bounds.maxLong
      );

      if (viewportCoords.length > 0) {
        const viewportArea =
          (viewport.bounds.maxLat - viewport.bounds.minLat) *
          (viewport.bounds.maxLong - viewport.bounds.minLong);

        const density = viewportCoords.length / viewportArea;

        // Adjust radius based on density - higher density = larger radius for more aggressive clustering
        const densityFactor = Math.max(
          0.5,
          Math.min(5, Math.sqrt(density * 1000) + 1)
        );
        adjustedRadius *= densityFactor;
      }
    }
  } else {
    // Simple zoom-based adjustment when adaptive is disabled
    adjustedRadius = radius * Math.max(0.5, 1 / Math.sqrt(zoom));
  }

  // Always use basic clustering for now to ensure it works correctly
  // TODO: Re-enable optimized clustering after thorough testing
  const result = basicClusterCoordinates(coordinates, adjustedRadius);

  if (detailLevel === 'coordinate') {
    return result;
  }

  return regroupClustersByDetail(result, detailLevel);
}

// Aggressive clustering algorithm with iterative expansion
function basicClusterCoordinates(coordinates: Coordinate[], radius: number) {
  if (coordinates.length === 0) {
    return [];
  }

  const clusters: CoordinateCluster[] = [];
  const visited = new Set<number>();

  // Sort coordinates by density (coordinates near others first)
  const coordinatesWithDensity = coordinates
    .map((coord, idx) => {
      const nearbyCount = coordinates.filter(
        (other) => haversineDistance(coord, other) <= radius * 0.5
      ).length;
      return { ...coord, originalIdx: idx, nearbyCount };
    })
    .sort((a, b) => b.nearbyCount - a.nearbyCount);

  coordinatesWithDensity.forEach(
    ({ lat, long, city, country, count, originalIdx }) => {
      if (!visited.has(originalIdx)) {
        const initialCount = count ?? 1;
        const cluster = {
          members: [{ lat, long, city, country, count: initialCount }],
          center: { lat, long },
          count: initialCount,
          location: {
            city: normalizeLocationValue(city),
            country: normalizeLocationValue(country),
          },
        };

        // Mark the initial coordinate as visited
        visited.add(originalIdx);

        // Iteratively expand the cluster to include nearby points
        let expandedInLastIteration = true;
        while (expandedInLastIteration) {
          expandedInLastIteration = false;

          // For each existing cluster member, find nearby unvisited coordinates
          for (const member of [...cluster.members]) {
            coordinatesWithDensity.forEach(
              ({
                lat: otherLat,
                long: otherLong,
                city: otherCity,
                country: otherCountry,
                count: otherCount,
                originalIdx: otherIdx,
              }) => {
                if (!visited.has(otherIdx)) {
                  const distance = haversineDistance(member, {
                    lat: otherLat,
                    long: otherLong,
                  });

                  if (distance <= radius) {
                    const memberCount = otherCount ?? 1;
                    cluster.members.push({
                      lat: otherLat,
                      long: otherLong,
                      city: otherCity,
                      country: otherCountry,
                      count: memberCount,
                    });
                    visited.add(otherIdx);
                    cluster.count += memberCount;
                    expandedInLastIteration = true;
                  }
                }
              }
            );
          }
        }

        // Calculate the proper center for the cluster
        cluster.center = calculateClusterCenter(cluster.members);
        cluster.location = getLocationSummary(cluster.members);

        clusters.push(cluster);
      }
    }
  );

  return clusters;
}

// Note: Optimized clustering algorithm was removed temporarily
// TODO: Re-implement optimized clustering after basic algorithm is working well

// Utility function to get clustering statistics for debugging
export function getClusteringStats(
  coordinates: Coordinate[],
  clusters: ReturnType<typeof clusterCoordinates>
) {
  const totalPoints = coordinates.reduce(
    (sum, coordinate) => sum + (coordinate.count ?? 1),
    0
  );
  const totalClusters = clusters.length;
  const singletonClusters = clusters.filter((c) => c.count === 1).length;
  const avgClusterSize = totalPoints > 0 ? totalPoints / totalClusters : 0;
  const maxClusterSize = Math.max(...clusters.map((c) => c.count));
  const compressionRatio = totalClusters > 0 ? totalPoints / totalClusters : 1;

  return {
    totalPoints,
    totalClusters,
    singletonClusters,
    avgClusterSize: Math.round(avgClusterSize * 100) / 100,
    maxClusterSize,
    compressionRatio: Math.round(compressionRatio * 100) / 100,
  };
}

// Helper function to calculate cluster center with longitude wrapping
function calculateClusterCenter(members: Coordinate[]): Coordinate {
  if (members.length === 1) {
    return { ...members[0]! };
  }

  // Check if we need to handle longitude wrapping around the dateline
  const longitudes = members.map((m) => m.long);
  const minLong = Math.min(...longitudes);
  const maxLong = Math.max(...longitudes);

  let avgLat = 0;
  let avgLong = 0;
  let totalWeight = 0;

  if (maxLong - minLong > 180) {
    // Handle dateline crossing
    let adjustedLongSum = 0;
    for (const member of members) {
      const weight = member.count ?? 1;
      avgLat += member.lat * weight;
      const adjustedLong = member.long < 0 ? member.long + 360 : member.long;
      adjustedLongSum += adjustedLong * weight;
      totalWeight += weight;
    }
    avgLat /= totalWeight;
    avgLong = (adjustedLongSum / totalWeight) % 360;
    if (avgLong > 180) {
      avgLong -= 360;
    }
  } else {
    // Normal case - no dateline crossing
    for (const member of members) {
      const weight = member.count ?? 1;
      avgLat += member.lat * weight;
      avgLong += member.long * weight;
      totalWeight += weight;
    }
    avgLat /= totalWeight;
    avgLong /= totalWeight;
  }

  return { lat: avgLat, long: avgLong };
}
