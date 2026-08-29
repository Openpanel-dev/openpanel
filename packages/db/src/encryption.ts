// At-rest encryption lives in @openpanel/common/server so it can be shared by
// packages that can't depend on db (e.g. @openpanel/integrations). Re-exported
// here for existing `@openpanel/db` importers (GSC tokens, TOTP). Same key
// (ENCRYPTION_KEY) and same format as before — no data migration.
export { encrypt, decrypt } from '@openpanel/common/server';
