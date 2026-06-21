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
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/widgets',
)({
  component: Component,
});

function Component() {
  const { t } = useTranslation();
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
        toast.success(
          variables.enabled
            ? t('settings.widgets_enabled_toast')
            : t('settings.widgets_disabled_toast'),
        );
      },
      onError: (error) => {
        toast.error(error.message || t('settings.widgets_update_failed_toast'));
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
        toast.success(t('settings.widgets_options_updated_toast'));
      },
      onError: (error) => {
        toast.error(
          error.message || t('settings.widgets_options_update_failed_toast'),
        );
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

      <CounterWidgetSection
        widget={counterWidget as any}
        dashboardUrl={dashboardUrl}
        isToggling={toggleMutation.isPending}
        onToggle={(enabled) => handleToggle('counter', enabled)}
      />

      <BadgeWidgetSection
        widget={counterWidget as any}
        dashboardUrl={dashboardUrl}
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
  const { t } = useTranslation();
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
    <Widget className="max-w-screen-md w-full">
      <WidgetHead className="row items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="title">{t('settings.widgets_realtime_title')}</span>
          <p className="text-muted-foreground">
            {t('settings.widgets_realtime_description')}
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
            <h3 className="text-sm font-medium">
              {t('settings.widgets_options_title')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="referrers" className="text-sm">
                  {t('settings.widgets_show_referrers')}
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
                  {t('settings.widgets_show_countries')}
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
                  {t('settings.widgets_show_paths')}
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
            <h3 className="text-sm font-medium">
              {t('settings.widgets_url_title')}
            </h3>
            <CopyInput label="" value={widgetUrl!} className="w-full" />
            <p className="text-xs text-muted-foreground">
              {t('settings.widgets_realtime_url_description')}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              {t('settings.widgets_embed_code_title')}
            </h3>
            <Syntax code={embedCode!} language="bash" />
            <p className="text-xs text-muted-foreground">
              {t('settings.widgets_embed_code_description')}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              {t('settings.widgets_preview_title')}
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <iframe
                key={widgetChecksum}
                src={`${widgetUrl}&checksum=${widgetChecksum}`}
                width="100%"
                height="600"
                className="border-0"
                title={t('settings.widgets_realtime_preview_title')}
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
                {t('settings.widgets_open_new_tab')}
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
  const { t } = useTranslation();
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
          <span className="title">{t('settings.widgets_counter_title')}</span>
          <p className="text-muted-foreground">
            {t('settings.widgets_counter_description')}
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
            <h3 className="text-sm font-medium">
              {t('settings.widgets_url_title')}
            </h3>
            <CopyInput label="" value={counterUrl} className="w-full" />
            <p className="text-xs text-muted-foreground">
              {t('settings.widgets_counter_url_description')}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              {t('settings.widgets_embed_code_title')}
            </h3>
            <Syntax code={counterEmbedCode!} language="bash" />
            <p className="text-xs text-muted-foreground">
              {t('settings.widgets_embed_code_description')}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              {t('settings.widgets_preview_title')}
            </h3>
            <div className="border rounded-lg p-4 bg-muted/30">
              <iframe
                src={counterUrl}
                height="32"
                className="border-0"
                title={t('settings.widgets_counter_preview_title')}
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
                {t('settings.widgets_open_new_tab')}
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
  const { t } = useTranslation();
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

  if (!isEnabled || !badgeUrl) {
    return null;
  }

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead className="row items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="title">{t('settings.widgets_badge_title')}</span>
          <p className="text-muted-foreground">
            {t('settings.widgets_badge_description')}
          </p>
        </div>
      </WidgetHead>
      <WidgetBody className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            {t('settings.widgets_url_title')}
          </h3>
          <CopyInput label="" value={badgeUrl} className="w-full" />
          <p className="text-xs text-muted-foreground">
            {t('settings.widgets_badge_url_description')}
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            {t('settings.widgets_embed_code_title')}
          </h3>
          <Syntax code={badgeEmbedCode!} language="bash" />
          <p className="text-xs text-muted-foreground">
            {t('settings.widgets_embed_code_description')}
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            {t('settings.widgets_preview_title')}
          </h3>
          <div className="border rounded-lg p-4 bg-muted/30">
            <a
              href="https://openpanel.dev"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                overflow: 'hidden',
                borderRadius: '8px',
                display: 'inline-block',
              }}
            >
              <iframe
                src={badgeUrl}
                height="48"
                width="250"
                className="border-0 pointer-events-none"
                title={t('settings.widgets_badge_preview_title')}
              />
            </a>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={ExternalLinkIcon}
              onClick={() =>
                window.open(badgeUrl, '_blank', 'noopener,noreferrer')
              }
            >
              {t('settings.widgets_open_new_tab')}
            </Button>
          </div>
        </div>
      </WidgetBody>
    </Widget>
  );
}
