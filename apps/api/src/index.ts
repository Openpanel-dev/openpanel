import cors from "@fastify/cors";
import Fastify from "fastify";

import { redisPub } from "@openpanel/redis";

import eventRouter from "./routes/event.router";
import liveRouter from "./routes/live.router";
import miscRouter from "./routes/misc.router";
import profileRouter from "./routes/profile.router";
import { logger, logInfo } from "./utils/logger";

declare module "fastify" {
  interface FastifyRequest {
    projectId: string;
  }
}

const port = parseInt(process.env.API_PORT || "3000", 10);

const startServer = async () => {
  logInfo("Starting server");
  try {
    const fastify = Fastify({
      logger: logger,
    });

    fastify.register(cors, {
      origin: "*",
    });

    fastify.decorateRequest("projectId", "");
    fastify.register(eventRouter, { prefix: "/event" });
    fastify.register(profileRouter, { prefix: "/profile" });
    fastify.register(liveRouter, { prefix: "/live" });
    fastify.register(miscRouter, { prefix: "/misc" });
    fastify.setErrorHandler((error, request, reply) => {
      fastify.log.error(error);
    });
    fastify.get("/", (request, reply) => {
      reply.send({ name: "openpanel sdk api" });
    });
    // fastify.get('/health-check', async (request, reply) => {
    //   try {
    //     await utils.healthCheck()
    //     reply.status(200).send()
    //   } catch (e) {
    //     reply.status(500).send()
    //   }
    // })
    if (process.env.NODE_ENV === "production") {
      for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, (err) => {
          logger.fatal(err, `uncaught exception detected ${signal}`);
          fastify.close().then((err) => {
            process.exit(err ? 1 : 0);
          });
        });
      }
    }

    await fastify.listen({
      host: process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost",
      port,
    });

    // Notify when keys expires
    redisPub.config("SET", "notify-keyspace-events", "Ex");
  } catch (e) {
    console.error(e);
  }
};

startServer();
