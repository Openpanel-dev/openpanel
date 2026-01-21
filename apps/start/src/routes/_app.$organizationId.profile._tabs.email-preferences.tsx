import { WithLabel } from '@/components/forms/input-with-label';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { handleError } from '@/integrations/trpc/react';
import { emailCategories } from '@openpanel/constants';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { SaveIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const validator = z.object({
  categories: z.record(z.string(), z.boolean()),
});

type IForm = z.infer<typeof validator>;

export const Route = createFileRoute(
  '/_app/$organizationId/profile/_tabs/email-preferences',
)({
  component: Component,
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const preferencesQuery = useSuspenseQuery(
    trpc.email.getPreferences.queryOptions(),
  );

  const { control, handleSubmit, formState, reset } = useForm<IForm>({
    defaultValues: {
      categories: preferencesQuery.data,
    },
  });

  const mutation = useMutation(
    trpc.email.updatePreferences.mutationOptions({
      onSuccess: async () => {
        toast('Email preferences updated', {
          description: 'Your email preferences have been saved.',
        });
        await queryClient.invalidateQueries(
          trpc.email.getPreferences.pathFilter(),
        );
        // Reset form with fresh data after refetch
        const freshData = await queryClient.fetchQuery(
          trpc.email.getPreferences.queryOptions(),
        );
        reset({
          categories: freshData,
        });
      },
      onError: handleError,
    }),
  );

  return (
    <form
      onSubmit={handleSubmit((values) => {
        mutation.mutate(values);
      })}
    >
      <Widget className="max-w-screen-md w-full">
        <WidgetHead>
          <span className="title">Email Preferences</span>
        </WidgetHead>
        <WidgetBody className="gap-4 col">
          <p className="text-sm text-muted-foreground mb-4">
            Choose which types of emails you want to receive. Uncheck a category
            to stop receiving those emails.
          </p>

          <div className="space-y-4">
            {Object.entries(emailCategories).map(([category, label]) => (
              <Controller
                key={category}
                name={`categories.${category}`}
                control={control}
                render={({ field }) => (
                  <div className="flex items-center justify-between gap-4 px-4 py-4 rounded-md border border-border hover:bg-def-200 transition-colors">
                    <div className="flex-1">
                      <div className="font-medium">{label}</div>
                      <div className="text-sm text-muted-foreground">
                        {category === 'onboarding' &&
                          'Get started tips and guidance emails'}
                        {category === 'billing' &&
                          'Subscription updates and payment reminders'}
                      </div>
                    </div>
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                      disabled={mutation.isPending}
                    />
                  </div>
                )}
              />
            ))}
          </div>

          <Button
            size="sm"
            type="submit"
            disabled={!formState.isDirty || mutation.isPending}
            className="self-end mt-4"
            icon={SaveIcon}
            loading={mutation.isPending}
          >
            Save
          </Button>
        </WidgetBody>
      </Widget>
    </form>
  );
}
