import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { describeRoute, openAPIRouteHandler } from "hono-openapi";
import { requestLogger } from "./logger";
import { jsonResponse } from "./http";
import { challengeRoutes } from "./routes/challenges";
import { progressRoutes } from "./routes/progress";
import { healthSchema } from "./schemas";

const startedAt = Date.now();

export const app = new Hono();

app.use("*", requestLogger());

app.get(
  "/health",
  describeHealth(),
  (c) => c.json({ status: "ok" as const, uptimeSeconds: (Date.now() - startedAt) / 1000 }),
);

app.route("/api/challenges", challengeRoutes);
app.route("/api/parents", progressRoutes);

app.get(
  "/openapi.json",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "Creciendo + API",
        version: "0.1.0",
        description:
          "Backend de prueba para practicar GET y POST desde la app iOS de seguimiento de retos (Grupo Nutriendo). " +
          "Sin base de datos: todo vive en memoria y cada operación se imprime en la consola.",
      },
    },
  }),
);

app.get("/docs", Scalar({ theme: "saturn", url: "/openapi.json" }));

app.notFound((c) =>
  c.json({ error: "not_found", message: `Route ${c.req.method} ${c.req.path} does not exist` }, 404),
);

function describeHealth() {
  return describeRoute({
    operationId: "health",
    summary: "Health check",
    tags: ["General"],
    responses: { 200: jsonResponse("Servidor vivo", healthSchema) },
  });
}

export default app;
