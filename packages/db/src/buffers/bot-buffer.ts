import { TABLE_NAMES, ch } from '../clickhouse-client';
import type { IClickhouseBotEvent } from '../services/event.service';
import { BotBuffer as NewBotBuffer } from './bot-buffer-psql';
import { RedisBuffer } from './buffer';

const testNewBotBuffer = new NewBotBuffer();

type BufferType = IClickhouseBotEvent;
export class BotBuffer extends RedisBuffer<BufferType> {
  constructor() {
    super('events_bots', 500);
  }

  async add(event: BufferType) {
    await super.add(event);
    if (process.env.TEST_NEW_BUFFER) {
      await testNewBotBuffer.add(event);
    }
  }

  protected async insertIntoDB(items: BufferType[]): Promise<void> {
    await ch.insert({
      table: TABLE_NAMES.events_bots,
      values: items,
      format: 'JSONEachRow',
    });
  }
}
