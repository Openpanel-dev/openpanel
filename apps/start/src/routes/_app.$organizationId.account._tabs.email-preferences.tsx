import { zodResolver } from '@hookform/resolvers/zod';
import { emailCategories } from '@openpanel/constants';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { SaveIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';

const validator = z.object({
  categories: z.record(z.string(), z.boolean()),
});

type IForm = z.infer<typeof validator>;

function buildCategoryDefaults(
  savedPreferences?: Record<string, boolean>
): Record<string, boolean> {
  return Object.keys(emailCategories).reduce(
    (acc, category) => {
      acc[category] = savedPreferences?.[category] ?? true;
      return acc;
    },
    {} as Record<string, boolean>
  );
}

export const Route = createFileRoute(
  '/_app/$organizationId/account/_tabs/email-preferences'
)({
  component: Component,
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const preferencesQuery = useSuspenseQuery(
    trpc.email.getPreferences.queryOptions()
  );

  const { control, handleSubmit, formState, reset } = useForm<IForm>({
    defaultValues: {
      categories: buildCategoryDefaults(preferencesQuery.data),
    },
    resolver: zodResolver(validator),
  });

  const mutation = useMutation(
    trpc.email.updatePreferences.mutationOptions({
      onSuccess: async () => {
        toast(t('account.toast_email_preferences_updated'), {
          description: t(
            'account.toast_email_preferences_updated_description'
          ),
        });
        await queryClient.invalidateQueries(
          trpc.email.getPreferences.pathFilter()
        );
        const freshData = await queryClient.fetchQuery(
          trpc.email.getPreferences.queryOptions()
        );
        reset({
          categories: buildCategoryDefaults(freshData),
        });
      },
      onError: handleError,
    })
  );

  return (
    <form
      onSubmit={handleSubmit((values) => {
        mutation.mutate(values);
      })}
    >
      <Widget className="w-full max-w-screen-md">
        <WidgetHead>
          <span className="title">{t('account.email_preferences_title')}</span>
        </WidgetHead>
        <WidgetBody className="col gap-4">
          <p className="mb-4 text-muted-foreground text-sm">
            {t('account.email_preferences_description')}
          </p>

          <div className="space-y-4">
            {Object.entries(emailCategories).map(
              ([category, { label, description }]) => (
                <Controller
                  control={control}
                  key={category}
                  name={`categories.${category}`}
                  render={({ field }) => (
                    <div className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-4 transition-colors hover:bg-def-200">
                      <div className="flex-1">
                        <div className="font-medium">
                          {t(`account.email_category_${category}`, {
                            defaultValue: label,
                          })}
                        </div>
                        <div className="text-muted-foreground text-sm">
                          {t(`account.email_category_${category}_description`, {
                            defaultValue: description,
                          })}
                        </div>
                      </div>
                      <Switch
                        checked={field.value}
                        disabled={mutation.isPending}
                        onCheckedChange={field.onChange}
                      />
                    </div>
                  )}
                />
              ),
            )}
          </div>

          <Button
            className="mt-4 self-end"
            disabled={!formState.isDirty || mutation.isPending}
            icon={SaveIcon}
            loading={mutation.isPending}
            size="sm"
            type="submit"
          >
            {t('common.save')}
          </Button>
        </WidgetBody>
      </Widget>
    </form>
  );
}
