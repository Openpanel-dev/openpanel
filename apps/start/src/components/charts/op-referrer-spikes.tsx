'use client';

import { useMemo } from 'react';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import {
  OPMarkerLayer,
  type OPMarkerCluster,
  type OPMarkerItem,
} from './op-marker-layer';

export interface OPReferrerSpikeItem {
  date: string | Date;
  referrer_name: string;
  sessions: number;
  baseline: number;
  ratio: number;
  share: number;
  isNew: boolean;
  others: Array<{ referrer_name: string; sessions: number; ratio: number }>;
}

export interface OPReferrerSpikeCluster {
  /** Top-score spike's date — drives marker x position. */
  anchorDate: string | Date;
  /** Spikes in this cluster, sorted by score descending. Length >= 1. */
  spikes: OPReferrerSpikeItem[];
}

interface OPReferrerSpikesProps {
  items: OPReferrerSpikeCluster[] | null | undefined;
  /** Marker circle size in px. Defaults via OPMarkerLayer. */
  size?: number;
  /**
   * Fired when the user clicks a spike marker (collapsed favicon, or any
   * fanned-out individual marker). Receives the referrer's name so the
   * caller can drive a filter, navigation, etc.
   */
  onSpikeClick?: (referrerName: string) => void;
}

/**
 * Renders auto-detected referrer spike clusters through the shared marker
 * layer. Multi-spike clusters get count badges and fan out (either via
 * direct hover or when the chart's crosshair lands on one of their buckets).
 * Bidirectional hover is inherited from OPMarkerLayer. The favicon fills
 * the marker circle (see OPMarkerLayer's iconFill default).
 */
export function OPReferrerSpikes({
  items,
  size,
  onSpikeClick,
}: OPReferrerSpikesProps) {
  const clusters = useMemo<OPMarkerCluster[]>(() => {
    if (!items || items.length === 0) return [];
    return items.map((cluster) => {
      const markerItems: OPMarkerItem[] = cluster.spikes.map((spike) => ({
        date:
          typeof spike.date === 'string' ? new Date(spike.date) : spike.date,
        icon: <SerieIcon fill name={spike.referrer_name} />,
        title: spike.referrer_name,
        onClick: onSpikeClick
          ? () => onSpikeClick(spike.referrer_name)
          : undefined,
      }));
      return { anchorDate: cluster.anchorDate, items: markerItems };
    });
  }, [items, onSpikeClick]);

  return <OPMarkerLayer clusters={clusters} size={size} />;
}
