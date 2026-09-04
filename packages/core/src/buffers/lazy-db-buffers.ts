// The seven buffer singletons are built once by @openpanel/db's src/buffers
// (the V1 delegate — see that file's header) and, once V2 owns boot, handed
// to AppDeps by createBuffers directly. Until then, every core module that
// needs a buffer ahead of that boot wiring reaches it through THIS one
// dynamic import() — see session.service.ts's loadProfileService comment:
// rolldown cannot finalize a dynamic-import cycle when apps/api or
// apps/worker bundles the workspace and 2+ separate call sites each reopen
// the same core -> @openpanel/db -> core edge (db/buffers imports
// `createBuffers` from the core barrel). One edge, one file.
export function loadDbBuffers() {
  return import('@openpanel/db/src/buffers');
}
