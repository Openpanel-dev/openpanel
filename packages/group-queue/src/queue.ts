import type Redis from 'ioredis';
import { z } from 'zod';

export type QueueOptions = {
  redis: Redis; // Recommend setting maxRetriesPerRequest: null for production reliability
  namespace: string; // Required namespace for the queue (will be prefixed with 'groupmq:')
  jobTimeoutMs?: number; // How long a job can be processed before timing out (default: 30s)
  maxAttempts?: number; // Default max attempts for jobs (default: 3)
  reserveScanLimit?: number; // How many ready groups to scan to skip locked ones (default: 20)
  orderingDelayMs?: number; // Delay before processing jobs to allow late events (default: 0)
};

export type EnqueueOptions<T> = {
  groupId: string;
  payload: T;
  orderMs?: number; // primary ordering field (e.g., event.createdAt in ms)
  maxAttempts?: number;
};

export type ReservedJob<T = any> = {
  id: string;
  groupId: string;
  payload: T;
  attempts: number;
  maxAttempts: number;
  seq: number;
  enqueuedAt: number;
  orderMs: number;
  score: number;
  deadlineAt: number;
};

function nsKey(ns: string, ...parts: string[]) {
  return [ns, ...parts].join(':');
}

export class Queue<T = any> {
  private r: Redis;
  private ns: string;
  private vt: number;
  private defaultMaxAttempts: number;
  private scanLimit: number;
  private orderingDelayMs: number;

  private enqueueScript!: (...args: any[]) => Promise<string>;
  private reserveScript!: (...args: any[]) => Promise<string | null>;
  private completeScript!: (...args: any[]) => Promise<number>;
  private retryScript!: (...args: any[]) => Promise<number>;
  private heartbeatScript!: (...args: any[]) => Promise<number>;
  private cleanupScript!: (...args: any[]) => Promise<number>;
  private getActiveCountScript!: (...args: any[]) => Promise<number>;
  private getWaitingCountScript!: (...args: any[]) => Promise<number>;
  private getDelayedCountScript!: (...args: any[]) => Promise<number>;
  private getJobsScript!: (...args: any[]) => Promise<string[]>;
  private getActiveJobsScript!: (...args: any[]) => Promise<string[]>;
  private getWaitingJobsScript!: (...args: any[]) => Promise<string[]>;
  private getDelayedJobsScript!: (...args: any[]) => Promise<string[]>;
  private getUniqueGroupsScript!: (...args: any[]) => Promise<string[]>;
  private getUniqueGroupsCountScript!: (...args: any[]) => Promise<number>;

  constructor(opts: QueueOptions) {
    this.r = opts.redis;
    // Always prefix namespace with 'groupmq:' to avoid conflicts
    this.ns = `groupmq:${opts.namespace}`;
    // Ensure job timeout is positive (Redis SET PX requires positive integer)
    const rawVt = opts.jobTimeoutMs ?? 30_000;
    this.vt = Math.max(1, rawVt); // Minimum 1ms
    this.defaultMaxAttempts = opts.maxAttempts ?? 3;
    this.scanLimit = opts.reserveScanLimit ?? 20;
    this.orderingDelayMs = opts.orderingDelayMs ?? 0;
    this.defineScripts();

    // Only listen to critical events to reduce overhead
    this.r.on('error', (err) => {
      console.error('Redis error:', err);
    });
  }

