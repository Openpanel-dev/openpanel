import { useEffect, useRef } from 'react';

const BASE_SUFFIX = ' | OpenPanel.dev';

function inject(title: string, projectName: string): string {
  if (!title.endsWith(BASE_SUFFIX)) return title;
  if (title.includes(` | ${projectName}${BASE_SUFFIX}`)) return title;
  return title.replace(BASE_SUFFIX, ` | ${projectName}${BASE_SUFFIX}`);
}

// Browser tab titles are set by each route's `head()` (server + client).
// Rather than threading project name through every route's loader/head,
// we patch the title imperatively on the client whenever it changes —
// observed via a MutationObserver on <title>. This keeps the change
// localized to one hook mounted under the project layout.
export function useProjectDocumentTitle(projectName: string | undefined) {
  const lastApplied = useRef<string | null>(null);

  useEffect(() => {
    if (!projectName) return;

    const apply = () => {
      const current = document.title;
      if (current === lastApplied.current) return;
      const next = inject(current, projectName);
      if (next !== current) {
        document.title = next;
      }
      lastApplied.current = document.title;
    };

    apply();

    // Observe the whole <head> rather than the <title> element directly,
    // so we still catch updates if React swaps the title node entirely.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [projectName]);
}
