import type { Toast } from '@/components/ui/use-toast';
import { toast } from '@/components/ui/use-toast';
import type { AppRouter } from '@/server/api/root';
import type { TRPCClientErrorBase } from '@trpc/react-query';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

export const api = createTRPCReact<AppRouter>({});

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type IChartData = RouterOutputs['chart']['chart'];
export type IChartSerieDataItem = IChartData['series'][number]['data'][number];

export function handleError(error: TRPCClientErrorBase<any>) {
  toast({
    title: 'Error',
    description: error.message,
  });
}

export function handleErrorToastOptions(options: Toast) {
  return function (error: TRPCClientErrorBase<any>) {
    toast({
      title: 'Error',
      description: error.message,
      ...options,
    });
  };
}