  private defineScripts() {
    // ENQUEUE
    // argv: groupId, payloadJson, maxAttempts, orderMs
    this.r.defineCommand('qEnqueue', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local seqKey = ns .. ":seq"
local readyKey = ns .. ":ready"
local groupId = ARGV[1]
local payload = ARGV[2]
local maxAttempts = tonumber(ARGV[3])
local orderMs = tonumber(ARGV[4])

local seq = redis.call("INCR", seqKey)
local jobId = tostring(seq)
local jobKey = ns .. ":job:" .. jobId
local gZ = ns .. ":g:" .. groupId

if not orderMs then
  orderMs = tonumber(redis.call("TIME")[1]) * 1000
end
-- Use relative milliseconds from a recent base to keep numbers smaller
-- Base: 2024-01-01, but keep millisecond precision
local baseEpoch = 1704067200000  -- 2024-01-01 in milliseconds  
local relativeMs = orderMs - baseEpoch
local score = relativeMs * 1000 + seq

redis.call("HMSET", jobKey,
  "id", jobId,
  "groupId", groupId,
  "payload", payload,
  "attempts", "0",
  "maxAttempts", tostring(maxAttempts),
  "seq", tostring(seq),
  "enqueuedAt", tostring(redis.call("TIME")[1]),
  "orderMs", tostring(orderMs),
  "score", tostring(score)
)

-- add to group ZSET
redis.call("ZADD", gZ, score, jobId)

-- ensure group appears in ready with current head's score
local head = redis.call("ZRANGE", gZ, 0, 0, "WITHSCORES")
if head and #head >= 2 then
  local headScore = tonumber(head[2])
  redis.call("ZADD", readyKey, headScore, groupId)
end

return jobId
      `,
    });

    // RESERVE
    // argv: nowEpochMs, vtMs, scanLimit, orderingDelayMs
    this.r.defineCommand('qReserve', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local readyKey = ns .. ":ready"
local now = tonumber(ARGV[1])
local vt = tonumber(ARGV[2])
local scanLimit = tonumber(ARGV[3]) or 20
local orderingDelayMs = tonumber(ARGV[4]) or 0

-- Check for expired jobs using processing timeline (efficient, no KEYS needed)
local processingKey = ns .. ":processing"
local expiredJobs = redis.call("ZRANGEBYSCORE", processingKey, 0, now)
for _, jobId in ipairs(expiredJobs) do
  local procKey = ns .. ":processing:" .. jobId
  local procData = redis.call("HMGET", procKey, "groupId", "deadlineAt")
  local gid = procData[1]
  local deadlineAt = tonumber(procData[2])
  
  if gid and deadlineAt and now > deadlineAt then
    -- Job has expired, restore it to its group
    local jobKey = ns .. ":job:" .. jobId
    local jobScore = redis.call("HGET", jobKey, "score")
    if jobScore then
      local gZ = ns .. ":g:" .. gid
      redis.call("ZADD", gZ, tonumber(jobScore), jobId)
      
      -- Ensure group is in ready with head score
      local head = redis.call("ZRANGE", gZ, 0, 0, "WITHSCORES")
      if head and #head >= 2 then
        local headScore = tonumber(head[2])
        redis.call("ZADD", readyKey, headScore, gid)
      end
      
      -- Clean up expired lock, processing key, and timeline entry
      redis.call("DEL", ns .. ":lock:" .. gid)
      redis.call("DEL", procKey)
      redis.call("ZREM", processingKey, jobId)
    end
  end
end

-- Get available groups
local groups = redis.call("ZRANGE", readyKey, 0, scanLimit - 1, "WITHSCORES")
if not groups or #groups == 0 then
  return nil
end

local chosenGid = nil
local chosenIndex = nil
for i = 1, #groups, 2 do
  local gid = groups[i]
  local lockKey = ns .. ":lock:" .. gid
  
  -- Check if lock exists and is not expired
  local lockTtl = redis.call("PTTL", lockKey)
  if lockTtl == -2 or lockTtl == -1 then -- no lock or expired
    chosenGid = gid
    chosenIndex = (i + 1) / 2 - 1
    break
  end
end

if not chosenGid then
  return nil
end

redis.call("ZREMRANGEBYRANK", readyKey, chosenIndex, chosenIndex)

local gZ = ns .. ":g:" .. chosenGid
local zpop = redis.call("ZPOPMIN", gZ, 1)
if not zpop or #zpop == 0 then
  return nil
end
local headJobId = zpop[1]

local jobKey = ns .. ":job:" .. headJobId
local job = redis.call("HMGET", jobKey, "id","groupId","payload","attempts","maxAttempts","seq","enqueuedAt","orderMs","score")
local id, groupId, payload, attempts, maxAttempts, seq, enq, orderMs, score = job[1], job[2], job[3], job[4], job[5], job[6], job[7], job[8], job[9]

-- Check ordering delay: only process jobs that are old enough
if orderingDelayMs > 0 and orderMs then
  local jobOrderMs = tonumber(orderMs)
  if jobOrderMs then
    local eligibleAt
    
    if jobOrderMs > now then
      -- Future job: process at its orderMs time (no additional delay needed)
      eligibleAt = jobOrderMs
    else
      -- Past job: wait for ordering delay to allow late-arriving events
      eligibleAt = jobOrderMs + orderingDelayMs
    end
    
    if eligibleAt > now then
      -- Job is not yet eligible, put job back and set a temporary lock
      local putBackScore = tonumber(score)
      redis.call("ZADD", gZ, putBackScore, headJobId)
      
      -- Calculate when this job will be eligible (how long from now)
      local remainingDelayMs = eligibleAt - now
      
      -- Set a lock that expires when the job becomes eligible
      local lockKey = ns .. ":lock:" .. chosenGid
      redis.call("SET", lockKey, "ordering-delay", "PX", remainingDelayMs)
      
      -- DON'T re-add group to ready queue immediately
      -- The group will be naturally re-added by other mechanisms:
      -- 1. When new jobs are added to this group
      -- 2. When the lock expires and a cleanup/heartbeat process runs
      -- 3. When a worker retries after the poll interval
      
      return nil
    end
  end
end

-- Set lock and processing info
local lockKey = ns .. ":lock:" .. chosenGid
redis.call("SET", lockKey, id, "PX", vt)

local procKey = ns .. ":processing:" .. id
local deadline = now + vt
redis.call("HSET", procKey, "groupId", chosenGid, "deadlineAt", tostring(deadline))

-- Add to processing timeline for efficient expiry checking
local processingKey = ns .. ":processing"
redis.call("ZADD", processingKey, deadline, id)

-- Re-add group to ready if it has more jobs
local nextHead = redis.call("ZRANGE", gZ, 0, 0, "WITHSCORES")
if nextHead and #nextHead >= 2 then
  local nextScore = tonumber(nextHead[2])
  redis.call("ZADD", readyKey, nextScore, chosenGid)
end

-- Return job data as delimited string to avoid JSON overhead (using rare delimiter)
return id .. "||DELIMITER||" .. groupId .. "||DELIMITER||" .. payload .. "||DELIMITER||" .. attempts .. "||DELIMITER||" .. maxAttempts .. "||DELIMITER||" .. seq .. "||DELIMITER||" .. enq .. "||DELIMITER||" .. orderMs .. "||DELIMITER||" .. score .. "||DELIMITER||" .. deadline
      `,
    });

