# Creciendo + API (backend de práctica)

Backend mínimo para practicar **GET** y **POST** desde una app iOS en Swift.
Pensado para el proyecto de Quinto Estilo / Grupo Nutriendo (seguimiento de retos de padres).

- **Bun + Hono + Zod + OpenAPI (hono-openapi) + Scalar**
- **Sin base de datos**: todo vive en memoria y cada operación se imprime en consola.
- Documentación interactiva generada a partir de los mismos esquemas que validan los requests.

## Cómo correrlo

```bash
bun install
bun run dev        # http://localhost:3000 con recarga automática
```

- API: <http://localhost:3000>
- Docs interactivas (Scalar): <http://localhost:3000/docs>
- OpenAPI spec: <http://localhost:3000/openapi.json>

Otros comandos:

```bash
bun test           # 16 pruebas de integración
bun run typecheck  # tsc --noEmit
```

## Endpoints

| Método | Ruta | Qué enseña |
| --- | --- | --- |
| GET | `/health` | GET más simple |
| GET | `/api/challenges` | query params (`completed`, `parentId`, `limit`) |
| GET | `/api/challenges/:id` | path param + 404 + 400 (UUID inválido) |
| POST | `/api/challenges` | body JSON → 201 + 400 con detalle de campos |
| POST | `/api/challenges/:id/progress` | body + path param + 404 + 409 |
| GET | `/api/parents/:id/progress` | respuesta calculada (resumen) |

Los datos se reinician cada vez que se reinicia el servidor. Hay 3 retos y 2 padres sembrados.

> Para probar el progreso necesitas un `parentId` válido. Los ids cambian en cada arranque:
> míralos en los logs (`[store] seeded ...`) o agrega temporalmente un `console.log(store.listParents())`.

## Ejemplos con curl

```bash
# GET lista (todos)
curl localhost:3000/api/challenges

# GET lista filtrada
curl "localhost:3000/api/challenges?completed=false&limit=2"

# GET uno
curl localhost:3000/api/challenges/<id>

# POST crear reto
curl -X POST localhost:3000/api/challenges \
  -H 'content-type: application/json' \
  -d '{"title":"Leer un cuento","description":"Lee 10 minutos con tu hijo.","difficulty":"facil","points":10}'

# POST progreso diario
curl -X POST localhost:3000/api/challenges/<id>/progress \
  -H 'content-type: application/json' \
  -d '{"parentId":"<uuid>","evidenceNote":"Hoy sí lo aplicamos"}'

# GET resumen
curl localhost:3000/api/parents/<uuid>/progress
```

## Contratos (request / response)

### GET /health

```json
{ "status": "ok", "uptimeSeconds": 12.4 }
```

### GET /api/challenges

Query: `completed` (bool, opcional), `parentId` (UUID, opcional), `limit` (1–50, opcional).

```json
{
  "challenges": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Plato del día con verduras",
      "description": "Prepara una comida con al menos 2 verduras y comparte una foto.",
      "difficulty": "facil",
      "points": 10,
      "active": true
    }
  ],
  "total": 3
}
```

### GET /api/challenges/:id

`200` → un objeto reto (misma forma que arriba).

```json
// 404
{ "error": "not_found", "message": "Challenge <id> does not exist" }
```

### POST /api/challenges

```json
// request
{
  "title": "Leer un cuento",
  "description": "Lee 10 minutos con tu hijo.",
  "difficulty": "facil",   // "facil" | "medio" | "dificil"
  "points": 10,            // 1–100
  "active": true           // opcional, default true
}

// 201
{ "id": "<uuid generado>", "title": "...", "description": "...", "difficulty": "facil", "points": 10, "active": true }

// 400
{
  "error": "validation_failed",
  "message": "Invalid request body",
  "issues": [{ "path": "points", "message": "Too small: expected number to be >=1" }]
}
```

### POST /api/challenges/:id/progress

```json
// request
{
  "parentId": "<uuid>",
  "evidenceNote": "Hoy sí hicimos el plato con brócoli",
  "completedAt": "2026-10-14T18:30:00Z"   // opcional, default = hora del servidor
}

// 201
{
  "id": "<uuid>",
  "challengeId": "<uuid>",
  "parentId": "<uuid>",
  "evidenceNote": "Hoy sí hicimos el plato con brócoli",
  "completedAt": "2026-10-14T18:30:00Z",
  "pointsEarned": 10,
  "createdAt": "2026-10-14T18:30:04Z"
}

// 404  reto o padre inexistente
{ "error": "not_found", "message": "Parent <uuid> does not exist" }

// 409  ya registrado hoy (UTC)
{ "error": "already_completed", "message": "<parent> already submitted progress for <challenge> today" }
```

