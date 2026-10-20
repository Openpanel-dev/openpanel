import type { ChatLaunchHint } from '@openpanel/core/modules/assistant/assistant.constants';

export type { ChatLaunchHint } from '@openpanel/core/modules/assistant/assistant.constants';

import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * What the chat is told about the page it was launched from: the page, an
 * entity id, the visible date window. Pages register it; the launcher reads it.
 */
interface PageContextValue {
  context: ChatLaunchHint | null;
  setContext: (hint: ChatLaunchHint | null) => void;
  ref: MutableRefObject<ChatLaunchHint | null>;
}

const PageContextContext = createContext<PageContextValue | null>(null);

export function PageContextProvider({ children }: { children: ReactNode }) {
  const [context, setContextState] = useState<ChatLaunchHint | null>(null);
  const ref = useRef<ChatLaunchHint | null>(null);

  const setContext = useCallback((hint: ChatLaunchHint | null) => {
    ref.current = hint;
    setContextState(hint);
  }, []);

  const value = useMemo(
    () => ({ context, setContext, ref }),
    [context, setContext]
  );

  return (
    <PageContextContext.Provider value={value}>
      {children}
    </PageContextContext.Provider>
  );
}

function useInternalPageContext(): PageContextValue {
  const value = useContext(PageContextContext);
  if (!value) {
    throw new Error('usePageContext must be used inside <PageContextProvider>');
  }
  return value;
}

export function usePageContextValue(): ChatLaunchHint | null {
  return useInternalPageContext().context;
}

/** The latest hint without re-rendering on every change; read it at launch time. */
export function usePageContextRef(): MutableRefObject<ChatLaunchHint | null> {
  return useInternalPageContext().ref;
}

/** Register the current page's hint; cleared when the page unmounts. */
export function usePageContext(hint: ChatLaunchHint): void {
  const { setContext } = useInternalPageContext();
  const serialized = JSON.stringify(hint);

  useEffect(() => {
    setContext(JSON.parse(serialized) as ChatLaunchHint);
    return () => setContext(null);
  }, [serialized, setContext]);
}
