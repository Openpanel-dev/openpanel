export type ChunkEvent = { type: number; data: unknown; timestamp: number };

export type ChunkData = {
  chunkIndex: number;
  startedAtMs: number;
  endedAtMs: number;
  events: ChunkEvent[];
};

type LoadedRange = { startMs: number; endMs: number };

/**
 * Tracks which session_replay_chunks are buffered client-side so the seek
 * handler can choose fast path (already loaded → goto immediately) vs slow
 * path (fetch missing chunks, then goto).
 *
 * Chunks MUST be applied to rrweb in chunk_index order — out-of-order
 * arrivals are held in `pendingChunks` until their predecessor lands.
 */
export class ReplayChunkBuffer {
  /** Sorted, merged time ranges that have been applied to the player. */
  loadedRanges: LoadedRange[] = [];
  /** Highest chunk_index that has been applied via addEvent (in order). */
  loadedUpToChunkIndex = -1;
  /** Chunks that arrived ahead of their predecessor — waiting to be drained. */
  pendingChunks = new Map<number, ChunkData>();

  /**
   * Queue a chunk and try to drain in-order applications.
   * Returns the chunks that should be applied to rrweb (callers iterate and
   * call addEvent for each event in order).
   */
  enqueueAndDrain(chunk: ChunkData): ChunkData[] {
    // Idempotency: ignore if we've already applied this chunk.
    if (chunk.chunkIndex <= this.loadedUpToChunkIndex) {
      return [];
    }
    if (this.pendingChunks.has(chunk.chunkIndex)) {
      return [];
    }
    this.pendingChunks.set(chunk.chunkIndex, chunk);

    const drained: ChunkData[] = [];
    let next = this.loadedUpToChunkIndex + 1;
    while (this.pendingChunks.has(next)) {
      const c = this.pendingChunks.get(next)!;
      this.pendingChunks.delete(next);
      this.addRange(c.startedAtMs, c.endedAtMs);
      drained.push(c);
      this.loadedUpToChunkIndex = next;
      next += 1;
    }
    return drained;
  }

  /** Insert [startMs, endMs] into loadedRanges, merging overlaps/adjacents. */
  addRange(startMs: number, endMs: number): void {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    if (endMs < startMs) return;

    const merged: LoadedRange[] = [];
    let inserted = false;
    let cur: LoadedRange = { startMs, endMs };

    for (const r of this.loadedRanges) {
      if (r.endMs < cur.startMs - 1) {
        merged.push(r);
      } else if (r.startMs > cur.endMs + 1) {
        if (!inserted) {
          merged.push(cur);
          inserted = true;
        }
        merged.push(r);
      } else {
        cur = {
          startMs: Math.min(cur.startMs, r.startMs),
          endMs: Math.max(cur.endMs, r.endMs),
        };
      }
    }
    if (!inserted) merged.push(cur);
    this.loadedRanges = merged;
  }

  /** Is the given wall-clock timestamp already inside a buffered range? */
  isLoaded(targetMs: number): boolean {
    for (const r of this.loadedRanges) {
      if (r.startMs <= targetMs && targetMs <= r.endMs) return true;
      if (r.startMs > targetMs) return false; // sorted — early exit
    }
    return false;
  }

  /**
   * Highest endMs across all loaded ranges, or null if nothing loaded yet.
   * Useful for the buffered-progress bar.
   */
  maxLoadedMs(): number | null {
    if (this.loadedRanges.length === 0) return null;
    return this.loadedRanges[this.loadedRanges.length - 1]!.endMs;
  }

  reset(): void {
    this.loadedRanges = [];
    this.loadedUpToChunkIndex = -1;
    this.pendingChunks.clear();
  }
}
