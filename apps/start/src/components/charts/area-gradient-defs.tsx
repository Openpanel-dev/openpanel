interface AreaGradientDefsProps {
  gradientId: string;
  strokeGradientId: string;
  edgeMaskId: string;
  edgeGradientId: string;
  fill: string;
  fillOpacity: number;
  gradientToOpacity: number;
  resolvedStroke: string;
  isPatternFill: boolean;
  fadeEdges: boolean;
  innerWidth: number;
  innerHeight: number;
}

export function AreaGradientDefs({
  gradientId,
  strokeGradientId,
  edgeMaskId,
  edgeGradientId,
  fill,
  fillOpacity,
  gradientToOpacity,
  resolvedStroke,
  isPatternFill,
  fadeEdges,
  innerWidth,
  innerHeight,
}: AreaGradientDefsProps) {
  return (
    <defs>
      {isPatternFill ? null : (
        <linearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
          <stop
            offset="0%"
            style={{ stopColor: fill, stopOpacity: fillOpacity }}
          />
          <stop
            offset="100%"
            style={{ stopColor: fill, stopOpacity: gradientToOpacity }}
          />
        </linearGradient>
      )}

      <linearGradient id={strokeGradientId} x1="0%" x2="100%" y1="0%" y2="0%">
        <stop
          offset="0%"
          style={{ stopColor: resolvedStroke, stopOpacity: 0 }}
        />
        <stop
          offset="15%"
          style={{ stopColor: resolvedStroke, stopOpacity: 1 }}
        />
        <stop
          offset="85%"
          style={{ stopColor: resolvedStroke, stopOpacity: 1 }}
        />
        <stop
          offset="100%"
          style={{ stopColor: resolvedStroke, stopOpacity: 0 }}
        />
      </linearGradient>

      {fadeEdges && !isPatternFill ? (
        <>
          <linearGradient id={edgeGradientId} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" style={{ stopColor: "white", stopOpacity: 0 }} />
            <stop offset="20%" style={{ stopColor: "white", stopOpacity: 1 }} />
            <stop offset="80%" style={{ stopColor: "white", stopOpacity: 1 }} />
            <stop
              offset="100%"
              style={{ stopColor: "white", stopOpacity: 0 }}
            />
          </linearGradient>
          <mask id={edgeMaskId}>
            <rect
              fill={`url(#${edgeGradientId})`}
              height={innerHeight}
              width={innerWidth}
              x="0"
              y="0"
            />
          </mask>
        </>
      ) : null}
    </defs>
  );
}
