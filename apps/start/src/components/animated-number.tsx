import type { NumberFlowProps } from '@number-flow/react';
import { useEffect, useState } from 'react';

// NumberFlow is breaking ssr and forces loaders to fetch twice
export function AnimatedNumber(props: NumberFlowProps) {
  const [Component, setComponent] =
    useState<React.ComponentType<NumberFlowProps> | null>(null);

  useEffect(() => {
    import('@number-flow/react').then(({ default: NumberFlow }) => {
      setComponent(NumberFlow);
    });
  }, []);

  if (!Component) {
    return <>{props.value}</>;
  }

  return <Component {...props} />;
}
