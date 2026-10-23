// Forwards to `@openpanel/db`'s code migrations for installs whose compose
// file still runs `cd /app/packages/core && bun scripts/migrate-code.ts`
// before starting the api. The shipped compose files no longer do: the api
// applies pending code migrations itself once it is listening.

import '@openpanel/db/scripts/migrate-code';
