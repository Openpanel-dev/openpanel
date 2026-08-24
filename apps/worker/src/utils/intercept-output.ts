import { interceptProcessOutput } from '@openpanel/logger';
import { logger } from './logger';

// Side-effect module — must stay the first import in index.ts so output from
// the rest of the boot sequence is captured too.
interceptProcessOutput(logger);
