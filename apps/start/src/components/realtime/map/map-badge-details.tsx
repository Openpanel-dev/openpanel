import { bind } from 'bind-event-listener';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { MapBadgeDetailCard } from './map-badge-detail-card';
import { closeMapBadgeDetails } from './realtime-map-badge-slice';
import { useDispatch, useSelector } from '@/redux';

export function MapBadgeDetails({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const dispatch = useDispatch();
  const panelRef = useRef<HTMLDivElement>(null);
  const { open, marker, projectId } = useSelector(
    (state) => state.realtimeMapBadge
  );
  const [overlaySize, setOverlaySize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!(open && marker)) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        dispatch(closeMapBadgeDetails());
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dispatch(closeMapBadgeDetails());
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dispatch, marker, open]);

  useEffect(() => {
    const measure = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      setOverlaySize({ width: rect.width, height: rect.height });
    };

    measure();

    return bind(window, {
      type: 'resize',
      listener: measure,
    });
  }, [containerRef]);

  if (!(open && marker && projectId && overlaySize)) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.button
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[80] bg-black/10"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        key="map-badge-backdrop"
        onClick={() => dispatch(closeMapBadgeDetails())}
        type="button"
      />
      <MapBadgeDetailCard
        key="map-badge-panel"
        marker={marker}
        onClose={() => dispatch(closeMapBadgeDetails())}
        panelRef={panelRef}
        projectId={projectId}
        size={overlaySize}
      />
    </AnimatePresence>
  );
}
