// Walks every project day by day, hour by hour, and turns each planned
// session into rows. Sessions are produced in time order per project so the
// returning-visitor pool never hands out a visitor from the future.

import type { Archetype } from './archetypes/archetype';
import { Journey } from './archetypes/archetype';
import { CAMPAIGNS, type Campaign } from './data/referrers';
import { Rng } from './rng';
import { buildSessionRows } from './rows';
import type { RowSink } from './sink';
import { TrafficModel } from './traffic';
import { World } from './world';

export interface ProjectTarget {
  archetype: Archetype;
  projectId: string;
}

export interface GenerateConfig {
  seed: number;
  /** Sessions per day across all projects; each archetype takes its `trafficShare`. */
  sessionsPerDay: number;
  days: number;
  now: Date;
  variance: number;
  projects: readonly ProjectTarget[];
}

export interface DayPlan {
  archetype: Archetype;
  date: Date;
  sessions: number;
}

export interface ProjectStats {
  projectId: string;
  sessions: number;
  events: number;
  firstEventAt: Date | null;
}

export interface Progress {
  day: string;
  sessions: number;
  events: number;
}

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const HOURS_PER_DAY = 24;
const SECONDS_PER_HOUR = 3600;
const PROGRESS_EVERY_SESSIONS = 5000;

function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function trafficModel(
  config: GenerateConfig,
  archetype: Archetype
): TrafficModel {
  return new TrafficModel(archetype.id, archetype.shape, {
    seed: String(config.seed),
    variance: config.variance,
    now: config.now,
  });
}

/** The days the run covers, oldest first, each ending before `now`. */
function daysOf(config: GenerateConfig): Date[] {
  const today = utcMidnight(config.now);
  const days: Date[] = [];
  for (let offset = config.days - 1; offset >= 0; offset--) {
    days.push(new Date(today.getTime() - offset * MS_PER_DAY));
  }
  return days;
}

export function planDays(config: GenerateConfig): DayPlan[] {
  const plan: DayPlan[] = [];
  for (const { archetype } of config.projects) {
    const model = trafficModel(config, archetype);
    const base = config.sessionsPerDay * archetype.trafficShare;
    for (const date of daysOf(config)) {
      plan.push({
        archetype,
        date,
        sessions: model.dayFor(date, base).visitors,
      });
    }
  }
  return plan;
}

function utmFor(campaign: Campaign): Record<string, string> {
  return {
    utm_source: campaign.source,
    utm_medium: campaign.medium,
    utm_campaign: campaign.name,
  };
}

/** Session start times within one UTC day, following the archetype's local-hour curve. */
function sessionStarts(
  rng: Rng,
  model: TrafficModel,
  archetype: Archetype,
  date: Date,
  total: number,
  now: Date
): Date[] {
  const weights = model.hourWeights(date);
  const starts: Date[] = [];
  for (let utcHour = 0; utcHour < HOURS_PER_DAY; utcHour++) {
    const localHour =
      (((utcHour + archetype.utcOffsetHours) % HOURS_PER_DAY) + HOURS_PER_DAY) %
      HOURS_PER_DAY;
    const count = rng.poisson(total * (weights[localHour] ?? 0));
    for (let i = 0; i < count; i++) {
      const start = new Date(
        date.getTime() +
          utcHour * MS_PER_HOUR +
          rng.int(0, SECONDS_PER_HOUR - 1) * 1000
      );
      if (start.getTime() < now.getTime()) {
        starts.push(start);
      }
    }
  }
  return starts.sort((a, b) => a.getTime() - b.getTime());
}

export async function generate(
  config: GenerateConfig,
  sink: RowSink,
  onProgress: (progress: Progress) => void
): Promise<ProjectStats[]> {
  const stats: ProjectStats[] = [];
  const days = daysOf(config);
  let sessionsSinceProgress = 0;

  for (const { archetype, projectId } of config.projects) {
    const model = trafficModel(config, archetype);
    const base = config.sessionsPerDay * archetype.trafficShare;
    const world = new World(
      archetype,
      projectId,
      days[0] ?? config.now,
      (rows) => sink.addProfiles(rows)
    );
    const projectStats: ProjectStats = {
      projectId,
      sessions: 0,
      events: 0,
      firstEventAt: null,
    };

    for (const date of days) {
      const dayKey = date.toISOString().slice(0, 10);
      const rng = new Rng(`${config.seed}/${archetype.id}/${dayKey}`);
      const planned = model.dayFor(date, base).visitors;

      for (const [index, start] of sessionStarts(
        rng,
        model,
        archetype,
        date,
        planned,
        config.now
      ).entries()) {
        const visitor = world.pick(rng, start);
        const referrer = rng.pick(archetype.referrers);
        const utm = rng.chance(archetype.campaignChance)
          ? utmFor(rng.pick(CAMPAIGNS))
          : {};
        // A returning identified user is recognised from the first event; a first visit starts anonymous.
        const journey = new Journey(
          rng,
          start,
          archetype.dwellMedianSeconds,
          visitor.identified ? visitor.person : null
        );
        archetype.journey(rng, journey, visitor);
        if (journey.events.length === 0) {
          continue;
        }

        const rows = buildSessionRows(rng, {
          id: rng.sessionId(),
          projectId,
          archetype,
          visitor,
          referrer,
          utm,
          events: journey.events,
        });
        world.touch(visitor, rows.endedAt, {
          identified: rows.identified,
          anonymousEvents: rows.anonymousEvents,
        });
        sink.addEvents(rows.events);
        sink.addSession(rows.session);

        projectStats.sessions += 1;
        projectStats.events += rows.events.length;
        projectStats.firstEventAt ??= start;
        sessionsSinceProgress += 1;
        if (sessionsSinceProgress >= PROGRESS_EVERY_SESSIONS || index === 0) {
          sessionsSinceProgress = 0;
          const counts = sink.counts();
          onProgress({
            day: `${archetype.id} ${dayKey}`,
            sessions: counts.sessions,
            events: counts.events,
          });
        }
        await sink.flushFull();
      }
    }

    world.drain();
    stats.push(projectStats);
  }

  await sink.flush();
  return stats;
}
