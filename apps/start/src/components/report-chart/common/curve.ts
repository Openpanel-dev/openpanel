import type { lineTypes } from '@openpanel/core/modules/report/report.constants';
import {
  type CurveFactory,
  curveBasis,
  curveBasisClosed,
  curveBasisOpen,
  curveBumpX,
  curveBumpY,
  curveLinear,
  curveLinearClosed,
  curveMonotoneX,
  curveMonotoneY,
  curveNatural,
  curveStep,
  curveStepAfter,
  curveStepBefore,
} from 'd3-shape';

// Recharts' names, which saved reports store: `monotone` and `bump` are the X variants.
const CURVES = {
  monotone: curveMonotoneX,
  monotoneX: curveMonotoneX,
  monotoneY: curveMonotoneY,
  linear: curveLinear,
  natural: curveNatural,
  basis: curveBasis,
  step: curveStep,
  stepBefore: curveStepBefore,
  stepAfter: curveStepAfter,
  basisClosed: curveBasisClosed,
  basisOpen: curveBasisOpen,
  bumpX: curveBumpX,
  bumpY: curveBumpY,
  bump: curveBumpX,
  linearClosed: curveLinearClosed,
} satisfies Record<keyof typeof lineTypes, CurveFactory>;

export function getCurve(lineType: keyof typeof lineTypes | undefined) {
  return CURVES[lineType ?? 'monotone'];
}
