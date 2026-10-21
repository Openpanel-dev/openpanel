import { useRef } from 'react';
import { MapBadgeDetails } from './map-badge-details';
import type { RealtimeMapProps } from './map-types';
import { RealtimeMap } from './realtime-map';

const Map = ({ projectId, markers, overscroll }: RealtimeMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative h-full w-full" ref={containerRef}>
      <RealtimeMap
        markers={markers}
        overscroll={overscroll}
        projectId={projectId}
      />
      <MapBadgeDetails containerRef={containerRef} />
    </div>
  );
};

export default Map;
