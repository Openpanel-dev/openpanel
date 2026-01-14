import CopyInput from '@/components/forms/copy-input';
import FullPageLoadingState from '@/components/full-page-loading-state';
import Syntax from '@/components/syntax';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useAppContext } from '@/hooks/use-app-context';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import type {
  IRealtimeWidgetOptions,
  IWidgetType,
} from '@openpanel/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ExternalLinkIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/widgets',
)({
  component: Component,
});

function Component() {
  const { projectId, organizationId } = useAppParams();
  const { dashboardUrl } = useAppContext();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Fetch both widget types
  const realtimeWidgetQuery = useQuery(
    trpc.widget.get.queryOptions({ projectId, type: 'realtime' }),
  );
  const counterWidgetQuery = useQuery(
    trpc.widget.get.queryOptions({ projectId, type: 'counter' }),
  );

  // Toggle mutation
  const toggleMutation = useMutation(
    trpc.widget.toggle.mutationOptions({
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries(
          trpc.widget.get.queryFilter({ projectId, type: variables.type }),
        );
        toast.success(variables.enabled ? 'Widget enabled' : 'Widget disabled');
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to update widget');
      },
    }),
  );

  // Update options mutation
  const updateOptionsMutation = useMutation(
    trpc.widget.updateOptions.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.widget.get.queryFilter({ projectId, type: 'realtime' }),
        );
        toast.success('Widget options updated');
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to update options');
      },
    }),
  );

  const handleToggle = (type: IWidgetType, enabled: boolean) => {
    toggleMutation.mutate({
      projectId,
      organizationId,
      type,
      enabled,
    });
  };

  if (realtimeWidgetQuery.isLoading || counterWidgetQuery.isLoading) {
    return <FullPageLoadingState />;
  }

  const realtimeWidget = realtimeWidgetQuery.data;
  const counterWidget = counterWidgetQuery.data;

  return (
    <div className="space-y-6">
      {realtimeWidget && (
        <RealtimeWidgetSection
          widget={realtimeWidget as any}
          dashboardUrl={dashboardUrl}
          isToggling={toggleMutation.isPending}
          isUpdatingOptions={updateOptionsMutation.isPending}
          onToggle={(enabled) => handleToggle('realtime', enabled)}
          onUpdateOptions={(options) =>
            updateOptionsMutation.mutate({
              projectId,
              organizationId,
              options,
            })
          }
        />
      )}

      {counterWidget && (
        <CounterWidgetSection
          widget={counterWidget}
          dashboardUrl={dashboardUrl}
          isToggling={toggleMutation.isPending}
          onToggle={(enabled) => handleToggle('counter', enabled)}
        />
      )}
    </div>
  );
}

interface RealtimeWidgetSectionProps {
  widget: {
    id: string;
    public: boolean;
    options: IRealtimeWidgetOptions;
  } | null;
  dashboardUrl: string;
  isToggling: boolean;
  isUpdatingOptions: boolean;
  onToggle: (enabled: boolean) => void;
  onUpdateOptions: (options: IRealtimeWidgetOptions) => void;
}

