import type { IServiceAiEvent } from '@openpanel/core';
import { isAiModelCall } from '@openpanel/core/modules/ai/ai.constants';
import { formatCost } from './ai-format';
import { Tooltiper } from '@/components/ui/tooltip';

const NO_PRICE_HINT =
  'No price for this model in the price catalog, so its cost is unknown.';

/** A successful call we could not price: its $0 means unknown, not free. */
export function isUnpricedCall(
  event: Pick<IServiceAiEvent, 'type' | 'isError' | 'costSource'>
): boolean {
  return (
    isAiModelCall(event.type) && !event.isError && event.costSource === 'none'
  );
}

export function AiCost({
  cost,
  unpricedCalls,
}: {
  cost: number;
  unpricedCalls: number;
}) {
  if (unpricedCalls === 0) {
    return <>{formatCost(cost)}</>;
  }
  const nothingPriced = cost === 0;
  const hint = nothingPriced
    ? NO_PRICE_HINT
    : `At least this much: ${unpricedCalls} ${unpricedCalls === 1 ? 'call has' : 'calls have'} no price in the price catalog.`;
  return (
    <Tooltiper asChild content={hint}>
      <span className="cursor-help text-muted-foreground underline decoration-dotted underline-offset-2">
        {nothingPriced ? '—' : `${formatCost(cost)}+`}
      </span>
    </Tooltiper>
  );
}
