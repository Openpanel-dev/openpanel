// Upper bounds for user-supplied strings, shared so modules stop inventing a
// literal each.
//
// Named `*.constants.ts` deliberately: `constants-stay-isomorphic` lets a
// constants file import zod, another constants file, or nothing, so this is the
// only shape the rule allows a shared limit to take.
//
// These are ceilings, not product rules. A ceiling exists so an input cannot
// reach work that scales with its length — argon2 in `auth/src/password.ts`,
// a `Set-Cookie` write, a database column — and is set far above any honest
// value so it never fires for a real user.

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
