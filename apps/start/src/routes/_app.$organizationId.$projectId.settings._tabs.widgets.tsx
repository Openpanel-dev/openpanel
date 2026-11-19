import type {
  IRealtimeWidgetOptions,
  IWidgetType,
} from '@openpanel/core/modules/report/report.constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ExternalLinkIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/widgets'
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
    trpc.widget.get.queryOptions({ projectId, type: 'realtime' })
  );
  const counterWidgetQuery = useQuery(
    trpc.widget.get.queryOptions({ projectId, type: 'counter' })
  );

  // Toggle mutation
  const toggleMutation = useMutation(
    trpc.widget.toggle.mutationOptions({
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries(
          trpc.widget.get.queryFilter({ projectId, type: variables.type })
        );
        toast.success(variables.enabled ? 'Widget enabled' : 'Widget disabled');
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to update widget');
      },
    })
  );

  // Update options mutation
  const updateOptionsMutation = useMutation(
    trpc.widget.updateOptions.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.widget.get.queryFilter({ projectId, type: 'realtime' })
        );
        toast.success('Widget options updated');
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to update options');
      },
    })
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
      <RealtimeWidgetSection
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
        widget={realtimeWidget as any}
      />

      <CounterWidgetSection
        dashboardUrl={dashboardUrl}
        isToggling={toggleMutation.isPending}
        onToggle={(enabled) => handleToggle('counter', enabled)}
        widget={counterWidget as any}
      />

      <BadgeWidgetSection
        dashboardUrl={dashboardUrl}
        widget={counterWidget as any}
      />
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
    (widget?.options as IRealtimeWidgetOptions) || defaultOptions
  );

  // Create a checksum based on URL and current options to force iframe reload
  const widgetChecksum = widgetUrl
    ? btoa(JSON.stringify(Object.values(options)))
    : null;

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
    <Widget className="w-full max-w-screen-md">
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
          disabled={isToggling}
          onCheckedChange={onToggle}
        />
      </WidgetHead>
      {isEnabled && (
        <WidgetBody className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-medium text-sm">Widget Options</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm" htmlFor="referrers">
                  Show Referrers
                </Label>
                <Switch
                  checked={options.referrers}
                  disabled={isUpdatingOptions}
                  id="referrers"
                  onCheckedChange={(checked) =>
                    handleUpdateOptions({ ...options, referrers: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm" htmlFor="countries">
                  Show Countries
                </Label>
                <Switch
                  checked={options.countries}
                  disabled={isUpdatingOptions}
                  id="countries"
                  onCheckedChange={(checked) =>
                    handleUpdateOptions({ ...options, countries: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm" htmlFor="paths">
                  Show Paths
                </Label>
                <Switch
                  checked={options.paths}
                  disabled={isUpdatingOptions}
                  id="paths"
                  onCheckedChange={(checked) =>
                    handleUpdateOptions({ ...options, paths: checked })
                  }
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Widget URL</h3>
            <CopyInput className="w-full" label="" value={widgetUrl!} />
            <p className="text-muted-foreground text-xs">
              Direct link to the widget. You can open this in a new tab or embed
              it.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-sm">Embed Code</h3>
            <Syntax code={embedCode!} language="bash" />
            <p className="text-muted-foreground text-xs">
              Copy this code and paste it into your website HTML where you want
              the widget to appear.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-sm">Preview</h3>
            <div className="overflow-hidden rounded-lg border">
              <iframe
                className="border-0"
                height="600"
                key={widgetChecksum}
                src={`${widgetUrl}&checksum=${widgetChecksum}`}
                title="Realtime Widget Preview"
                width="100%"
              />
            </div>
            <div className="flex gap-2">
              <Button
                icon={ExternalLinkIcon}
                onClick={() =>
                  window.open(widgetUrl!, '_blank', 'noopener,noreferrer')
                }
                size="sm"
                variant="outline"
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
    <Widget className="w-full max-w-screen-md">
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
          disabled={isToggling}
          onCheckedChange={onToggle}
        />
      </WidgetHead>
      {isEnabled && counterUrl && (
        <WidgetBody className="space-y-6">
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Widget URL</h3>
            <CopyInput className="w-full" label="" value={counterUrl} />
            <p className="text-muted-foreground text-xs">
              Direct link to the counter widget.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-sm">Embed Code</h3>
            <Syntax code={counterEmbedCode!} language="bash" />
            <p className="text-muted-foreground text-xs">
              Copy this code and paste it into your website HTML where you want
              the counter to appear.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-sm">Preview</h3>
            <div className="rounded-lg border bg-muted/30 p-4">
              <iframe
                className="border-0"
                height="32"
                src={counterUrl}
                title="Counter Widget Preview"
              />
            </div>
            <div className="flex gap-2">
              <Button
                icon={ExternalLinkIcon}
                onClick={() =>
                  window.open(counterUrl, '_blank', 'noopener,noreferrer')
                }
                size="sm"
                variant="outline"
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

interface BadgeWidgetSectionProps {
  widget: {
    id: string;
    public: boolean;
  } | null;
  dashboardUrl: string;
}

function BadgeWidgetSection({ widget, dashboardUrl }: BadgeWidgetSectionProps) {
  const isEnabled = widget?.public ?? false;
  const badgeUrl =
    isEnabled && widget?.id
      ? `${dashboardUrl}/widget/badge?shareId=${widget.id}`
      : null;
  const badgeEmbedCode = badgeUrl
    ? `<a href="https://openpanel.dev" style="display: inline-block; overflow: hidden; border-radius: 8px;">
  <iframe src="${badgeUrl}" height="48" width="250" style="border: none; overflow: hidden; pointer-events: none;" title="OpenPanel Analytics Badge"></iframe>
</a>`
    : null;

  if (!(isEnabled && badgeUrl)) {
    return null;
  }

  return (
    <Widget className="w-full max-w-screen-md">
      <WidgetHead className="row items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="title">Analytics Badge</span>
          <p className="text-muted-foreground">
            A Product Hunt-style badge showing your 30-day unique visitor count.
            Perfect for showcasing your analytics powered by OpenPanel.
          </p>
        </div>
      </WidgetHead>
      <WidgetBody className="space-y-6">
        <div className="space-y-2">
          <h3 className="font-medium text-sm">Widget URL</h3>
          <CopyInput className="w-full" label="" value={badgeUrl} />
          <p className="text-muted-foreground text-xs">
            Direct link to the analytics badge widget.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-sm">Embed Code</h3>
          <Syntax code={badgeEmbedCode!} language="bash" />
          <p className="text-muted-foreground text-xs">
            Copy this code and paste it into your website HTML where you want
            the badge to appear.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-sm">Preview</h3>
          <div className="rounded-lg border bg-muted/30 p-4">
            <a
              href="https://openpanel.dev"
              rel="noopener noreferrer"
              style={{
                overflow: 'hidden',
                borderRadius: '8px',
                display: 'inline-block',
              }}
              target="_blank"
            >
              <iframe
                className="pointer-events-none border-0"
                height="48"
                src={badgeUrl}
                title="Analytics Badge Preview"
                width="250"
              />
            </a>
          </div>
          <div className="flex gap-2">
            <Button
              icon={ExternalLinkIcon}
              onClick={() =>
                window.open(badgeUrl, '_blank', 'noopener,noreferrer')
              }
              size="sm"
              variant="outline"
            >
              Open in new tab
            </Button>
          </div>
        </div>
      </WidgetBody>
    </Widget>
  );
}