function RealtimeWidgetSection({
  widget,
  dashboardUrl,
  isToggling,
  isUpdatingOptions,
  onToggle,
  onUpdateOptions,
}: RealtimeWidgetSectionProps) {
  const isEnabled = widget?.public ?? false;
  const widgetUrl =
    isEnabled && widget?.id
      ? `${dashboardUrl}/widget/realtime?shareId=${widget.id}`
      : null;
  const embedCode = widgetUrl
    ? `<iframe src="${widgetUrl}" width="100%" height="400" frameborder="0" style="border-radius: 8px;"></iframe>`
    : null;

  // Default options
  const defaultOptions: IRealtimeWidgetOptions = {
    type: 'realtime',
    referrers: true,
    countries: true,
    paths: false,
  };

  const [options, setOptions] = useState<IRealtimeWidgetOptions>(
    (widget?.options as IRealtimeWidgetOptions) || defaultOptions,
  );

  // Update local options when widget data changes
  useEffect(() => {
    if (widget?.options) {
      setOptions(widget.options as IRealtimeWidgetOptions);
    }
  }, [widget?.options]);

  const handleUpdateOptions = (newOptions: IRealtimeWidgetOptions) => {
    setOptions(newOptions);
    onUpdateOptions(newOptions);
  };

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead className="row items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="title">Realtime Widget</span>
          <p className="text-muted-foreground">
            Embed a realtime visitor counter widget on your website. The widget
            shows live visitor count, activity histogram, top countries,
            referrers and paths.
          </p>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={onToggle}
          disabled={isToggling}
        />
      </WidgetHead>
      {isEnabled && (
        <WidgetBody className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Widget Options</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="referrers" className="text-sm">
                  Show Referrers
                </Label>
                <Switch
                  id="referrers"
                  checked={options.referrers}
                  onCheckedChange={(checked) =>
                    handleUpdateOptions({ ...options, referrers: checked })
                  }
                  disabled={isUpdatingOptions}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="countries" className="text-sm">
                  Show Countries
                </Label>
                <Switch
                  id="countries"
                  checked={options.countries}
                  onCheckedChange={(checked) =>
                    handleUpdateOptions({ ...options, countries: checked })
                  }
                  disabled={isUpdatingOptions}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="paths" className="text-sm">
                  Show Paths
                </Label>
                <Switch
                  id="paths"
                  checked={options.paths}
                  onCheckedChange={(checked) =>
                    handleUpdateOptions({ ...options, paths: checked })
                  }
                  disabled={isUpdatingOptions}
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Widget URL</h3>
            <CopyInput label="" value={widgetUrl!} className="w-full" />
            <p className="text-xs text-muted-foreground">
              Direct link to the widget. You can open this in a new tab or embed
              it.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Embed Code</h3>
            <Syntax code={embedCode!} language="bash" />
            <p className="text-xs text-muted-foreground">
              Copy this code and paste it into your website HTML where you want
              the widget to appear.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Preview</h3>
            <div className="border rounded-lg overflow-hidden">
              <iframe
                src={widgetUrl!}
                width="100%"
                height="600"
                className="border-0"
                title="Realtime Widget Preview"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={ExternalLinkIcon}
                onClick={() =>
                  window.open(widgetUrl!, '_blank', 'noopener,noreferrer')
                }
              >
                Open in new tab
              </Button>
            </div>
          </div>
        </WidgetBody>
      )}
    </Widget>
  );
}

interface CounterWidgetSectionProps {
  widget: {
    id: string;
    public: boolean;
  } | null;
  dashboardUrl: string;
  isToggling: boolean;
  onToggle: (enabled: boolean) => void;
}

function CounterWidgetSection({
  widget,
  dashboardUrl,
  isToggling,
  onToggle,
}: CounterWidgetSectionProps) {
  const isEnabled = widget?.public ?? false;
  const counterUrl =
    isEnabled && widget?.id
      ? `${dashboardUrl}/widget/counter?shareId=${widget.id}`
      : null;
  const counterEmbedCode = counterUrl
    ? `<iframe src="${counterUrl}" height="32" style="border: none; overflow: hidden;" title="Visitor Counter"></iframe>`
    : null;

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead className="row items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="title">Counter Widget</span>
          <p className="text-muted-foreground">
            A compact live visitor counter badge you can embed anywhere. Shows
            the current number of unique visitors with a live indicator.
          </p>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={onToggle}
          disabled={isToggling}
        />
      </WidgetHead>
      {isEnabled && counterUrl && (
        <WidgetBody className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Widget URL</h3>
            <CopyInput label="" value={counterUrl} className="w-full" />
            <p className="text-xs text-muted-foreground">
              Direct link to the counter widget.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Embed Code</h3>
            <Syntax code={counterEmbedCode!} language="bash" />
            <p className="text-xs text-muted-foreground">
              Copy this code and paste it into your website HTML where you want
              the counter to appear.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Preview</h3>
            <div className="border rounded-lg p-4 bg-muted/30">
              <iframe
                src={counterUrl}
                height="32"
                className="border-0"
                title="Counter Widget Preview"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={ExternalLinkIcon}
                onClick={() =>
                  window.open(counterUrl, '_blank', 'noopener,noreferrer')
                }
              >
                Open in new tab
              </Button>
            </div>
          </div>
        </WidgetBody>
      )}
    </Widget>
  );
}
