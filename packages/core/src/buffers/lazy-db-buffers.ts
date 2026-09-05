// The seven buffer singletons are built once by @openpanel/queue's
// src/buffers.ts (moved from @openpanel/db, M9-CLEANUP-001 — see that file's
// header for why @openpanel/queue and not here) and, once V2 owns boot,
// handed to AppDeps by createBuffers directly. Until then, every core module
// that needs a buffer ahead of that boot wiring reaches it through THIS one
// dynamic import() — one edge, one file, same reasoning as
// session.service.ts's loadProfileService comment.
export function loadDbBuffers() {
  return import('@openpanel/queue/src/buffers');
}
