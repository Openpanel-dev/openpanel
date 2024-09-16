import { TABLE_NAMES, ch } from '../clickhouse-client';
import type { IClickhouseBotEvent } from '../services/event.service';
import type {
  Find,
  FindMany,
  OnCompleted,
  OnInsert,
  ProcessQueue,
} from './buffer';
import { RedisBuffer } from './buffer';

export class BotBuffer extends RedisBuffer<IClickhouseBotEvent> {
  constructor() {
    super({
      table: TABLE_NAMES.events_bots,
      batchSize: 100,
    });
  }

  public onInsert?: OnInsert<IClickhouseBotEvent> | undefined;
  public onCompleted?: OnCompleted<IClickhouseBotEvent> | undefined;

  public processQueue: ProcessQueue<IClickhouseBotEvent> = async (queue) => {
    await ch.insert({
      table: TABLE_NAMES.events_bots,
      values: queue.map((item) => item.event),
      format: 'JSONEachRow',
    });
    return queue.map((item) => item.index);
  };

  public findMany: FindMany<IClickhouseBotEvent, IClickhouseBotEvent> = () => {
    return Promise.resolve([]);
  };

  public find: Find<IClickhouseBotEvent, IClickhouseBotEvent> = () => {
    return Promise.resolve(null);
  };
}
