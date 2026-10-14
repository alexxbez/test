import type { Context } from "hono";
import { resolver } from "hono-openapi";
import type { z } from "zod";

type IssueLike = {
  message: string;
  path?: readonly (PropertyKey | { key: PropertyKey })[];
};

function formatPath(path: IssueLike["path"]): string {
  if (!path) return "";
  return path
    .map((segment) =>
      typeof segment === "object" && segment !== null && "key" in segment
        ? String(segment.key)
        : String(segment),
    )
    .join(".");
}

export function jsonResponse<T extends z.ZodType>(description: string, schema: T) {
  return {
    description,
    content: { "application/json": { schema: resolver(schema) } },
  } as const;
}

export function validationHook(label: string) {
  return (
    result:
      | { success: true; data: unknown }
      | { success: false; error: readonly IssueLike[] },
    c: Context,
  ) => {
    if (result.success) return;
    return c.json(
      {
        error: "validation_failed" as const,
        message: `Invalid ${label}`,
        issues: result.error.map((issue) => ({
          path: formatPath(issue.path),
          message: issue.message,
        })),
      },
      400,
    );
  };
}

export const notFound = (c: Context, message: string) =>
  c.json({ error: "not_found" as const, message }, 404);

export const conflict = (c: Context, message: string) =>
  c.json({ error: "already_completed" as const, message }, 409);
