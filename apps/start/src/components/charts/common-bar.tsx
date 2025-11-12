import { getChartColor, getChartTranslucentColor } from '@/utils/theme';
import { Bar } from 'recharts';

type Options = {
  borderHeight: number;
  border: string;
  fill: string;
  active: { border: string; fill: string };
};

export const BarWithBorder = (options: Options) => {
  return (props: any) => {
    const { x, y, width, height, value, isActive } = props;

    const fill =
      options.fill === 'props'
        ? props.fill
        : isActive
          ? options.active.fill
          : options.fill;
    const border =
      options.border === 'props'
        ? props.stroke
        : isActive
          ? options.active.border
          : options.border;

    const withActive = (color: string) => {
      if (color.startsWith('rgba')) {
        return isActive ? color.replace(/, 0.\d+\)$/, ', 0.4)') : color;
      }
      return color;
    };

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          stroke="none"
          fill={withActive(fill)}
          rx={3}
        />
        {value > 0 && (
          <rect
            x={x}
            y={y - options.borderHeight - 1}
            width={width}
            height={options.borderHeight}
            stroke="none"
            fill={withActive(border)}
            rx={2}
          />
        )}
      </g>
    );
  };
};

export const BarShapeGrey = BarWithBorder({
  borderHeight: 2,
  border: 'rgba(100, 100, 100, 1)',
  fill: 'rgba(100, 100, 100, 0.3)',
  active: {
    border: 'rgba(100, 100, 100, 1)',
    fill: 'rgba(100, 100, 100, 0.4)',
  },
});
export const BarShapeBlue = BarWithBorder({
  borderHeight: 2,
  border: 'rgba(59, 121, 255, 1)',
  fill: 'rgba(59, 121, 255, 0.3)',
  active: {
    border: 'rgba(59, 121, 255, 1)',
    fill: 'rgba(59, 121, 255, 0.4)',
  },
});
export const BarShapeGreen = BarWithBorder({
  borderHeight: 2,
  border: 'rgba(59, 169, 116, 1)',
  fill: 'rgba(59, 169, 116, 0.3)',
  active: {
    border: 'rgba(59, 169, 116, 1)',
    fill: 'rgba(59, 169, 116, 0.4)',
  },
});
export const BarShapeProps = BarWithBorder({
  borderHeight: 2,
  border: 'props',
  fill: 'props',
  active: {
    border: 'props',
    fill: 'props',
  },
});

const BarShapes = [...new Array(13)].map((_, index) =>
  BarWithBorder({
    borderHeight: 2,
    border: getChartColor(index),
    fill: getChartTranslucentColor(index),
    active: {
      border: getChartColor(index),
      fill: getChartTranslucentColor(index),
    },
  }),
);
