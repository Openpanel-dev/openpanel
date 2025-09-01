import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { useOpenPanel } from '@openpanel/nextjs';

import { popModal } from '.';
import { ModalContent } from './Modal/Container';

const validator = z.object({
  body: z.string().min(3),
});

type IForm = z.infer<typeof validator>;

export default function Testimonial() {
  const op = useOpenPanel();
  const trpc = useTRPC();
  const mutation = useMutation(trpc.ticket.create.mutationOptions());
  const params = useAppParams();
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
  });
  return (
    <ModalContent className="p-0">
      <div className="w-full rounded-t-lg border-b border-border bg-def-100 p-4">
        <h1 className="mb-2 text-2xl font-bold">Review time 🫶</h1>
        <p className="mb-2">
          Thank you so much for using Openpanel — it truly means a great deal to
          me! If you&apos;re enjoying your experience, I&apos;d be thrilled if
          you could leave a quick review. 😇
        </p>
        <p>
          If you have any feedback or suggestions, I&apos;d love to hear them as
          well! 🚀
        </p>
      </div>
      <form
        className="p-4"
        onSubmit={form.handleSubmit(async ({ body }) => {
          try {
            await mutation.mutateAsync({
              subject: 'New testimonial',
              body,
              meta: {
                ...params,
              },
            });
            toast.success('Thanks for your feedback 🚀');
            op.track('testimonials_sent');
            popModal();
          } catch (e) {
            toast.error('Something went wrong. Please try again later.');
          }
        })}
      >
        <Textarea
          placeholder="Type your review here."
          {...form.register('body')}
        />
        <div className="mt-4 flex justify-between gap-2">
          <Button type="button" variant="secondary" onClick={() => popModal()}>
            Maybe later
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Send it
          </Button>
        </div>
      </form>
    </ModalContent>
  );
}
