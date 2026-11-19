/**
 * What actually gets stored as a job's data.
 *
 * The payload is nested rather than merged with the metadata so a module's
 * schema stays exactly the shape it declared — nothing added here can collide
 * with a field a payload wanted for itself.
 */
export interface JobEnvelope<TPayload = unknown> {
  payload: TPayload;
  meta: JobMeta;
}

/**
 * Travels with the job so a worker's logs join the request that caused them,
 * which is otherwise unrecoverable once the response has gone out. A job
 * enqueued from another job inherits its parent's.
 */
export interface JobMeta {
  requestId?: string;
}

/**
 * `undefined` becomes `null` because BullMQ stores job data as JSON, which
 * drops an undefined value and with it the `payload` key that `isEnvelope`
 * looks for. A payload-less job (cron) therefore carries `null` on both the
 * envelope and the compat path, so one schema covers both.
 */
export function wrap<TPayload>(
  payload: TPayload,
  meta: JobMeta
): JobEnvelope<TPayload extends undefined ? null : TPayload> {
  return {
    payload: (payload ?? null) as TPayload extends undefined ? null : TPayload,
    meta,
  };
}

/**
 * Both keys, not just `payload`: most legacy job shapes also carry a
 * `payload` of their own, so `meta` is the half that tells an envelope from
 * a legacy job.
 */
export function isEnvelope(data: unknown): data is JobEnvelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    'payload' in data &&
    'meta' in data
  );
}

/** Loud about data that never went through `wrap`, rather than handing a handler `undefined`. */
export function unwrap(data: unknown): JobEnvelope {
  if (!isEnvelope(data)) {
    throw new Error('Job data is not a job envelope');
  }

  return data;
}
