// Batches rows per table and inserts them as JSONEachRow through the shared
// ClickHouse client, so the seed lands in whatever database CLICKHOUSE_URL names.
// Adds are synchronous (the visitor pool evicts from inside a sync path); the
// generator awaits `flushFull()` between sessions.

import { ch, TABLE_NAMES } from '@openpanel/db';
import type {
  ClickhouseEventRow,
  ClickhouseProfileRow,
  ClickhouseSessionRow,
} from './clickhouse-rows';
import { INSERT_BATCH_ROWS } from './seed.constants';

export interface SinkCounts {
  events: number;
  sessions: number;
  profiles: number;
}

class TableBuffer<Row> {
  private rows: Row[] = [];
  count = 0;

  constructor(private readonly table: string) {}

  add(rows: readonly Row[]): void {
    for (const row of rows) {
      this.rows.push(row);
    }
    this.count += rows.length;
  }

  get full(): boolean {
    return this.rows.length >= INSERT_BATCH_ROWS;
  }

  async flush(): Promise<void> {
    if (this.rows.length === 0) {
      return;
    }
    const batch = this.rows;
    this.rows = [];
    await ch.insert({
      table: this.table,
      values: batch,
      format: 'JSONEachRow',
    });
  }
}

/** What the generator needs from a sink; tests substitute an in-memory one. */
export interface RowSink {
  addEvents(rows: readonly ClickhouseEventRow[]): void;
  addSession(row: ClickhouseSessionRow): void;
  addProfiles(rows: readonly ClickhouseProfileRow[]): void;
  flushFull(): Promise<void>;
  flush(): Promise<void>;
  counts(): SinkCounts;
}

export class ClickhouseSink implements RowSink {
  private readonly events = new TableBuffer<ClickhouseEventRow>(
    TABLE_NAMES.events
  );
  private readonly sessions = new TableBuffer<ClickhouseSessionRow>(
    TABLE_NAMES.sessions
  );
  private readonly profiles = new TableBuffer<ClickhouseProfileRow>(
    TABLE_NAMES.profiles
  );

  private get buffers(): TableBuffer<unknown>[] {
    return [this.events, this.sessions, this.profiles];
  }

  addEvents(rows: readonly ClickhouseEventRow[]): void {
    this.events.add(rows);
  }

  addSession(row: ClickhouseSessionRow): void {
    this.sessions.add([row]);
  }

  addProfiles(rows: readonly ClickhouseProfileRow[]): void {
    this.profiles.add(rows);
  }

  async flushFull(): Promise<void> {
    for (const buffer of this.buffers) {
      if (buffer.full) {
        await buffer.flush();
      }
    }
  }

  async flush(): Promise<void> {
    for (const buffer of this.buffers) {
      await buffer.flush();
    }
  }

  counts(): SinkCounts {
    return {
      events: this.events.count,
      sessions: this.sessions.count,
      profiles: this.profiles.count,
    };
  }
}
