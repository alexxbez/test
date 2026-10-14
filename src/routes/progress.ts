import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { jsonResponse, notFound, validationHook } from "../http";
import { idParamSchema, notFoundSchema, progressSummarySchema, validationErrorSchema } from "../schemas";
import { store } from "../store";

export const progressRoutes = new Hono();

progressRoutes.get(
  "/:id/progress",
  describeRoute({
    operationId: "getParentProgress",
    summary: "Resumen de progreso de un padre",
    description:
      "Regresa puntos acumulados, retos completados, racha actual y el detalle de cada registro.",
    tags: ["Progreso"],
    responses: {
      200: jsonResponse("Resumen del padre", progressSummarySchema),
      400: jsonResponse("id no es un UUID válido", validationErrorSchema),
      404: jsonResponse("Padre inexistente", notFoundSchema),
    },
  }),
  validator("param", idParamSchema, validationHook("path parameter")),
  (c) => {
    const { id } = c.req.valid("param");
    const summary = store.getProgressSummary(id);
    if (!summary) return notFound(c, `Parent ${id} does not exist`);
    return c.json(summary);
  },
);