    // COMPLETE
    // argv: jobId, groupId
    this.r.defineCommand('qComplete', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local jobId = ARGV[1]
local gid = ARGV[2]
redis.call("DEL", ns .. ":processing:" .. jobId)
redis.call("ZREM", ns .. ":processing", jobId)
local lockKey = ns .. ":lock:" .. gid
local val = redis.call("GET", lockKey)
if val == jobId then
  redis.call("DEL", lockKey)
  return 1
end
return 0
      `,
    });

    // RETRY
    // argv: jobId, backoffMs
    this.r.defineCommand('qRetry', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local jobId = ARGV[1]
local backoffMs = tonumber(ARGV[2]) or 0
local jobKey = ns .. ":job:" .. jobId

local gid = redis.call("HGET", jobKey, "groupId")
local attempts = tonumber(redis.call("HINCRBY", jobKey, "attempts", 1))
local maxAttempts = tonumber(redis.call("HGET", jobKey, "maxAttempts"))

redis.call("DEL", ns .. ":processing:" .. jobId)
redis.call("ZREM", ns .. ":processing", jobId)

if attempts > maxAttempts then
  -- dead-letter hook (customize if desired)
  -- redis.call("LPUSH", ns..":dead", jobId)
  return -1
end

local score = tonumber(redis.call("HGET", jobKey, "score"))
local gZ = ns .. ":g:" .. gid
redis.call("ZADD", gZ, score, jobId)

local head = redis.call("ZRANGE", gZ, 0, 0, "WITHSCORES")
if head and #head >= 2 then
  local headScore = tonumber(head[2])
  redis.call("ZADD", ns .. ":ready", headScore, gid)
end

if backoffMs > 0 then
  local lockKey = ns .. ":lock:" .. gid
  redis.call("SET", lockKey, jobId, "PX", backoffMs)
end

return attempts
      `,
    });

    // HEARTBEAT
    // argv: jobId, groupId, extendMs
    this.r.defineCommand('qHeartbeat', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local jobId = ARGV[1]
local gid = ARGV[2]
local extendMs = tonumber(ARGV[3])
local lockKey = ns .. ":lock:" .. gid

local val = redis.call("GET", lockKey)
if val == jobId then
  redis.call("PEXPIRE", lockKey, extendMs)
  local procKey = ns .. ":processing:" .. jobId
  local now = tonumber(redis.call("TIME")[1]) * 1000
  redis.call("HSET", procKey, "deadlineAt", tostring(now + extendMs))
  return 1
end
return 0
      `,
    });

    // CLEANUP EXPIRED JOBS (run periodically)
    // argv: nowEpochMs
    this.r.defineCommand('qCleanup', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local readyKey = ns .. ":ready"
local processingKey = ns .. ":processing"
local now = tonumber(ARGV[1])
local cleaned = 0

-- Reclaim expired jobs using processing timeline
local expiredJobs = redis.call("ZRANGEBYSCORE", processingKey, 0, now)
for _, jobId in ipairs(expiredJobs) do
  local procKey = ns .. ":processing:" .. jobId
  local procData = redis.call("HMGET", procKey, "groupId", "deadlineAt")
  local gid = procData[1]
  local deadlineAt = tonumber(procData[2])
  
  if gid and deadlineAt and now > deadlineAt then
    -- Job has expired, restore it to its group
    local jobKey = ns .. ":job:" .. jobId
    local jobScore = redis.call("HGET", jobKey, "score")
    if jobScore then
      local gZ = ns .. ":g:" .. gid
      redis.call("ZADD", gZ, tonumber(jobScore), jobId)
      
      -- Ensure group is in ready with head score
      local head = redis.call("ZRANGE", gZ, 0, 0, "WITHSCORES")
      if head and #head >= 2 then
        local headScore = tonumber(head[2])
        redis.call("ZADD", readyKey, headScore, gid)
      end
      
      -- Clean up expired lock, processing key, and timeline entry
      redis.call("DEL", ns .. ":lock:" .. gid)
      redis.call("DEL", procKey)
      redis.call("ZREM", processingKey, jobId)
      cleaned = cleaned + 1
    end
  end
end

return cleaned
      `,
    });

    // GET ACTIVE COUNT - count jobs currently being processed
    this.r.defineCommand('qGetActiveCount', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local processingKey = ns .. ":processing"

-- Count all jobs in the processing timeline
local activeCount = redis.call("ZCARD", processingKey)
return activeCount
      `,
    });

    // GET WAITING COUNT - count jobs waiting in all groups
    this.r.defineCommand('qGetWaitingCount', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local groupPattern = ns .. ":g:*"

-- Get all group keys
local groupKeys = redis.call("KEYS", groupPattern)
local waitingCount = 0

-- Count jobs in each group
for _, gZ in ipairs(groupKeys) do
  waitingCount = waitingCount + redis.call("ZCARD", gZ)
end

return waitingCount
      `,
    });

    // GET DELAYED COUNT - count jobs with locks (backoff delays)
    this.r.defineCommand('qGetDelayedCount', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local lockPattern = ns .. ":lock:*"

-- Count lock keys (each represents a delayed group)
local lockKeys = redis.call("KEYS", lockPattern)
local delayedCount = 0

-- For each locked group, count jobs in that group
for _, lockKey in ipairs(lockKeys) do
  local groupId = string.match(lockKey, ":lock:(.+)$")
  if groupId then
    local gZ = ns .. ":g:" .. groupId
    delayedCount = delayedCount + redis.call("ZCARD", gZ)
  end
end

return delayedCount
      `,
    });

    // GET ACTIVE JOBS - get list of active job IDs
    this.r.defineCommand('qGetActiveJobs', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local processingKey = ns .. ":processing"

-- Get all processing job IDs
return redis.call("ZRANGE", processingKey, 0, -1)
      `,
    });

    // GET WAITING JOBS - get list of waiting job IDs
    this.r.defineCommand('qGetWaitingJobs', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local groupPattern = ns .. ":g:*"

-- Get all group keys
local groupKeys = redis.call("KEYS", groupPattern)
local jobs = {}

-- Get jobs from each group
for _, gZ in ipairs(groupKeys) do
  local groupJobs = redis.call("ZRANGE", gZ, 0, -1)
  for _, jobId in ipairs(groupJobs) do
    table.insert(jobs, jobId)
  end
end

return jobs
      `,
    });

    // GET DELAYED JOBS - get list of delayed job IDs
    this.r.defineCommand('qGetDelayedJobs', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local lockPattern = ns .. ":lock:*"

-- Get lock keys
local lockKeys = redis.call("KEYS", lockPattern)
local jobs = {}

-- For each locked group, get jobs in that group
for _, lockKey in ipairs(lockKeys) do
  local groupId = string.match(lockKey, ":lock:(.+)$")
  if groupId then
    local gZ = ns .. ":g:" .. groupId
    local groupJobs = redis.call("ZRANGE", gZ, 0, -1)
    for _, jobId in ipairs(groupJobs) do
      table.insert(jobs, jobId)
    end
  end
end

return jobs
      `,
    });

    // GET UNIQUE GROUPS - get list of all group IDs that have jobs
    this.r.defineCommand('qGetUniqueGroups', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local groupPattern = ns .. ":g:*"

-- Get all group keys
local groupKeys = redis.call("KEYS", groupPattern)
local groups = {}

-- Extract group IDs from keys
for _, gZ in ipairs(groupKeys) do
  local groupId = string.match(gZ, ":g:(.+)$")
  if groupId then
    -- Only include groups that have jobs
    local jobCount = redis.call("ZCARD", gZ)
    if jobCount > 0 then
      table.insert(groups, groupId)
    end
  end
end

return groups
      `,
    });

    // GET UNIQUE GROUPS COUNT - get count of unique groups that have jobs
    this.r.defineCommand('qGetUniqueGroupsCount', {
      numberOfKeys: 0,
      lua: `
local ns = "${this.ns}"
local groupPattern = ns .. ":g:*"

-- Get all group keys
local groupKeys = redis.call("KEYS", groupPattern)
local count = 0

-- Count groups that have jobs
for _, gZ in ipairs(groupKeys) do
  local jobCount = redis.call("ZCARD", gZ)
  if jobCount > 0 then
    count = count + 1
  end
end

return count
      `,
    });

    // Bind
    // @ts-ignore
    this.enqueueScript = (...args: any[]) => (this.r as any).qEnqueue(...args);
    // @ts-ignore
    this.reserveScript = (...args: any[]) => (this.r as any).qReserve(...args);
    // @ts-ignore
    this.completeScript = (...args: any[]) =>
      (this.r as any).qComplete(...args);
    // @ts-ignore
    this.retryScript = (...args: any[]) => (this.r as any).qRetry(...args);
    // @ts-ignore
    this.heartbeatScript = (...args: any[]) =>
      (this.r as any).qHeartbeat(...args);
    // @ts-ignore
    this.cleanupScript = (...args: any[]) => (this.r as any).qCleanup(...args);
    // @ts-ignore
    this.getActiveCountScript = (...args: any[]) =>
      (this.r as any).qGetActiveCount(...args);
    // @ts-ignore
    this.getWaitingCountScript = (...args: any[]) =>
      (this.r as any).qGetWaitingCount(...args);
    // @ts-ignore
    this.getDelayedCountScript = (...args: any[]) =>
      (this.r as any).qGetDelayedCount(...args);
    // @ts-ignore
    this.getActiveJobsScript = (...args: any[]) =>
      (this.r as any).qGetActiveJobs(...args);
    // @ts-ignore
    this.getWaitingJobsScript = (...args: any[]) =>
      (this.r as any).qGetWaitingJobs(...args);
    // @ts-ignore
    this.getDelayedJobsScript = (...args: any[]) =>
      (this.r as any).qGetDelayedJobs(...args);
    // @ts-ignore
    this.getUniqueGroupsScript = (...args: any[]) =>
      (this.r as any).qGetUniqueGroups(...args);
    // @ts-ignore
    this.getUniqueGroupsCountScript = (...args: any[]) =>
      (this.r as any).qGetUniqueGroupsCount(...args);
  }

  async add(opts: EnqueueOptions<T>): Promise<string> {
    const maxAttempts = opts.maxAttempts ?? this.defaultMaxAttempts;
    const orderMs = opts.orderMs ?? Date.now();

    // Handle undefined payload by converting to null for consistent JSON serialization
    const payload = opts.payload === undefined ? null : opts.payload;
    const serializedPayload = JSON.stringify(payload);

    const jobId = await this.enqueueScript(
      opts.groupId,
      serializedPayload,
      String(maxAttempts),
      String(orderMs),
    );
    return jobId;
  }

  async reserve(): Promise<ReservedJob<T> | null> {
    const now = Date.now();
    const raw = await this.reserveScript(
      String(now),
      String(this.vt),
      String(this.scanLimit),
      String(this.orderingDelayMs),
    );
    if (!raw) return null;

    // Parse delimited string response for better performance
    const parts = raw.split('||DELIMITER||');
    if (parts.length !== 10) return null;

    let payload: T;
    try {
      payload = JSON.parse(parts[2]);
    } catch (err) {
      console.warn(
        `Failed to parse job payload: ${(err as Error).message}, raw: ${parts[2]}`,
      );
      payload = null as any;
    }

    return {
      id: parts[0],
      groupId: parts[1],
      payload,
      attempts: Number.parseInt(parts[3], 10),
      maxAttempts: Number.parseInt(parts[4], 10),
      seq: Number.parseInt(parts[5], 10),
      enqueuedAt: Number.parseInt(parts[6], 10),
      orderMs: Number.parseInt(parts[7], 10),
      score: Number(parts[8]),
      deadlineAt: Number.parseInt(parts[9], 10),
    } as ReservedJob<T>;
  }

  async complete(job: { id: string; groupId: string }) {
    await this.completeScript(job.id, job.groupId);
  }

  async retry(jobId: string, backoffMs = 0) {
    return this.retryScript(jobId, String(backoffMs));
  }

  async heartbeat(job: { id: string; groupId: string }, extendMs = this.vt) {
    return this.heartbeatScript(job.id, job.groupId, String(extendMs));
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    return this.cleanupScript(String(now));
  }

  async reserveBlocking(timeoutSec = 5): Promise<ReservedJob<T> | null> {
    // First try immediate reserve (fast path)
    const immediateJob = await this.reserve();
    if (immediateJob) return immediateJob;

    // Use BZPOPMIN on the ready queue for blocking behavior like BullMQ
    const readyKey = nsKey(this.ns, 'ready');
    const markerKey = nsKey(this.ns, 'marker'); // Marker key for blocking

    try {
      // Block until a group becomes available or timeout
      const result = await this.r.bzpopmin(readyKey, timeoutSec);

      if (!result || result.length < 3) {
        return null; // Timeout or no result
      }

      const [, groupId, score] = result;

      // Now try to reserve from this specific group
      // We need to add the group back to ready first since BZPOPMIN removed it
      await this.r.zadd(readyKey, score, groupId);

      // Try to reserve from the queue
      return this.reserve();
    } catch (err) {
      // If blocking fails, fall back to regular reserve
      return this.reserve();
    }
  }

  /**
   * Get the number of jobs currently being processed (active jobs)
   */
  async getActiveCount(): Promise<number> {
    return this.getActiveCountScript();
  }

  /**
   * Get the number of jobs waiting to be processed
   */
  async getWaitingCount(): Promise<number> {
    return this.getWaitingCountScript();
  }

  /**
   * Get the number of jobs delayed due to backoff
   */
  async getDelayedCount(): Promise<number> {
    return this.getDelayedCountScript();
  }

  /**
   * Get the total number of jobs across all states
   */
  async getTotalCount(): Promise<number> {
    const [active, waiting, delayed] = await Promise.all([
      this.getActiveCount(),
      this.getWaitingCount(),
      this.getDelayedCount(),
    ]);
    return active + waiting + delayed;
  }

  /**
   * Get all job counts by state
   */
  async getCounts(): Promise<{
    active: number;
    waiting: number;
    delayed: number;
    total: number;
    uniqueGroups: number;
  }> {
    const [active, waiting, delayed, uniqueGroups] = await Promise.all([
      this.getActiveCount(),
      this.getWaitingCount(),
      this.getDelayedCount(),
      this.getUniqueGroupsCount(),
    ]);
    return {
      active,
      waiting,
      delayed,
      total: active + waiting + delayed,
      uniqueGroups,
    };
  }

  /**
   * Get list of active job IDs
   */
  async getActiveJobs(): Promise<string[]> {
    return this.getActiveJobsScript();
  }

  /**
   * Get list of waiting job IDs
   */
  async getWaitingJobs(): Promise<string[]> {
    return this.getWaitingJobsScript();
  }

  /**
   * Get list of delayed job IDs
   */
  async getDelayedJobs(): Promise<string[]> {
    return this.getDelayedJobsScript();
  }

  /**
   * Get list of unique group IDs that have jobs
   */
  async getUniqueGroups(): Promise<string[]> {
    return this.getUniqueGroupsScript();
  }

  /**
   * Get count of unique groups that have jobs
   */
  async getUniqueGroupsCount(): Promise<number> {
    return this.getUniqueGroupsCountScript();
  }

  /**
   * Get all job IDs by state
   */
  async getJobs(): Promise<{
    active: string[];
    waiting: string[];
    delayed: string[];
  }> {
    const [active, waiting, delayed] = await Promise.all([
      this.getActiveJobs(),
      this.getWaitingJobs(),
      this.getDelayedJobs(),
    ]);
    return {
      active,
      waiting,
      delayed,
    };
  }

  /**
   * Wait for the queue to become empty (no active jobs)
   * @param timeoutMs Maximum time to wait in milliseconds (default: 60 seconds)
   * @returns true if queue became empty, false if timeout reached
   */
  async waitForEmpty(timeoutMs = 60_000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const activeCount = await this.getActiveCount();
      if (activeCount === 0) {
        return true;
      }

      // Wait a bit before checking again
      await sleep(100);
    }

    return false; // Timeout reached
  }

  /**
   * Check for groups that might be ready after their ordering delay has expired.
   * This is a recovery mechanism for groups that were delayed but not re-added to ready queue.
   */
  async recoverDelayedGroups(): Promise<number> {
    if (this.orderingDelayMs <= 0) {
      return 0;
    }

    const script = `
local ns = "${this.ns}"
local now = tonumber(ARGV[1])
local orderingDelayMs = tonumber(ARGV[2])

local recoveredCount = 0
local readyKey = ns .. ":ready"

-- Get all group patterns (simplified approach)
local groupPattern = ns .. ":g:*"
local groups = redis.call("KEYS", groupPattern)

for i = 1, #groups do
  local gZ = groups[i]
  local groupId = string.match(gZ, ":g:(.+)$")
  
  if groupId then
    local lockKey = ns .. ":lock:" .. groupId
    local lockExists = redis.call("EXISTS", lockKey)
    
    -- Only check groups that are not currently locked
    if lockExists == 0 then
      -- Check if this group has jobs and the head job is now eligible
      local head = redis.call("ZRANGE", gZ, 0, 0, "WITHSCORES")
      if head and #head >= 2 then
        local headJobId = head[1]
        local headScore = tonumber(head[2])
        
        -- Check if head job is eligible now
        local jobKey = ns .. ":job:" .. headJobId
        local orderMs = redis.call("HGET", jobKey, "orderMs")
        
        if orderMs then
          local jobOrderMs = tonumber(orderMs)
          local eligibleAt
          
          if jobOrderMs > now then
            -- Future job: process at its orderMs time (no additional delay needed)
            eligibleAt = jobOrderMs
          else
            -- Past job: wait for ordering delay to allow late-arriving events
            eligibleAt = jobOrderMs + orderingDelayMs
          end
          
          if jobOrderMs and (eligibleAt <= now) then
            -- Job is now eligible, add group to ready queue if not already there
            local isInReady = redis.call("ZSCORE", readyKey, groupId)
            
            if not isInReady then
              redis.call("ZADD", readyKey, headScore, groupId)
              recoveredCount = recoveredCount + 1
            end
          end
        end
      end
    end
  end
end

return recoveredCount
    `;

    try {
      const result = (await this.r.eval(
        script,
        0,
        String(Date.now()),
        String(this.orderingDelayMs),
      )) as number;

      return result || 0;
    } catch (error) {
      console.warn('Error in recoverDelayedGroups:', error);
      return 0;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
