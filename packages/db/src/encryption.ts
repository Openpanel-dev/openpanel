// At-rest encryption lives in @openpanel/core so it can be shared by clients
// (e.g. the object-store adapters) that can't depend on db. Re-exported here
// for existing `@openpanel/db` importers (GSC tokens, TOTP). Same key
// (ENCRYPTION_KEY) and same format as before — no data migration.
export { decrypt, encrypt } from '@openpanel/core';
