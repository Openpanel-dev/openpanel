// Amortises the produce round-trip: accumulates messages and sends them as
// ONE `send` carrying MANY messages, instead of one awaited `send` per
// /track request.
//
// It is OFF unless the config loader says otherwise — see `producer-tuning.ts`.
//
// Two invariants the tests hold this file to:
//
// 1. ORDER. Messages leave in the order they were enqueued: within a batch
// because the array keeps that order (kafkajs partitions per message by key,
// and same-key messages in one `send` land in one partition batch in array
// order), and across batches because this file keeps exactly ONE send
// outstanding at a time. That second half is why the guarantee does not depend
// on `maxInFlightRequests` staying at 1. 2. SETTLEMENT. A caller's promise
// settles on ITS OWN batch's result. A failed send rejects exactly the callers
// whose messages were in it, and no others.

interface BatchWaiter {
  resolve: () => void;
  reject: (err: unknown) => void;
}

interface OpenBatch<TMessage> {
  messages: TMessage[];
  waiters: BatchWaiter[];
  lingerTimer: ReturnType<typeof setTimeout> | null;
}

export interface ProducerBatcherOptions<TMessage> {
  /** Messages per `send()`. A batch closes as soon as it reaches this many. */
  batchSize: number;
  /** How long a partially filled batch may wait for company, in ms. */
  lingerMs: number;
  /** Sends one closed batch. Rejecting rejects that batch's callers only. */
  send: (messages: TMessage[]) => Promise<void>;
}

export interface ProducerBatcher<TMessage> {
  /** Resolves when THIS message's batch has been acknowledged. */
  enqueue: (message: TMessage) => Promise<void>;
  /** Closes the open batch and waits for everything already sent. */
  flush: () => Promise<void>;
  /** Messages accumulated but not yet sent. */
  pendingCount: () => number;
}

export const createProducerBatcher = <TMessage>(
  options: ProducerBatcherOptions<TMessage>
): ProducerBatcher<TMessage> => {
  let openBatch: OpenBatch<TMessage> | null = null;
  // The tail of the send chain. It never rejects: `deliver` settles the
  // waiters and returns, so one failed batch cannot break the chain for the
  // batches queued behind it.
  let sendChain: Promise<void> = Promise.resolve();

  const deliver = async (batch: OpenBatch<TMessage>): Promise<void> => {
    try {
      await options.send(batch.messages);
      for (const waiter of batch.waiters) {
        waiter.resolve();
      }
    } catch (err) {
      for (const waiter of batch.waiters) {
        waiter.reject(err);
      }
    }
  };

  const closeOpenBatch = (): void => {
    if (!openBatch) {
      return;
    }
    const batch = openBatch;
    openBatch = null;
    if (batch.lingerTimer) {
      clearTimeout(batch.lingerTimer);
    }
    sendChain = sendChain.then(() => deliver(batch));
  };

  const startLinger = (batch: OpenBatch<TMessage>): void => {
    batch.lingerTimer = setTimeout(() => {
      // Only the batch that armed the timer may be closed by it; a size-
      // triggered close has already replaced `openBatch` by then.
      if (openBatch === batch) {
        closeOpenBatch();
      }
    }, options.lingerMs);
  };

  const enqueue = (message: TMessage): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const batch: OpenBatch<TMessage> = openBatch ?? {
        messages: [],
        waiters: [],
        lingerTimer: null,
      };
      openBatch = batch;
      batch.messages.push(message);
      batch.waiters.push({ resolve, reject });
      if (batch.messages.length >= options.batchSize) {
        closeOpenBatch();
        return;
      }
      if (!batch.lingerTimer) {
        startLinger(batch);
      }
    });

  return {
    enqueue,
    flush: async () => {
      closeOpenBatch();
      await sendChain;
    },
    pendingCount: () => openBatch?.messages.length ?? 0,
  };
};
