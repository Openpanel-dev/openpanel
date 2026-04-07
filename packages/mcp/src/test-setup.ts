/**
 * Runs after every test file in this package (via setupFiles in vitest.config.ts).
 *
 * Closes the ClickHouse client's keep-alive connection pool so Vitest's worker
 * thread can exit cleanly. Without this the process hangs waiting for idle
 * sockets to time out (~10 s).
 */
import { afterAll } from 'vitest';
import { originalCh } from '@openpanel/db';

afterAll(() => originalCh.close());
