import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { AiFilters } from '@/components/ai/ai-filters';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

/** The filter state `useAiFilters` keeps in the URL, declared so links can set it. */
const zAiSearch = z.object({
  models: z.array(z.string()).optional(),
  providers: z.array(z.string()).optional(),
  names: z.array(z.string()).optional(),
  errors: z.boolean().optional(),
  q: z.string().optional(),
  profile: z.string().optional(),
  group: z.string().optional(),
  conversation: z.string().optional(),
  session: z.string().optional(),
});

export const Route = createFileRoute('/_app/$organizationId/$projectId/ai/_tabs')({
  component: Component,
  validateSearch: zAiSearch,
  head: () => ({
    meta: [{ title: createProjectTitle(PAGE_TITLES.AI) }],
  }),
});

function Component() {
  const router = useRouter();
  const { projectId } = Route.useParams();
  const { activeTab, tabs } = usePageTabs([
    { id: 'ai', label: 'Overview' },
    { id: 'traces', label: 'Traces' },
    { id: 'generations', label: 'Generations' },
  ]);

  const handleTabChange = (tabId: string) => {
    router.navigate({
      from: Route.fullPath,
      to: tabId === 'ai' ? '.' : tabId,
      search: (previous) => previous,
    });
  };

  return (
    <div className="container p-8">
      <PageHeader
        description="Every model call your product makes: cost, tokens, latency and errors, tied to the profiles and sessions behind them"
        title="AI"
      />
      <div className="col mt-4 gap-3">
        <div className="row flex-wrap items-center gap-2">
          <OverviewRange />
          <OverviewInterval />
        </div>
        <AiFilters projectId={projectId} />
      </div>
      <Tabs className="mt-4 mb-6" onValueChange={handleTabChange} value={activeTab}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
