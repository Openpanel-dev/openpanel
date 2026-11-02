import { cn } from '@/lib/utils';

// A small sankey for page flows: columns of nodes, blue bands between them.
// Node heights follow their value; a link's width follows its value.

export interface SankeyNode {
  label: string;
  value: number;
}

export interface SankeyLink {
  from: [column: number, node: number];
  to: [column: number, node: number];
  value: number;
}

const WIDTH = 600;
const NODE_WIDTH = 10;
const GAP = 14;

export function SankeyMock({
  columns,
  links,
  height = 220,
  className,
  labels = true,
}: {
  columns: SankeyNode[][];
  links: SankeyLink[];
  height?: number;
  className?: string;
  labels?: boolean;
}) {
  const maxTotal = Math.max(
    ...columns.map(
      (column) =>
        column.reduce((sum, node) => sum + node.value, 0) +
        GAP * 2 * (column.length - 1)
    )
  );
  const scale = (height - GAP) / maxTotal;
  const columnX = (index: number) =>
    index * ((WIDTH - NODE_WIDTH) / Math.max(columns.length - 1, 1));

  const positions = columns.map((column) => {
    let y = GAP / 2;
    return column.map((node) => {
      const nodeHeight = node.value * scale;
      const position = { y, height: nodeHeight, outOffset: 0, inOffset: 0 };
      y += nodeHeight + GAP * scale * 2;
      return position;
    });
  });

  const paths = links.map((link) => {
    const source = positions[link.from[0]][link.from[1]];
    const target = positions[link.to[0]][link.to[1]];
    const thickness = link.value * scale;
    const x1 = columnX(link.from[0]) + NODE_WIDTH;
    const x2 = columnX(link.to[0]);
    const y1 = source.y + source.outOffset + thickness / 2;
    const y2 = target.y + target.inOffset + thickness / 2;
    source.outOffset += thickness;
    target.inOffset += thickness;
    const control = (x1 + x2) / 2;
    return {
      d: `M${x1},${y1} C${control},${y1} ${control},${y2} ${x2},${y2}`,
      thickness,
      key: `${link.from.join('-')}>${link.to.join('-')}`,
    };
  });

  return (
    <svg
      className={cn('w-full', className)}
      role="img"
      viewBox={`0 0 ${WIDTH} ${height}`}
    >
      <title>Page flow</title>
      {paths.map((path) => (
        <path
          d={path.d}
          fill="none"
          key={path.key}
          stroke="#2563eb"
          strokeOpacity="0.18"
          strokeWidth={Math.max(path.thickness, 1)}
        />
      ))}
      {columns.map((column, columnIndex) =>
        column.map((node, nodeIndex) => {
          const position = positions[columnIndex][nodeIndex];
          const x = columnX(columnIndex);
          const last = columnIndex === columns.length - 1;
          return (
            <g key={`${columnIndex}-${node.label}`}>
              <rect
                fill="#2563eb"
                height={Math.max(position.height, 2)}
                rx="2"
                width={NODE_WIDTH}
                x={x}
                y={position.y}
              />
              {labels && (
                <text
                  fill="#525252"
                  fontFamily="ui-monospace, monospace"
                  fontSize="10"
                  textAnchor={last ? 'end' : 'start'}
                  x={last ? x - 6 : x + NODE_WIDTH + 6}
                  y={position.y + Math.min(position.height / 2, 14) + 3}
                >
                  {node.label}
                </text>
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}

export const JOURNEY_COLUMNS: SankeyNode[][] = [
  [
    { label: '/', value: 62 },
    { label: '/pricing', value: 24 },
    { label: '/docs', value: 14 },
  ],
  [
    { label: '/pricing', value: 38 },
    { label: '/docs/sdks', value: 26 },
    { label: '/compare', value: 18 },
    { label: 'exit', value: 18 },
  ],
  [
    { label: '/onboarding', value: 34 },
    { label: '/docs/guides', value: 22 },
    { label: 'exit', value: 44 },
  ],
];

export const JOURNEY_LINKS: SankeyLink[] = [
  { from: [0, 0], to: [1, 0], value: 26 },
  { from: [0, 0], to: [1, 1], value: 18 },
  { from: [0, 0], to: [1, 2], value: 10 },
  { from: [0, 0], to: [1, 3], value: 8 },
  { from: [0, 1], to: [1, 0], value: 12 },
  { from: [0, 1], to: [1, 2], value: 8 },
  { from: [0, 1], to: [1, 3], value: 4 },
  { from: [0, 2], to: [1, 1], value: 8 },
  { from: [0, 2], to: [1, 3], value: 6 },
  { from: [1, 0], to: [2, 0], value: 24 },
  { from: [1, 0], to: [2, 2], value: 14 },
  { from: [1, 1], to: [2, 1], value: 16 },
  { from: [1, 1], to: [2, 2], value: 10 },
  { from: [1, 2], to: [2, 0], value: 10 },
  { from: [1, 2], to: [2, 2], value: 8 },
  { from: [1, 3], to: [2, 2], value: 12 },
];
