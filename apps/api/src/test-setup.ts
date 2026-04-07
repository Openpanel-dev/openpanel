import { afterAll } from 'vitest';
import { originalCh } from '@openpanel/db';

// Close the ClickHouse connection pool after all tests finish to allow the
// Vitest process to exit cleanly.
afterAll(() => originalCh.close());
