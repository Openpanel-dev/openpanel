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

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          stroke="none"
          fill={isActive ? options.active.fill : options.fill}
        />
        {value > 0 && (
          <rect
            x={x}
            y={y - options.borderHeight - 2}
            width={width}
            height={options.borderHeight}
            stroke="none"
            fill={isActive ? options.active.border : options.border}
          />
        )}
      </g>
    );
  };
};

export const BarShapeBlue = BarWithBorder({
  borderHeight: 2,
  border: 'rgba(59, 121, 255, 1)',
  fill: 'rgba(59, 121, 255, 0.3)',
  active: {
    border: 'rgba(59, 121, 255, 1)',
    fill: 'rgba(59, 121, 255, 0.4)',
  },
});
