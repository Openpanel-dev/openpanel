import { useTRPC } from '@/integrations/trpc/react';
import type { AppRouter } from '@openpanel/trpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

export const api = useTRPC();

export { handleError } from '@/integrations/trpc/react';

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

export type IChartData = RouterOutputs['chart']['chart'];
