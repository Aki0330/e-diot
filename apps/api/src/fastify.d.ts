import type { Database } from "@cyberbudget/db";
import type { AppConfig, JwtClaims } from "@cyberbudget/shared";

import type { AgentRunner } from "./plugins/agent.js";

declare module "fastify" {
  interface FastifyInstance {
    readonly config: AppConfig;
    readonly db: Database;
    readonly agent: AgentRunner;
    readonly authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user: JwtClaims | null;
  }
}

export {};
