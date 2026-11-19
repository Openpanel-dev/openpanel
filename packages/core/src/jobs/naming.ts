/** How a queue's name is namespaced and where Redis Cluster hashes it. */
export interface QueueKeyOptions {
  /**
   * Redis Cluster picks a slot from the substring inside `{}`, and BullMQ's
   * Lua scripts touch several of a queue's keys in one call — which the
   * cluster rejects unless they all hash to the same slot.
   */
  cluster?: boolean;
  /** Isolates two worktrees, or a developer and staging, sharing one Redis. */
  namespace?: string;
}

/**
 * The Redis key a queue lives under.
 *
 * Braces only under `QUEUE_CLUSTER`, because every existing queue in every
 * deployment is already named that way. `-` joins the namespace because
 * BullMQ rejects a `:` in a queue name.
 */
export function queueKey(name: string, options?: QueueKeyOptions): string {
  const scoped = options?.namespace ? `${name}-${options.namespace}` : name;
  return options?.cluster ? `{${scoped}}` : scoped;
}
