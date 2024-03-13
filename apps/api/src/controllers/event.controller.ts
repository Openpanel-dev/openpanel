import { logger, logInfo, noop } from "@/utils/logger";
import { getClientIp, parseIp } from "@/utils/parseIp";
import { getReferrerWithQuery, parseReferrer } from "@/utils/parseReferrer";
import { isUserAgentSet, parseUserAgent } from "@/utils/parseUserAgent";
import { isSameDomain, parsePath } from "@/utils/url";
import type { FastifyReply, FastifyRequest } from "fastify";
import { omit } from "ramda";
import { v4 as uuid } from "uuid";

import { generateDeviceId, getTime, toISOString } from "@openpanel/common";
import type { IServiceCreateEventPayload } from "@openpanel/db";
import { createEvent, getEvents, getSalts } from "@openpanel/db";
import type { JobsOptions } from "@openpanel/queue";
import { eventsQueue } from "@openpanel/queue";
import { findJobByPrefix } from "@openpanel/queue/src/utils";
import type { PostEventPayload } from "@openpanel/sdk";

const SESSION_TIMEOUT = 1000 * 60 * 30;
const SESSION_END_TIMEOUT = SESSION_TIMEOUT + 1000;

async function withTiming<T>(name: string, promise: T) {
  try {
    const start = Date.now();
    const res = await promise;
    const end = Date.now();
    if (end - start > 1000) {
      logInfo(`${name} took too long: ${end - start}ms`);
    }
    return res;
  } catch (error) {
    logger.error(error, `Failed to execute ${name}`);
    throw error;
  }
}

function createContextLogger(request: FastifyRequest) {
  const _log = request.log.child({
    requestId: request.id,
    requestUrl: request.url,
    headers: request.headers,
    projectId: request.projectId,
  });
  let obj: Record<string, unknown> = {};
  return {
    add: (key: string, value: unknown) => (obj[key] = value),
    addObject: (key: string, value: Record<string, unknown>) => {
      obj = { ...obj, ...value };
    },
    send: (message: string, value: Record<string, unknown>) =>
      _log.info({ ...obj, ...value }, message),
  };
}

