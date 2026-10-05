// The producer's error classification, split out of `kafka.ts` so the batching
// path can be tested against the same recovery wrapper without a broker.

// Kafka error codes that mean the producer's PID/sequence state is
// permanently out of sync with the broker for some partition — only a
// fresh PID (new producer instance) can recover.
//   45 OUT_OF_ORDER_SEQUENCE_NUMBER
//   46 DUPLICATE_SEQUENCE_NUMBER
//   47 INVALID_PRODUCER_EPOCH
//   65 UNKNOWN_PRODUCER_ID
const FATAL_PRODUCER_ERROR_CODES = new Set<number>([45, 46, 47, 65]);

export const isFatalProducerError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const name = (err as { name?: string }).name;
  // Retries-exceeded leaves the idempotent producer's sequence state
  // suspect (broker may have persisted a batch we gave up on), so treat
  // it as fatal-for-this-producer too.
  if (name === 'KafkaJSNumberOfRetriesExceeded') {
    return true;
  }
  if (name === 'KafkaJSProtocolError') {
    const code = (err as { code?: number }).code;
    return typeof code === 'number' && FATAL_PRODUCER_ERROR_CODES.has(code);
  }
  return false;
};

/**
 * Runs a produce call and hands a fatal producer failure to `onFatal` before
 * rethrowing. The error always propagates — `onFatal` is the recovery side
 * effect (drop and rebuild the producer), never a swallow.
 */
export const sendWithFatalRecovery = async (
  produce: () => Promise<void>,
  onFatal: (err: unknown) => void
): Promise<void> => {
  try {
    await produce();
  } catch (err) {
    if (isFatalProducerError(err)) {
      onFatal(err);
    }
    throw err;
  }
};
