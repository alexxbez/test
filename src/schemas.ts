import { z } from "zod";

const uuid = z.uuid().meta({
  description: "UUID v4 generado por el servidor",
  examples: ["550e8400-e29b-41d4-a716-446655440000"],
});

const isoDateTime = z.iso.datetime({ offset: true }).meta({
  description: "Fecha y hora en formato ISO 8601 con offset",
  examples: ["2026-10-14T18:30:00Z"],
});

export const difficultySchema = z.enum(["facil", "medio", "dificil"]).meta({
  description: "Nivel de dificultad del reto",
  examples: ["facil"],
});

export const challengeSchema = z
  .object({
    id: uuid,
    title: z.string().min(1).max(120).meta({ examples: ["Plato del día con verduras"] }),
    description: z
      .string()
      .min(1)
      .max(500)
      .meta({ examples: ["Prepara una comida con al menos 2 verduras."] }),
    difficulty: difficultySchema,
    points: z
      .int()
      .min(1)
      .max(100)
      .meta({ description: "Puntos que otorga el reto", examples: [10] }),
    active: z.boolean().meta({ description: "Si el reto está visible para los padres" }),
  })
  .meta({ ref: "Challenge", description: "Un reto diario para los padres" });

export const createChallengeSchema = z
  .object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    difficulty: difficultySchema,
    points: z.int().min(1).max(100),
    active: z.boolean().optional().default(true),
  })
  .meta({ ref: "CreateChallengeRequest", description: "Cuerpo para crear un reto" });

export const challengeListSchema = z
  .object({
    challenges: z.array(challengeSchema),
    total: z.int().min(0).meta({ description: "Retos que coinciden con el filtro, antes del limit" }),
  })
  .meta({ ref: "ChallengeList" });

export const listChallengesQuerySchema = z.object({
  completed: z
    .stringbool()
    .optional()
    .meta({
      description:
        "Si es true, solo retos con progreso registrado; si es false, solo los que no tienen. Sin parámetro, regresa todos.",
    }),
  parentId: uuid
    .optional()
    .meta({ description: "Limita el filtro completed a un padre específico" }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .meta({ description: "Máximo de retos a regresar (1-50)" }),
});

export const idParamSchema = z.object({ id: uuid });

export const submitProgressSchema = z
  .object({
    parentId: uuid,
    evidenceNote: z
      .string()
      .min(1)
      .max(500)
      .meta({ description: "Descripción de cómo se aplicó el reto", examples: ["Hoy sí hicimos el plato con brócoli"] }),
    completedAt: isoDateTime
      .optional()
      .meta({ description: "Cuándo se completó el reto. Por defecto, la hora del servidor." }),
  })
  .meta({ ref: "SubmitProgressRequest", description: "Registro diario de progreso de un padre" });

export const progressEntrySchema = z
  .object({
    id: uuid,
    challengeId: uuid,
    parentId: uuid,
    evidenceNote: z.string(),
    completedAt: isoDateTime,
    pointsEarned: z.int().min(0),
    createdAt: isoDateTime,
  })
  .meta({ ref: "ProgressEntry" });

export const progressSummarySchema = z
  .object({
    parentId: uuid,
    totalPoints: z.int().min(0),
    completedCount: z.int().min(0),
    streakDays: z
      .int()
      .min(0)
      .meta({ description: "Días consecutivos (UTC) con al menos un registro" }),
    entries: z.array(
      z
        .object({
          id: uuid,
          challengeId: uuid,
          evidenceNote: z.string(),
          completedAt: isoDateTime,
          pointsEarned: z.int().min(0),
        })
        .meta({ ref: "ProgressEntrySummary" }),
    ),
  })
  .meta({ ref: "ProgressSummary" });

export const healthSchema = z
  .object({
    status: z.literal("ok"),
    uptimeSeconds: z.number(),
  })
  .meta({ ref: "Health" });

export const validationErrorSchema = z
  .object({
    error: z.literal("validation_failed"),
    message: z.string(),
    issues: z.array(
      z.object({
        path: z.string().meta({ examples: ["points"] }),
        message: z.string(),
      }),
    ),
  })
  .meta({ ref: "ValidationError" });

export const notFoundSchema = z
  .object({
    error: z.literal("not_found"),
    message: z.string(),
  })
  .meta({ ref: "NotFound" });

export const conflictSchema = z
  .object({
    error: z.literal("already_completed"),
    message: z.string(),
  })
  .meta({ ref: "ConflictError" });