### GET /api/parents/:id/progress

```json
{
  "parentId": "<uuid>",
  "totalPoints": 25,
  "completedCount": 2,
  "streakDays": 2,
  "entries": [
    {
      "id": "<uuid>",
      "challengeId": "<uuid>",
      "evidenceNote": "Hoy sí hicimos el plato con brócoli y zanahoria",
      "completedAt": "2026-10-13T18:30:00Z",
      "pointsEarned": 10
    }
  ]
}
```

## Cliente mínimo en Swift

`URLSession` con `async/await`. Modelos simples, sin librerías externas.

```swift
import Foundation

struct Challenge: Codable, Identifiable {
    let id: UUID
    let title: String
    let description: String
    let difficulty: String
    let points: Int
    let active: Bool
}

struct ChallengeListResponse: Codable {
    let challenges: [Challenge]
    let total: Int
}

struct CreateChallengeRequest: Codable {
    let title: String
    let description: String
    let difficulty: String
    let points: Int
    let active: Bool?
}

struct SubmitProgressRequest: Codable {
    let parentId: UUID
    let evidenceNote: String
    let completedAt: Date?
}

struct ProgressEntry: Codable {
    let id: UUID
    let challengeId: UUID
    let parentId: UUID
    let evidenceNote: String
    let pointsEarned: Int
}

enum APIError: Error {
    case badStatus(Int, String)
    case serverError(String)
}

struct NotFound: Codable { let error: String; let message: String }

final class APIClient {
    // Emulador iOS -> host: usa http://localhost:3000 (el simulador comparte la red del Mac)
    // Dispositivo físico -> usa http://<tu-ip-local>:3000 y agrega el ATS exception si es http.
    private let baseURL = URL(string: "http://localhost:3000")!
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let session: URLSession = .shared

    func listChallenges(completed: Bool? = nil, limit: Int? = nil) async throws -> ChallengeListResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("api/challenges"), resolvingAgainstBaseURL: false)!
        var items: [URLQueryItem] = []
        if let completed { items.append(URLQueryItem(name: "completed", value: completed ? "true" : "false")) }
        if let limit { items.append(URLQueryItem(name: "limit", value: String(limit))) }
        components.queryItems = items.isEmpty ? nil : items

        let (data, response) = try await session.data(from: components.url!)
        try Self.validate(response, data)
        return try decoder.decode(ChallengeListResponse.self, from: data)
    }

    func getChallenge(id: UUID) async throws -> Challenge {
        let url = baseURL.appendingPathComponent("api/challenges/\(id.uuidString)")
        let (data, response) = try await session.data(from: url)
        try Self.validate(response, data)
        return try decoder.decode(Challenge.self, from: data)
    }

    func createChallenge(_ body: CreateChallengeRequest) async throws -> Challenge {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/challenges"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)

        let (data, response) = try await session.data(for: request)
        try Self.validate(response, data)
        return try decoder.decode(Challenge.self, from: data)
    }

    func submitProgress(challengeId: UUID, body: SubmitProgressRequest) async throws -> ProgressEntry {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/challenges/\(challengeId.uuidString)/progress"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)

        let (data, response) = try await session.data(for: request)
        try Self.validate(response, data)
        return try decoder.decode(ProgressEntry.self, from: data)
    }

    private static func validate(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(NotFound.self, from: data))?.message ?? "Error desconocido"
            throw APIError.badStatus(http.statusCode, message)
        }
    }
}
```

Notas para iOS:

- El simulador puede pegarle a `localhost` de tu Mac directamente. En dispositivo físico usa la IP de tu máquina y, si es `http`, agrega `NSAppTransportSecurity` con `NSAllowsLocalNetworking` (o `NSAllowsArbitraryLoads` solo en desarrollo).
- El backend usa UUIDs; en Swift modela los ids como `UUID`, no `String`.
- Los textos de validación son en inglés (los genera Zod); los datos del dominio están en español.

## Estructura

```
src/
  index.ts            arranque, /health, /openapi.json, /docs
  logger.ts           middleware que imprime cada request
  http.ts             helpers de respuestas + hook de validación
  schemas.ts          esquemas Zod (validación + OpenAPI)
  store.ts            datos en memoria + logs de cada operación
  routes/
    challenges.ts     GET/POST de retos y POST de progreso
    progress.ts       GET resumen de progreso por padre
test/
  api.test.ts         pruebas de integración con bun:test
```
