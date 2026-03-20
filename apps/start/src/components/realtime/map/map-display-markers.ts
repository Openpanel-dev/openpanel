import type { Coordinate, CoordinateCluster } from './coordinates';
import {
  getAverageCenter,
  getClusterDetailLevel,
  haversineDistance,
} from './coordinates';
import type {
  ContinentBucket,
  DisplayMarker,
  MapProjection,
} from './map-types';
import {
  ANCHOR_R,
  createDisplayLabel,
  createMergedDisplayLabel,
  getDetailQueryScope,
  getDisplayMarkerId,
  getMergedDetailQueryScope,
  getWeightedScreenPoint,
  isValidCoordinate,
  normalizeLocationValue,
  PILL_GAP,
  PILL_H,
  PILL_W,
} from './map-utils';

function projectToScreen(
  projection: MapProjection,
  coordinate: Coordinate,
  viewportCenter: [number, number],
  zoom: number,
  size: { width: number; height: number }
) {
  const projectedPoint = projection([coordinate.long, coordinate.lat]);
  const projectedCenter = projection(viewportCenter);

  if (!(projectedPoint && projectedCenter)) {
    return null;
  }

  return {
    x: (projectedPoint[0] - projectedCenter[0]) * zoom + size.width / 2,
    y: (projectedPoint[1] - projectedCenter[1]) * zoom + size.height / 2,
  };
}

function isOffscreen(
  point: { x: number; y: number },
  size: { width: number; height: number }
) {
  const margin = PILL_W;

  return (
    point.x < -margin ||
    point.x > size.width + margin ||
    point.y < -margin ||
    point.y > size.height + margin
  );
}

function doPillsOverlap(
  left: { x: number; y: number },
  right: { x: number; y: number },
  padding: number
) {
  const leftBox = {
    left: left.x - PILL_W / 2 - padding,
    right: left.x + PILL_W / 2 + padding,
    top: left.y - (PILL_H + ANCHOR_R + PILL_GAP) - padding,
  };
  const rightBox = {
    left: right.x - PILL_W / 2 - padding,
    right: right.x + PILL_W / 2 + padding,
    top: right.y - (PILL_H + ANCHOR_R + PILL_GAP) - padding,
  };

  const leftBottom = leftBox.top + PILL_H + padding * 2;
  const rightBottom = rightBox.top + PILL_H + padding * 2;

  return !(
    leftBox.right < rightBox.left ||
    leftBox.left > rightBox.right ||
    leftBottom < rightBox.top ||
    leftBox.top > rightBottom
  );
}

function getVisualMergePadding(zoom: number) {
  const detailLevel = getClusterDetailLevel(zoom);

  if (detailLevel === 'country') {
    return 8;
  }

  if (detailLevel === 'city') {
    return 4;
  }

  return 2;
}

function getContinentBucket(coordinate: Coordinate): ContinentBucket {
  const { lat, long } = coordinate;

  if (lat >= 15 && long >= -170 && long <= -20) {
    return 'north-america';
  }

  if (lat < 15 && lat >= -60 && long >= -95 && long <= -30) {
    return 'south-america';
  }

  if (lat >= 35 && long >= -25 && long <= 45) {
    return 'europe';
  }

  if (lat >= -40 && lat <= 38 && long >= -20 && long <= 55) {
    return 'africa';
  }

  if (lat >= -10 && long >= 110 && long <= 180) {
    return 'oceania';
  }

  if (lat >= -10 && long >= 55 && long <= 180) {
    return 'asia';
  }

  if (lat >= 0 && long >= 45 && long <= 180) {
    return 'asia';
  }

  if (lat >= -10 && long >= 30 && long < 55) {
    return 'asia';
  }

  return 'unknown';
}

function getMaxVisualMergeDistanceKm(zoom: number) {
  const detailLevel = getClusterDetailLevel(zoom);

  if (detailLevel === 'country') {
    return 2200;
  }

  if (detailLevel === 'city') {
    return 900;
  }

  return 500;
}

