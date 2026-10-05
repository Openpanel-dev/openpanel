// Upper bounds for user-supplied strings, shared so modules stop inventing a
// literal each. These are ceilings, not product rules: they stop an input
// reaching work that scales with its length (argon2, a `Set-Cookie` write, a
// database column) and sit far above any honest value.

/** Argon2 hashes this; 128 is well past any password a person types. */
export const MAX_PASSWORD = 128;

/** RFC 5321's limit on a whole address. */
export const MAX_EMAIL = 254;

/** A person's name, an organization's, a project's. */
export const MAX_NAME = 100;

/** Reset tokens, TOTP recovery codes, OAuth `code`/`state`. */
export const MAX_TOKEN = 512;

/** An id we generate or a provider hands us: invite, share, organization. */
export const MAX_ID = 128;

/** Free text that is stored but never parsed. */
export const MAX_DESCRIPTION = 1000;
