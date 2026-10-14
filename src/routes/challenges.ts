import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { conflict, jsonResponse, notFound, validationHook } from "../http";
import {
  idParamSchema,
  challengeListSchema,
  challengeSchema,
  conflictSchema,
  createChallengeSchema,
  listChallengesQuerySchema,
  notFoundSchema,
  progressEntrySchema,
  submitProgressSchema,
  validationErrorSchema,
} from "../schemas";
import { store } from "../store";

export const challengeRoutes = new Hono();

challengeRoutes.get(
  "/",
  describeRoute({
    operationId: "listChallenges",
    summary: "Listar retos disponibles",
    description:
      "Regresa los retos en memoria. Soporta filtro por retos completados y limitar el resultado.",
    tags: ["Retos"],
    responses: {
      200: jsonResponse("Lista de retos", challengeListSchema),
      400: jsonResponse("Parámetros de consulta inválidos", validationErrorSchema),
    },
  }),
  validator("query", listChallengesQuerySchema, validationHook("query parameters")),
  (c) => {
    const query = c.req.valid("query");
    const { challenges, total } = store.listChallenges({
      completed: query.completed,
      parentId: query.parentId,
      limit: query.limit,
    });
    return c.json({ challenges, total });
  },
);

challengeRoutes.get(
  "/:id",
  describeRoute({
    operationId: "getChallenge",
    summary: "Obtener un reto por id",
    tags: ["Retos"],
    responses: {
      200: jsonResponse("El reto", challengeSchema),
      400: jsonResponse("id no es un UUID válido", validationErrorSchema),
      404: jsonResponse("Reto inexistente", notFoundSchema),
    },
  }),
  validator("param", idParamSchema, validationHook("path parameter")),
  (c) => {
    const { id } = c.req.valid("param");
    const challenge = store.getChallenge(id);
    if (!challenge) return notFound(c, `Challenge ${id} does not exist`);
    return c.json(challenge);
  },
);

challengeRoutes.post(
  "/",
  describeRoute({
    operationId: "createChallenge",
    summary: "Crear un reto",
    description: "El servidor genera el id (UUID v4) y responde 201 con el reto creado.",
    tags: ["Retos"],
    responses: {
      201: jsonResponse("Reto creado", challengeSchema),
      400: jsonResponse("Cuerpo inválido", validationErrorSchema),
    },
  }),
  validator("json", createChallengeSchema, validationHook("request body")),
  (c) => {
    const body = c.req.valid("json");
    const challenge = store.createChallenge(body);
    return c.json(challenge, 201);
  },
);

challengeRoutes.post(
  "/:id/progress",
  describeRoute({
    operationId: "submitProgress",
    summary: "Registrar el progreso diario de un padre en un reto",
    description:
      "Un padre puede registrar una sola vez por día UTC un reto. Devuelve 409 si ya registró hoy.",
    tags: ["Progreso"],
    responses: {
      201: jsonResponse("Progreso registrado", progressEntrySchema),
      400: jsonResponse("Cuerpo o parámetros inválidos", validationErrorSchema),
      404: jsonResponse("Reto o padre inexistente", notFoundSchema),
      409: jsonResponse("Ya registrado hoy", conflictSchema),
    },
  }),
  validator("param", idParamSchema, validationHook("path parameter")),
  validator("json", submitProgressSchema, validationHook("request body")),
  (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = store.submitProgress(id, body);

    if (!result.ok) {
      if (result.reason === "challenge_not_found") {
        return notFound(c, `Challenge ${id} does not exist`);
      }
      if (result.reason === "parent_not_found") {
        return notFound(c, `Parent ${body.parentId} does not exist`);
      }
      return conflict(c, `${body.parentId} already submitted progress for ${id} today`);
    }

    return c.json(result.entry, 201);
  },
);
