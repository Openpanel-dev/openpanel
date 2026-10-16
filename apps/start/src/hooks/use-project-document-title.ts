import { useEffect, useRef } from 'react';

const BASE_SUFFIX = ' | OpenPanel.dev';

function inject(title: string, projectName: string): string {
  if (!title.endsWith(BASE_SUFFIX)) {
    return title;
  }
  if (title.includes(` | ${projectName}${BASE_SUFFIX}`)) {
    return title;
  }
  return title.replace(BASE_SUFFIX, ` | ${projectName}${BASE_SUFFIX}`);
}

// Route `head()` sets the title; rather than thread the project name through
// every route, patch <title> on the client via a MutationObserver.
export function useProjectDocumentTitle(projectName: string | undefined) {
  const lastApplied = useRef<string | null>(null);

  useEffect(() => {
    if (!projectName) {
      return;
    }

    const apply = () => {
      const current = document.title;
      if (current === lastApplied.current) {
        return;
      }
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
