/**
 * Ported from @visx/pattern 4.0.0 (https://github.com/airbnb/visx).
 * MIT License — Copyright (c) 2017-2018 Harrison Shoff. See ./LICENSE-visx-pattern.
 */

import { Pattern } from './pattern';
import { cn } from '@/lib/utils';

export interface PatternPathProps {
  /** Unique id for the pattern. */
  id: string;
  /** Width of the pattern element. */
  width: number;
  /** Height of the pattern element. */
  height: number;
  /** d attribute of the path element */
  path?: string;
  /** fill color applied to path. */
  fill?: string;
  /** className applied to the path element. */
  className?: string;
  /** Background color applied behind path. */
  background?: string;
  /** Stroke color applied to path. */
  stroke?: string;
  /** strokeWidth applied to path. */
  strokeWidth?: number | string;
  /** strokeDasharray applied to path. */
  strokeDasharray?: string | number;
  /** strokeLinecap applied to path. */
  strokeLinecap?: 'square' | 'butt' | 'round' | 'inherit';
  /** shapeRendering applied to path. */
  shapeRendering?: string | number;
}

export function Path({
  id,
  width,
  height,
  path,
  fill = 'transparent',
  stroke,
  strokeWidth,
  strokeDasharray,
  strokeLinecap = 'square',
  shapeRendering = 'auto',
  background,
  className,
}: PatternPathProps) {
  return (
    <Pattern height={height} id={id} width={width}>
      {!!background && <rect fill={background} height={height} width={width} />}
      <path
        className={cn('visx-pattern-path', className)}
        d={path}
        fill={fill}
        shapeRendering={shapeRendering}
        stroke={stroke}
        strokeDasharray={strokeDasharray}
        strokeLinecap={strokeLinecap}
        strokeWidth={strokeWidth}
      />
    </Pattern>
  );
}
