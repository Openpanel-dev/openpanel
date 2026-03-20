import { useRef } from 'react';
import { MapBadgeDetails } from './map-badge-details';
import { MapCanvas } from './map-canvas';
import type { RealtimeMapProps } from './map-types';

const Map = ({ projectId, markers, sidebarConfig }: RealtimeMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative h-full w-full" ref={containerRef}>
      <MapCanvas
        markers={markers}
        projectId={projectId}
        sidebarConfig={sidebarConfig}
      />

      <MapBadgeDetails containerRef={containerRef} />
    </div>
  );
};

export default Map;
