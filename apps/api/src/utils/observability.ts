import { init } from '@hyperdx/node-opentelemetry';
import { getServiceName, interceptProcessOutput } from '@openpanel/logger';
import { logger } from './logger';

// Side-effect module — must stay the first import in index.ts.
//
// Traces only: logs ship via the pino transport and the output interceptor,
// so the SDK's log pipeline and console capture stay off — one shipping path
// per signal, nothing lands twice (see logging-capture-plan.md). Metrics stay
// on prom-client/Grafana.
//
// tsdown bundles most deps (and hoists external imports above this code), so
// require-hook auto-instrumentation only reaches diagnostics_channel-based
// instrumentation (undici/fetch). To get spans from ioredis/bullmq/pg, move
// them to `external` in tsdown.config.ts.
if (process.env.HYPERDX_API_KEY) {
  init({
    apiKey: process.env.HYPERDX_API_KEY,
    service: getServiceName('api'),
    consoleCapture: false,
    disableLogs: true,
    disableMetrics: true,
    disableStartupLogs: true,
  });
}

interceptProcessOutput(logger);
