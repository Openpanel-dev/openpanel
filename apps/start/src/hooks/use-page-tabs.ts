import { useLocation } from '@tanstack/react-router';

export function usePageTabs(tabs: { id: string; label: string }[]) {
  const location = useLocation();
  const tab = location.pathname.split('/').pop();

  if (!tab) {
    return {
      activeTab: tabs[0].id,
      tabs,
    };
  }

  const match = tabs.find((t) => t.id === tab);

  if (!match) {
    return {
      activeTab: tabs[0].id,
      tabs,
    };
  }

  return {
    activeTab: match.id,
    tabs,
  };
}
