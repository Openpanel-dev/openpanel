// Set by main.ts, read by the readiness probe: a process that is still starting
// its consumers, or already draining, is out of the load balancer even though
// it answers HTTP.

let booting = false;
let shuttingDown = false;

export function setBooting(value: boolean): void {
  booting = value;
}

export function isBooting(): boolean {
  return booting;
}

export function setShuttingDown(value: boolean): void {
  shuttingDown = value;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
