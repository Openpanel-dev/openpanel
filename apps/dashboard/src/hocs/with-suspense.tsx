import { Suspense } from 'react';

const withSuspense = <P,>(
  Component: React.ComponentType<P>,
  Fallback: React.ComponentType<P>,
) => {
  const WithSuspense: React.ComponentType<P> = (props) => {
    const fallback = <Fallback {...(props as any)} />;
    // return <>{fallback}</>;
    return (
      <Suspense fallback={fallback}>
        <Component {...(props as any)} />
      </Suspense>
    );
  };

  WithSuspense.displayName = `WithSuspense(${Component.displayName})`;

  return WithSuspense;
};

export default withSuspense;
