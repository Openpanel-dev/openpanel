// Where API/SDK credentials become a client principal.
//
// V1 has five near-identical validators — `validateSdkRequest`,
// `validateExportRequest`, `validateImportRequest`, `validateManageRequest`
// and the MCP copy — that differ only by the accepted `ClientType` set and by
// the ingest extension. They collapse into this one function (ADR-011 A-i).
//
// P8 fills the body in, moving it onto `services.client.authenticate` and
// porting the ingest branch verbatim: the `ignoreCorsAndSecret` short-circuit,
// the unanchored wildcard origin regex, CORS-OR-secret ordering, the
// ip/profile_id project filters, the `__revenue` gate, the body-field
// credential fallback and the 5-minute verify cache. The signature and the
// macro over it are what P2 fixes.

import type { AppDeps } from '../context';

/** Prisma's `ClientType` enum, by value. Moves to client.constants.ts in P7. */
export type ClientType = 'read' | 'write' | 'root';

export interface AuthenticatedClient {
  id: string;
  projectId: string;
  type: ClientType;
  /**
   * Whether a client secret was PRESENTED, set before it is verified — V1 sets
   * `req.clientSecretAuth` at parse time (utils/auth.ts:62-64) and `isBotHook`
   * reads it afterwards as "this is a server-side SDK, never a bot". The
   * side-channel survives as a field on the principal (ADR-011 A-i).
   */
  secretPresented: boolean;
}

export interface ClientAuthOptions {
  /** Which client types may pass. Omitted means any, as `validateSdkRequest`. */
  allow?: ClientType[];
  /** The ingest extension described above. */
  ingest?: boolean;
  /** MCP presents `base64(clientId:clientSecret)` instead of the two headers. */
  token?: 'basic';
}

export function authenticateClient(
  _deps: AppDeps,
  _headers: Headers,
  _options: ClientAuthOptions
): Promise<AuthenticatedClient | null> {
  return Promise.resolve(null);
}
