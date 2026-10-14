import { beforeEach, describe, expect, test } from "bun:test";
import { app } from "../src/index";
import { store } from "../src/store";

const BASE = "http://localhost";

async function request(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`${BASE}${path}`, init));
}

async function requestJson(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await request(path, init);
  return { status: res.status, body: await res.json() };
}

const postJson = (path: string, body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  store.reset();
});

describe("health", () => {
  test("GET /health responde 200", async () => {
    const { status, body } = await requestJson("/health");
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.uptimeSeconds).toBe("number");
  });
});

describe("GET /api/challenges", () => {
  test("regresa todos los retos sembrados", async () => {
    const { status, body } = await requestJson("/api/challenges");
    expect(status).toBe(200);
    expect(body.total).toBe(3);
    expect(body.challenges).toHaveLength(3);
  });

  test("respeta limit sin alterar total", async () => {
    const { body } = await requestJson("/api/challenges?limit=2");
    expect(body.challenges).toHaveLength(2);
    expect(body.total).toBe(3);
  });

  test("filtra completed=false (sin progreso registrado)", async () => {
    const { body } = await requestJson("/api/challenges?completed=false");
    expect(body.total).toBe(1);
  });

  test("400 con limit fuera de rango", async () => {
    const { status, body } = await requestJson("/api/challenges?limit=999");
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
    expect(body.issues[0].path).toBe("limit");
  });
});

describe("GET /api/challenges/:id", () => {
  test("regresa el reto por id", async () => {
    const list = await requestJson("/api/challenges");
    const first = list.body.challenges[0];
    const { status, body } = await requestJson(`/api/challenges/${first.id}`);
    expect(status).toBe(200);
    expect(body.id).toBe(first.id);
    expect(body.title).toBe(first.title);
  });

  test("404 si el reto no existe", async () => {
    const { status, body } = await requestJson(`/api/challenges/${crypto.randomUUID()}`);
    expect(status).toBe(404);
    expect(body.error).toBe("not_found");
  });

  test("400 si el id no es UUID", async () => {
    const { status, body } = await requestJson("/api/challenges/not-a-uuid");
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
  });
});

describe("POST /api/challenges", () => {
  test("crea un reto y responde 201 con UUID", async () => {
    const { status, body } = await requestJson(
      "/api/challenges",
      postJson("/api/challenges", {
        title: "Leer un cuento",
        description: "Lee 10 minutos con tu hijo.",
        difficulty: "facil",
        points: 10,
      }),
    );
    expect(status).toBe(201);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.active).toBe(true);

    const list = await requestJson("/api/challenges");
    expect(list.body.total).toBe(4);
  });

  test("400 con cuerpo inválido y detalle por campo", async () => {
    const { status, body } = await requestJson(
      "/api/challenges",
      postJson("/api/challenges", {
        title: "",
        description: "ok",
        difficulty: "extremo",
        points: 0,
      }),
    );
    expect(status).toBe(400);
    expect(body.error).toBe("validation_failed");
    const paths = body.issues.map((i: any) => i.path);
    expect(paths).toContain("title");
    expect(paths).toContain("points");
  });
});

describe("POST /api/challenges/:id/progress", () => {
  test("registra progreso y suma los puntos del reto", async () => {
    const list = await requestJson("/api/challenges");
    const challenge = list.body.challenges[0];
    const parent = store.listParents()[0]!;

    const { status, body } = await requestJson(
      `/api/challenges/${challenge.id}/progress`,
      postJson("", { parentId: parent.id, evidenceNote: "Hoy sí lo aplicamos" }),
    );
    expect(status).toBe(201);
    expect(body.challengeId).toBe(challenge.id);
    expect(body.pointsEarned).toBe(challenge.points);
  });

  test("409 si ya se registró el mismo día", async () => {
    const list = await requestJson("/api/challenges");
    const challenge = list.body.challenges[2];
    const parent = store.listParents()[1]!;
    const payload = postJson("", { parentId: parent.id, evidenceNote: "Primera vez" });

    const first = await requestJson(`/api/challenges/${challenge.id}/progress`, payload);
    expect(first.status).toBe(201);

    const second = await requestJson(
      `/api/challenges/${challenge.id}/progress`,
      postJson("", { parentId: parent.id, evidenceNote: "Otra vez hoy" }),
    );
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("already_completed");
  });

  test("404 si el padre no existe", async () => {
    const list = await requestJson("/api/challenges");
    const challenge = list.body.challenges[0];
    const { status, body } = await requestJson(
      `/api/challenges/${challenge.id}/progress`,
      postJson("", { parentId: crypto.randomUUID(), evidenceNote: "x" }),
    );
    expect(status).toBe(404);
    expect(body.message).toContain("Parent");
  });
});

describe("GET /api/parents/:id/progress", () => {
  test("regresa el resumen del padre sembrado", async () => {
    const parent = store.listParents()[0]!;
    const { status, body } = await requestJson(`/api/parents/${parent.id}/progress`);
    expect(status).toBe(200);
    expect(body.parentId).toBe(parent.id);
    expect(body.completedCount).toBe(2);
    expect(body.totalPoints).toBe(25);
    expect(body.streakDays).toBe(2);
  });

  test("404 si el padre no existe", async () => {
    const { status } = await requestJson(`/api/parents/${crypto.randomUUID()}/progress`);
    expect(status).toBe(404);
  });
});

describe("OpenAPI", () => {
  test("expone el spec con todas las rutas", async () => {
    const { status, body } = await requestJson("/openapi.json");
    expect(status).toBe(200);
    const paths = Object.keys(body.paths);
    expect(paths).toContain("/api/challenges");
    expect(paths).toContain("/api/challenges/{id}");
    expect(paths).toContain("/api/challenges/{id}/progress");
    expect(paths).toContain("/api/parents/{id}/progress");
    expect(body.components.schemas.Challenge).toBeDefined();
  });
});
