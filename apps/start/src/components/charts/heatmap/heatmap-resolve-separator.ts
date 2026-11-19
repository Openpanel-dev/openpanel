import type { ReactElement, ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import { resolveChartChildElement } from '../chart-child-passthrough';
import type { HeatmapColumn } from './heatmap-context';
import {
  HEATMAP_SEPARATOR_MARKER,
  HeatmapSeparator,
} from './heatmap-separator';
import type {
  HeatmapSeparatorGroupBy,
  HeatmapSeparatorLayout,
  HeatmapSeparatorParsedConfig,
} from './heatmap-utils';
import { resolveHeatmapSeparatorLayout } from './heatmap-utils';

function getChildComponentName(child: ReactElement): string {
  const childType = child.type as { displayName?: string; name?: string };
  return typeof child.type === 'function'
    ? childType.displayName || childType.name || ''
    : '';
}

function isHeatmapSeparatorElement(child: ReactElement): boolean {
  const resolved = resolveChartChildElement(child);
  const type = resolved.type as { [HEATMAP_SEPARATOR_MARKER]?: boolean };
  return (
    resolved.type === HeatmapSeparator ||
    type[HEATMAP_SEPARATOR_MARKER] === true ||
    getChildComponentName(resolved) === 'HeatmapSeparator'
  );
}

function readHeatmapSeparatorConfig(
  child: ReactElement
): HeatmapSeparatorParsedConfig | null {
  const props = resolveChartChildElement(child).props as {
    every?: number;
    groupBy?: HeatmapSeparatorGroupBy;
    spacing?: number;
  };
  const groupBy = props.groupBy ?? 'every';

  if (groupBy === 'quarter') {
    return {
      groupBy: 'quarter',
      spacing: props.spacing ?? 0,
    };
  }

  if (props.every == null || props.every <= 0) {
    return null;
  }

  return {
    groupBy: 'every',
    every: props.every,
    spacing: props.spacing ?? 0,
  };
}

/** Reads the first {@link HeatmapSeparator} child for separator config. */
export function resolveHeatmapSeparatorConfig(
  children: ReactNode,
  chartSeparators?: HeatmapSeparatorParsedConfig | null
): HeatmapSeparatorParsedConfig | null {
  let config: HeatmapSeparatorParsedConfig | null = null;

  const visit = (node: ReactNode) => {
    if (config) {
      return;
    }

    Children.forEach(node, (child) => {
      if (config || !isValidElement(child)) {
        return;
      }

      if (isHeatmapSeparatorElement(child)) {
        config = readHeatmapSeparatorConfig(child);
        return;
      }

      const childProps = child.props as { children?: ReactNode } | undefined;
      if (childProps?.children) {
        visit(childProps.children);
      }
    });
  };

  visit(children);
  return config ?? normalizeHeatmapSeparatorConfig(chartSeparators);
}

function normalizeHeatmapSeparatorConfig(
  config?: HeatmapSeparatorParsedConfig | null
): HeatmapSeparatorParsedConfig | null {
  if (!config) {
    return null;
  }

  if (config.groupBy === 'quarter') {
    return {
      groupBy: 'quarter',
      spacing: config.spacing ?? 0,
    };
  }

  if (!config.every || config.every <= 0) {
    return null;
  }

  return {
    groupBy: 'every',
    every: config.every,
    spacing: config.spacing ?? 0,
  };
}

/** Merges chart prop and child-derived config, then resolves column indices from data. */
export function resolveHeatmapSeparatorConfigWithData(
  children: ReactNode,
  columns: HeatmapColumn[],
  chartSeparators?: HeatmapSeparatorParsedConfig | null
): HeatmapSeparatorLayout | null {
  const config = resolveHeatmapSeparatorConfig(children, chartSeparators);
  return resolveHeatmapSeparatorLayout(config, columns);
}
