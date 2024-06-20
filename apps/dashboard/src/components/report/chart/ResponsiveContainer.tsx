import AutoSizer from 'react-virtualized-auto-sizer';

interface ResponsiveContainerProps {
  children: (props: { width: number; height: number }) => React.ReactNode;
}

export function ResponsiveContainer({ children }: ResponsiveContainerProps) {
  const maxHeight = 300;
  const minHeight = 200;
  return (
    <div
      style={{
        maxHeight,
        minHeight,
      }}
      className={'aspect-video w-full max-sm:-mx-3'}
    >
      <AutoSizer disableHeight>
        {({ width }) =>
          children({
            width,
            height: Math.min(maxHeight, width * 0.5625),
          })
        }
      </AutoSizer>
    </div>
  );
}
