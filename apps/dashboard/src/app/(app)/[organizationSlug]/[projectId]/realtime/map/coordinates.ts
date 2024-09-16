export type Coordinate = {
  lat: number;
  long: number;
};

export function haversineDistance(
  coord1: Coordinate,
  coord2: Coordinate,
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
  coordinates: Coordinate[],
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

  for (const coord of coordinates) {
    sumLong += coord.long;
    sumLat += coord.lat;
  }

  const avgLat = sumLat / coordinates.length;
  const avgLong = sumLong / coordinates.length;

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
  const sorted = coordinates.sort(sortCoordinates);

  if (sorted.length <= 3) return sorted;

  const lower: Coordinate[] = [];
  for (const coord of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, coord) <= 0
    ) {
      lower.pop();
    }
    lower.push(coord);
  }

  const upper: Coordinate[] = [];
  for (let i = coordinates.length - 1; i >= 0; i--) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, sorted[i]!) <= 0
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

  area = area / 2;
  if (area === 0) {
    // This should not happen for a proper convex hull
    throw new Error('Area of the polygon is zero, check the coordinates.');
  }

  centroidLat /= 6 * area;
  centroidLong /= 6 * area;

  return { lat: centroidLat, long: centroidLong };
}

export function calculateGeographicMidpoint(
  coordinate: Coordinate[],
): Coordinate {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLong = Number.POSITIVE_INFINITY;
  let maxLong = Number.NEGATIVE_INFINITY;

  for (const { lat, long } of coordinate) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (long < minLong) minLong = long;
    if (long > maxLong) maxLong = long;
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

export function clusterCoordinates(coordinates: Coordinate[], radius = 25) {
  const clusters: {
    center: Coordinate;
    count: number;
    members: Coordinate[];
  }[] = [];
  const visited = new Set<number>();

  coordinates.forEach((coord, idx) => {
    if (!visited.has(idx)) {
      const cluster = {
        members: [coord],
        center: { lat: coord.lat, long: coord.long },
        count: 0,
      };

      coordinates.forEach((otherCoord, otherIdx) => {
        if (
          !visited.has(otherIdx) &&
          haversineDistance(coord, otherCoord) <= radius
        ) {
          cluster.members.push(otherCoord);
          visited.add(otherIdx);
          cluster.count++;
        }
      });

      // Calculate geographic center for the cluster
      cluster.center = cluster.members.reduce(
        (center, cur) => {
          return {
            lat: center.lat + cur.lat / cluster.members.length,
            long: center.long + cur.long / cluster.members.length,
          };
        },
        { lat: 0, long: 0 },
      );

      clusters.push(cluster);
    }
  });

  return clusters.map((cluster) => ({
    center: cluster.center,
    count: cluster.count,
    members: cluster.members,
  }));
}
