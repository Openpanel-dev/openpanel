import {
  type MutableRefObject,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  IChartEventFilter,
  IChartRange,
  IInterval,
  IReportInput,
} from '@openpanel/validation';

/**
 * What the chat backend needs to know about "what the user is currently
 * looking at". Mirrors apps/api/src/chat/types.ts.
 *
 * Each target page calls `usePageContext({...})` in an effect; the
 * provider stores the latest value. The chat drawer reads it via a ref so
 * it always sends the *current* page's context with each request, even on
 * an old conversation.
 */
export type PageContextPage =
  | 'overview'
  | 'insights'
  | 'pages'
  | 'seo'
  | 'sessionDetail'
  | 'profileDetail'
  | 'reportEditor'
  | 'events'
  | 'groupDetail'
  | 'dashboard';

export type PageContext = {
  page: PageContextPage;
  route: { projectId: string; organizationId: string };
  ids?: {
    sessionId?: string;
    profileId?: string;
    reportId?: string;
    groupId?: string;
    dashboardId?: string;
  };
  filters?: {
    range?: IChartRange;
    startDate?: string;
    endDate?: string;
    interval?: IInterval;
    eventNames?: string[];
    eventFilters?: IChartEventFilter[];
    search?: string;
  };
  reportDraft?: IReportInput;
  primer?: Record<string, unknown>;
};

type PageContextValue = {
  context: PageContext | null;
  setContext: (ctx: PageContext | null) => void;
  ref: MutableRefObject<PageContext | null>;
};

const PageContextContext = createContext<PageContextValue | null>(null);

export function PageContextProvider({ children }: { children: ReactNode }) {
  const [context, setContextState] = useState<PageContext | null>(null);
  const ref = useRef<PageContext | null>(null);

  const setContext = useCallback((ctx: PageContext | null) => {
    ref.current = ctx;
    setContextState(ctx);
  }, []);

  const value = useMemo(
    () => ({ context, setContext, ref }),
    [context, setContext],
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

/** Read the current page context from React state (causes re-renders). */
export function usePageContextValue(): PageContext | null {
  return useInternalPageContext().context;
}

/**
 * Read the current page context via ref. Use inside `useChat`'s
 * `prepareSendMessagesRequest` so the chat always sends the *latest*
 * page's context without forcing a hook re-run on every keystroke.
 */
export function usePageContextRef(): MutableRefObject<PageContext | null> {
  return useInternalPageContext().ref;
}

/**
 * Register a page context. The current page calls this in an effect; the
 * provider keeps the latest value. Cleanup clears it when the page
 * unmounts so a stale context doesn't leak between routes.
 *
 * The context is JSON-serialized for the dependency list to avoid
 * referential-equality re-renders on identical-but-new objects.
 */
export function usePageContext(context: PageContext): void {
  const { setContext } = useInternalPageContext();
  const serialized = JSON.stringify(context);

  // biome-ignore lint/correctness/useExhaustiveDependencies: serialized is the stable dep
  useEffect(() => {
    setContext(context);
    return () => setContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);
}
