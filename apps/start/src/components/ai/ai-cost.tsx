import type { IServiceAiEvent } from '@openpanel/core';
import { isAiModelCall } from '@openpanel/core/modules/ai/ai.constants';
import { formatCost, SMALLEST_SHOWN_COST } from './ai-format';
import { Tooltiper } from '@/components/ui/tooltip';

const UNKNOWN_COST_HINT =
  'Cost unknown: the model has no price in the price catalog, or the provider reported no token usage.';

/** A successful call we could not price: its $0 means unknown, not free. */
export function isUnpricedCall(
  event: Pick<IServiceAiEvent, 'type' | 'isError' | 'costSource'>
): boolean {
  return (
    isAiModelCall(event.type) && !event.isError && event.costSource === 'none'
  );
}

/** The text and hint for a cost that may include calls without a known price. */
export function describeAiCost(
  cost: number,
  unpricedCalls: number
): { text: string; hint?: string } {
  if (unpricedCalls === 0) {
    return { text: formatCost(cost) };
  }
  // Below the smallest shown amount, `<$0.000001+` would claim an upper and a lower bound at once.
  if (cost < SMALLEST_SHOWN_COST) {
    return { text: '—', hint: UNKNOWN_COST_HINT };
  }
  const calls =
    unpricedCalls === 1 ? '1 call has' : `${unpricedCalls} calls have`;
  return {
    text: `${formatCost(cost, 'down')}+`,
    hint: `At least this much: ${calls} no known cost.`,
  };
}

export function AiCost({
  cost,
  unpricedCalls,
}: {
  cost: number;
  unpricedCalls: number;
}) {
  const { text, hint } = describeAiCost(cost, unpricedCalls);
  if (!hint) {
    return <>{text}</>;
  }
  return (
    <Tooltiper asChild content={hint}>
      <span
        className="cursor-help text-muted-foreground underline decoration-dotted underline-offset-2"
        tabIndex={0}
      >
        {text}
      </span>
    </Tooltiper>
  );
}
