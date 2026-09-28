// One flag, set by main.ts's signal handler, read by the readiness probe — so a
// draining process is taken out of the load balancer before its in-flight jobs
// finish rather than after.

let shuttingDown = false;

export function setShuttingDown(value: boolean): void {
  shuttingDown = value;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
