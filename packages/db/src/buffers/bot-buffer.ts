import { TABLE_NAMES, ch } from '../clickhouse-client';
import type { IClickhouseBotEvent } from '../services/event.service';
import { RedisBuffer } from './buffer';

type BufferType = IClickhouseBotEvent;
export class BotBuffer extends RedisBuffer<BufferType> {
  constructor() {
    super(TABLE_NAMES.events_bots, 500);
  }

  protected async insertIntoDB(items: BufferType[]): Promise<void> {
    await ch.insert({
      table: TABLE_NAMES.events_bots,
      values: items,
      format: 'JSONEachRow',
    });
  }
}
