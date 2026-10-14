import type { Context, Next } from "hono";

export function requestLogger() {
  return async (c: Context, next: Next) => {
    const start = performance.now();
    await next();
    const durationMs = (performance.now() - start).toFixed(1);
    console.log(`[req] ${c.req.method} ${c.req.path} -> ${c.res.status} (${durationMs}ms)`);
  };
}