function canVisuallyMergeMarkers(
  left: CoordinateCluster,
  right: CoordinateCluster,
  zoom: number
) {
  const sameContinent =
    getContinentBucket(left.center) === getContinentBucket(right.center);

  if (!sameContinent) {
    return false;
  }

  return (
    haversineDistance(left.center, right.center) <=
    getMaxVisualMergeDistanceKm(zoom)
  );
}

export function createDisplayMarkers({
  markers,
  projection,
  viewportCenter,
  zoom,
  labelZoom,
  size,
}: {
  markers: CoordinateCluster[];
  projection: MapProjection;
  viewportCenter: [number, number];
  zoom: number;
  labelZoom: number;
  size: { width: number; height: number };
}): DisplayMarker[] {
  const positionedMarkers = markers
    .map((marker) => {
      if (!isValidCoordinate(marker.center)) {
        return null;
      }

      const point = projectToScreen(
        projection,
        marker.center,
        viewportCenter,
        zoom,
        size
      );

      if (!point || isOffscreen(point, size)) {
        return null;
      }

      return { marker, point };
    })
    .filter((entry) => entry !== null);

  const entries = positionedMarkers.sort(
    (left, right) => right.marker.count - left.marker.count
  );
  const consumed = new Set<number>();
  const mergedMarkers: DisplayMarker[] = [];
  const overlapPadding = getVisualMergePadding(labelZoom);

  for (let index = 0; index < entries.length; index++) {
    if (consumed.has(index)) {
      continue;
    }

    const queue = [index];
    const componentIndices: number[] = [];
    consumed.add(index);

    while (queue.length > 0) {
      const currentIndex = queue.shift()!;
      componentIndices.push(currentIndex);

      for (
        let candidateIndex = currentIndex + 1;
        candidateIndex < entries.length;
        candidateIndex++
      ) {
        if (consumed.has(candidateIndex)) {
          continue;
        }

        if (
          doPillsOverlap(
            entries[currentIndex]!.point,
            entries[candidateIndex]!.point,
            overlapPadding
          ) &&
          canVisuallyMergeMarkers(
            entries[currentIndex]!.marker,
            entries[candidateIndex]!.marker,
            labelZoom
          )
        ) {
          consumed.add(candidateIndex);
          queue.push(candidateIndex);
        }
      }
    }

    const componentEntries = componentIndices.map(
      (componentIndex) => entries[componentIndex]!
    );
    const componentMarkers = componentEntries.map((entry) => entry.marker);

    if (componentMarkers.length === 1) {
      const marker = componentMarkers[0]!;
      mergedMarkers.push({
        ...marker,
        detailScope: getDetailQueryScope(marker, labelZoom),
        id: getDisplayMarkerId(marker.members),
        label: createDisplayLabel(marker, labelZoom),
        mergedVisualClusters: 1,
        screenPoint: entries[index]!.point,
      });
      continue;
    }

    const members = componentMarkers.flatMap((marker) => marker.members);
    const center = getAverageCenter(members);
    const representativeCountry = normalizeLocationValue(
      componentMarkers[0]?.location.country
    );
    const representativeCity = normalizeLocationValue(
      componentMarkers[0]?.location.city
    );

    const mergedMarker: CoordinateCluster = {
      center,
      count: componentMarkers.reduce((sum, marker) => sum + marker.count, 0),
      members,
      location: {
        city: representativeCity,
        country: representativeCountry,
      },
    };

    mergedMarkers.push({
      ...mergedMarker,
      detailScope: getMergedDetailQueryScope(labelZoom),
      id: getDisplayMarkerId(mergedMarker.members),
      label: createMergedDisplayLabel(mergedMarker, labelZoom),
      mergedVisualClusters: componentMarkers.length,
      screenPoint: getWeightedScreenPoint(
        componentEntries.map((entry) => ({
          count: entry.marker.count,
          screenPoint: entry.point,
        }))
      ),
    });
  }

  return mergedMarkers;
}
