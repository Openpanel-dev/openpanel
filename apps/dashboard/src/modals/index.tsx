'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { Loader } from 'lucide-react';
import mitt from 'mitt';
import dynamic from 'next/dynamic';
import { useOnClickOutside } from 'usehooks-ts';

import type { ConfirmProps } from './Confirm';

const Loading = () => (
  <div className="bg-backdrop fixed left-0 top-0 z-50 flex h-screen w-screen items-center justify-center overflow-auto">
    <Loader className="mb-8 animate-spin" size={40} />
  </div>
);

const modals = {
  EditProject: dynamic(() => import('./EditProject'), {
    loading: Loading,
  }),
  EditClient: dynamic(() => import('./EditClient'), {
    loading: Loading,
  }),
  AddProject: dynamic(() => import('./AddProject'), {
    loading: Loading,
  }),
  AddClient: dynamic(() => import('./AddClient'), {
    loading: Loading,
  }),
  Confirm: dynamic(() => import('./Confirm'), {
    loading: Loading,
  }),
  SaveReport: dynamic(() => import('./SaveReport'), {
    loading: Loading,
  }),
  AddDashboard: dynamic(() => import('./AddDashboard'), {
    loading: Loading,
  }),
  EditDashboard: dynamic(() => import('./EditDashboard'), {
    loading: Loading,
  }),
  EditReport: dynamic(() => import('./EditReport'), {
    loading: Loading,
  }),
  ShareOverviewModal: dynamic(() => import('./ShareOverviewModal'), {
    loading: Loading,
  }),
  AddReference: dynamic(() => import('./AddReference'), {
    loading: Loading,
  }),
};

const emitter = mitt<{
  push: {
    name: ModalRoutes;
    props: Record<string, unknown>;
  };
  replace: {
    name: ModalRoutes;
    props: Record<string, unknown>;
  };
  pop: { name?: ModalRoutes };
  unshift: { name: ModalRoutes };
}>();

type ModalRoutes = keyof typeof modals;

interface StateItem {
  key: string;
  name: ModalRoutes;
  props: Record<string, unknown>;
}

interface ModalWrapperProps {
  children: React.ReactNode;
  name?: ModalRoutes;
  isOnTop?: boolean;
}

export function ModalWrapper({ children, name, isOnTop }: ModalWrapperProps) {
  const ref = useRef<HTMLDivElement>(null);

  useOnClickOutside(ref, (event) => {
    const target = event.target as HTMLElement;
    const isPortal =
      typeof target.closest === 'function'
        ? !!target.closest('[data-radix-popper-content-wrapper]')
        : false;

    if (isOnTop && !isPortal && name) {
      emitter.emit('pop', {
        name,
      });
    }
  });

  return (
    <div className="fixed top-0 z-50 flex h-screen w-screen items-center justify-center overflow-auto">
      <div ref={ref} className="w-inherit m-auto py-4">
        <Suspense>{children}</Suspense>
      </div>
    </div>
  );
}

export function ModalProvider() {
  const [state, setState] = useState<StateItem[]>([]);

  useEffect(() => {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.length > 0) {
        setState((p) => {
          p.pop();
          return [...p];
        });
      }
    });
  }, [state]);

  useEffect(() => {
    emitter.on('push', ({ name, props }) => {
      setState((p) => [
        ...p,
        {
          key: Math.random().toString(),
          name,
          props,
        },
      ]);
    });

    emitter.on('replace', ({ name, props }) => {
      setState([
        {
          key: Math.random().toString(),
          name,
          props,
        },
      ]);
    });

    emitter.on('pop', ({ name }) => {
      setState((items) => {
        const match =
          name === undefined
            ? // Pick last item if no name is provided
              items.length - 1
            : items.findLastIndex((item) => item.name === name);
        return items.filter((_, index) => index !== match);
      });
    });

    emitter.on('unshift', ({ name }) => {
      setState((items) => {
        const match = items.findIndex((item) => item.name === name);
        return items.filter((_, index) => index !== match);
      });
    });

    return () => emitter.all.clear();
  });
  return (
    <>
      {!!state.length && (
        <div className="fixed bottom-0 left-0 right-0 top-0 z-50 bg-[rgba(0,0,0,0.2)]"></div>
      )}
      {state.map((item, index) => {
        const Modal = modals[item.name];
        return (
          <ModalWrapper
            key={item.key}
            name={item.name}
            isOnTop={state.length - 1 === index}
          >
            {/* @ts-expect-error */}
            <Modal {...item.props} />
          </ModalWrapper>
        );
      })}
    </>
  );
}

type GetComponentProps<T> = T extends
  | React.ComponentType<infer P>
  | React.Component<infer P>
  ? P
  : never;
type OrUndefined<T> = T extends Record<string, never> ? undefined : T;

export const pushModal = <
  T extends StateItem['name'],
  B extends OrUndefined<GetComponentProps<(typeof modals)[T]>>,
>(
  name: T,
  ...rest: B extends undefined ? [] : [B]
) =>
  emitter.emit('push', {
    name,
    // @ts-expect-error
    props: Array.isArray(rest) && rest[0] ? rest[0] : {},
  });
export const replaceModal = <
  T extends StateItem['name'],
  B extends OrUndefined<GetComponentProps<(typeof modals)[T]>>,
>(
  name: T,
  ...rest: B extends undefined ? [] : [B]
) =>
  emitter.emit('replace', {
    name,
    // @ts-expect-error
    props: Array.isArray(rest) && rest[0] ? rest[0] : {},
  });
export const popModal = (name?: StateItem['name']) =>
  emitter.emit('pop', {
    name,
  });
export const unshiftModal = (name: StateItem['name']) =>
  emitter.emit('unshift', {
    name,
  });

export const showConfirm = (props: ConfirmProps) => pushModal('Confirm', props);
