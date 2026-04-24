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
        toast('Email preferences updated', {
          description: 'Your email preferences have been saved.',
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
          <span className="title">Email Preferences</span>
        </WidgetHead>
        <WidgetBody className="col gap-4">
          <p className="mb-4 text-muted-foreground text-sm">
            Choose which types of emails you want to receive. Uncheck a category
            to stop receiving those emails.
          </p>

          <div className="space-y-4">
            {Object.entries(emailCategories).map(([category, label]) => (
              <Controller
                control={control}
                key={category}
                name={`categories.${category}`}
                render={({ field }) => (
                  <div className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-4 transition-colors hover:bg-def-200">
                    <div className="flex-1">
                      <div className="font-medium">{label}</div>
                      <div className="text-muted-foreground text-sm">
                        {category === 'onboarding' &&
                          'Get started tips and guidance emails'}
                        {category === 'billing' &&
                          'Subscription updates and payment reminders'}
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
            ))}
          </div>

          <Button
            className="mt-4 self-end"
            disabled={!formState.isDirty || mutation.isPending}
            icon={SaveIcon}
            loading={mutation.isPending}
            size="sm"
            type="submit"
          >
            Save
          </Button>
        </WidgetBody>
      </Widget>
    </form>
  );
}
