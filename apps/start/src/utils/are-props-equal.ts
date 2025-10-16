import { pathOr } from 'ramda';
import { shallowEqual } from 'react-redux';

export function arePropsEqual(paths: string[]) {
  return (prevProps: any, nextProps: any) =>
    paths.every((path) =>
      shallowEqual(
        pathOr(undefined, path.split('.'), prevProps),
        pathOr(undefined, path.split('.'), nextProps),
      ),
    );
}