export async function postEvent(
  request: FastifyRequest<{
    Body: PostEventPayload;
  }>,
  reply: FastifyReply,
) {
  const contextLogger = createContextLogger(request);
  let deviceId: string | null = null;
  const { projectId, body } = request;
  const properties = body.properties ?? {};
  const getProperty = (name: string): string | undefined => {
    // replace thing is just for older sdks when we didn't have `__`
    // remove when kiddokitchen app (24.09.02) is not used anymore
    return (
      ((properties[name] || properties[name.replace("__", "")]) as
        | string
        | null
        | undefined) ?? undefined
    );
  };
  const profileId = body.profileId ?? "";
  const createdAt = new Date(body.timestamp);
  const url = getProperty("__path");
  const { path, hash, query } = parsePath(url);
  const referrer = isSameDomain(getProperty("__referrer"), url)
    ? null
    : parseReferrer(getProperty("__referrer"));
  const utmReferrer = getReferrerWithQuery(query);
  const ip = getClientIp(request)!;
  const origin = request.headers.origin!;
  const ua = request.headers["user-agent"]!;
  const uaInfo = parseUserAgent(ua);
  const salts = await getSalts();
  const currentDeviceId = generateDeviceId({
    salt: salts.current,
    origin,
    ip,
    ua,
  });
  const previousDeviceId = generateDeviceId({
    salt: salts.previous,
    origin,
    ip,
    ua,
  });

  const isServerEvent = isUserAgentSet(ua);

  if (isServerEvent) {
    const [event] = await withTiming(
      "Get last event (server-event)",
      getEvents(
        `SELECT * FROM events WHERE name = 'screen_view' AND profile_id = '${profileId}' AND project_id = '${projectId}' ORDER BY created_at DESC LIMIT 1`,
      ),
    );

    const payload: Omit<IServiceCreateEventPayload, "id"> = {
      name: body.name,
      deviceId: event?.deviceId || "",
      sessionId: event?.sessionId || "",
      profileId,
      projectId,
      properties: Object.assign(
        {},
        omit(["__path", "__referrer"], properties),
        {
          hash,
          query,
        },
      ),
      createdAt,
      country: event?.country ?? "",
      city: event?.city ?? "",
      region: event?.region ?? "",
      continent: event?.continent ?? "",
      os: event?.os ?? "",
      osVersion: event?.osVersion ?? "",
      browser: event?.browser ?? "",
      browserVersion: event?.browserVersion ?? "",
      device: event?.device ?? "",
      brand: event?.brand ?? "",
      model: event?.model ?? "",
      duration: 0,
      path: event?.path ?? "",
      referrer: event?.referrer ?? "",
      referrerName: event?.referrerName ?? "",
      referrerType: event?.referrerType ?? "",
      profile: undefined,
      meta: undefined,
    }

    contextLogger.send("server event is queued", {
      ip,
      origin,
      ua,
      uaInfo,
      referrer,
      profileId,
      projectId,
      deviceId,
      path,
      payload,
      prevEvent: event,
    });

    eventsQueue.add("event", {
      type: "createEvent",
      payload,
    });
    return reply.status(200).send("");
  }

  const [geo, sessionEndJobCurrentDeviceId, sessionEndJobPreviousDeviceId] =
    await withTiming(
      "Get geo and jobs from queue",
      Promise.all([
        parseIp(ip),
        findJobByPrefix(
          eventsQueue,
          `sessionEnd:${projectId}:${currentDeviceId}:`,
        ),
        findJobByPrefix(
          eventsQueue,
          `sessionEnd:${projectId}:${previousDeviceId}:`,
        ),
      ]),
    );

  const createSessionStart =
    !sessionEndJobCurrentDeviceId && !sessionEndJobPreviousDeviceId;

  if (sessionEndJobCurrentDeviceId && !sessionEndJobPreviousDeviceId) {
    deviceId = currentDeviceId;
    const diff = Date.now() - sessionEndJobCurrentDeviceId.timestamp;
    sessionEndJobCurrentDeviceId.changeDelay(diff + SESSION_END_TIMEOUT);
  } else if (!sessionEndJobCurrentDeviceId && sessionEndJobPreviousDeviceId) {
    deviceId = previousDeviceId;
    const diff = Date.now() - sessionEndJobPreviousDeviceId.timestamp;
    sessionEndJobPreviousDeviceId.changeDelay(diff + SESSION_END_TIMEOUT);
  } else {
    deviceId = currentDeviceId;
    // Queue session end
    eventsQueue.add(
      "event",
      {
        type: "createSessionEnd",
        payload: {
          deviceId,
        },
      },
      {
        delay: SESSION_END_TIMEOUT,
        jobId: `sessionEnd:${projectId}:${deviceId}:${Date.now()}`,
      },
    );
  }

  const [[sessionStartEvent], prevEventJob] = await withTiming(
    "Get session start event",
    Promise.all([
      getEvents(
        `SELECT * FROM events WHERE name = 'session_start' AND device_id = '${deviceId}' AND project_id = '${projectId}' ORDER BY created_at DESC LIMIT 1`,
      ),
      findJobByPrefix(eventsQueue, `event:${projectId}:${deviceId}:`),
    ]),
  );

  const payload: Omit<IServiceCreateEventPayload, "id"> = {
    name: body.name,
    deviceId,
    profileId,
    projectId,
    sessionId: createSessionStart ? uuid() : sessionStartEvent?.sessionId ?? "",
    properties: Object.assign({}, omit(["__path", "__referrer"], properties), {
      hash,
      query,
    }),
    createdAt,
    country: geo.country,
    city: geo.city,
    region: geo.region,
    continent: geo.continent,
    os: uaInfo.os,
    osVersion: uaInfo.osVersion,
    browser: uaInfo.browser,
    browserVersion: uaInfo.browserVersion,
    device: uaInfo.device,
    brand: uaInfo.brand,
    model: uaInfo.model,
    duration: 0,
    path: path,
    referrer: referrer?.url,
    referrerName: referrer?.name ?? utmReferrer?.name ?? "",
    referrerType: referrer?.type ?? utmReferrer?.type ?? "",
    profile: undefined,
    meta: undefined,
  };

  const isDelayed = prevEventJob ? await prevEventJob?.isDelayed() : false;

  if (isDelayed && prevEventJob && prevEventJob.data.type === "createEvent") {
    const prevEvent = prevEventJob.data.payload;
    const duration = getTime(payload.createdAt) - getTime(prevEvent.createdAt);
    contextLogger.add("prevEvent", prevEvent);

    // Set path from prev screen_view event if current event is not a screen_view
    if (payload.name != "screen_view") {
      payload.path = prevEvent.path;
    }

    if (payload.name === "screen_view") {
      if (duration < 0) {
        contextLogger.send("duration is wrong", {
          payload,
          duration,
        });
      } else {
        // Skip update duration if it's wrong
        // Seems like request is not in right order
        await withTiming(
          "Update previous job with duration",
          prevEventJob.updateData({
            type: "createEvent",
            payload: {
              ...prevEvent,
              duration,
            },
          }),
        );
      }

      await withTiming("Promote previous job", prevEventJob.promote());
    }
  } else if (payload.name !== "screen_view") {
    contextLogger.send("no previous job", {
      prevEventJob,
      payload,
    });
  }

  if (createSessionStart) {
    // We do not need to queue session_start
    await withTiming(
      "Create session start event",
      createEvent({
        ...payload,
        name: "session_start",
        // @ts-expect-error
        createdAt: toISOString(getTime(payload.createdAt) - 100),
      }),
    );
  }

  const options: JobsOptions = {};
  if (payload.name === "screen_view") {
    options.delay = SESSION_TIMEOUT;
    options.jobId = `event:${projectId}:${deviceId}:${Date.now()}`;
  }

  contextLogger.send("event is queued", {
    ip,
    origin,
    ua,
    uaInfo,
    referrer,
    profileId,
    projectId,
    deviceId,
    geo,
    sessionStartEvent,
    path,
    payload,
  });

  // Queue current event
  eventsQueue
    .add(
      "event",
      {
        type: "createEvent",
        payload,
      },
      options,
    )
    .catch(noop("Failed to queue event"));

  reply.status(202).send(deviceId);
}
