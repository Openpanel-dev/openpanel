'use client';

import AutoSizer from 'react-virtualized-auto-sizer';

import { DEFAULT_ASPECT_RATIO } from '@openpanel/constants';

interface ResponsiveContainerProps {
  aspectRatio?: number;
  children:
    | ((props: { width: number; height: number }) => React.ReactNode)
    | React.ReactNode;
}

export function ResponsiveContainer({
  children,
  aspectRatio = 0.5625,
}: ResponsiveContainerProps) {
  const maxHeight = 300;

  return (
    <div
      className="w-full"
      style={{
        aspectRatio: 1 / (aspectRatio || DEFAULT_ASPECT_RATIO),
        maxHeight,
      }}
    >
      {typeof children === 'function' ? (
        <AutoSizer disableHeight>
          {({ width }) =>
            children({
              width,
              height: Math.min(
                maxHeight,
                width * aspectRatio || DEFAULT_ASPECT_RATIO
              ),
            })
          }
        </AutoSizer>
      ) : (
        children
      )}
    </div>
  );
}
