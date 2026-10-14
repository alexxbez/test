export type Difficulty = "facil" | "medio" | "dificil";

export interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  points: number;
  active: boolean;
}

export interface Parent {
  id: string;
  name: string;
}

export interface ProgressEntry {
  id: string;
  challengeId: string;
  parentId: string;
  evidenceNote: string;
  completedAt: string;
  pointsEarned: number;
  createdAt: string;
}

export interface CreateChallengeInput {
  title: string;
  description: string;
  difficulty: Difficulty;
  points: number;
  active?: boolean;
}

export interface SubmitProgressInput {
  parentId: string;
  evidenceNote: string;
  completedAt?: string;
}

export interface ProgressSummary {
  parentId: string;
  totalPoints: number;
  completedCount: number;
  streakDays: number;
  entries: Array<{
    id: string;
    challengeId: string;
    evidenceNote: string;
    completedAt: string;
    pointsEarned: number;
  }>;
}

const isoNow = (): string => new Date().toISOString();

function seedChallenges(): Challenge[] {
  return [
    {
      id: crypto.randomUUID(),
      title: "Plato del día con verduras",
      description:
        "Prepara una comida con al menos 2 verduras y comparte una foto como evidencia.",
      difficulty: "facil",
      points: 10,
      active: true,
    },
    {
      id: crypto.randomUUID(),
      title: "Rutina de 5 minutos antes de dormir",
      description:
        "Aplica la técnica de rutina calmada vista en el taller antes de que el niño se duerma.",
      difficulty: "medio",
      points: 15,
      active: true,
    },
    {
      id: crypto.randomUUID(),
      title: "Conversación sin pantallas",
      description:
        "Ten 10 minutos de conversación con tu hijo durante la cena, sin teléfonos de por medio.",
      difficulty: "dificil",
      points: 25,
      active: true,
    },
  ];
}

function seedParents(): Parent[] {
  return [
    { id: crypto.randomUUID(), name: "María González" },
    { id: crypto.randomUUID(), name: "Luis Ramírez" },
  ];
}

function seedProgress(parent: Parent, challenges: Challenge[]): ProgressEntry[] {
  const first = challenges[0];
  const second = challenges[1];
  if (!first || !second) return [];

  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 172_800_000).toISOString();

  return [
    {
      id: crypto.randomUUID(),
      challengeId: second.id,
      parentId: parent.id,
      evidenceNote: "Rutina probada, funcionó",
      completedAt: twoDaysAgo,
      pointsEarned: second.points,
      createdAt: twoDaysAgo,
    },
    {
      id: crypto.randomUUID(),
      challengeId: first.id,
      parentId: parent.id,
      evidenceNote: "Hoy sí hicimos el plato con brócoli y zanahoria",
      completedAt: yesterday,
      pointsEarned: first.points,
      createdAt: yesterday,
    },
  ];
}

let challenges: Challenge[] = seedChallenges();
let parents: Parent[] = seedParents();
let progress: ProgressEntry[] = (() => {
  const parent = parents[0];
  return parent ? seedProgress(parent, challenges) : [];
})();

console.log(
  `[store] seeded challenges=${challenges.length} parents=${parents.length} progress=${progress.length}`,
);

const utcDay = (iso: string): string => iso.slice(0, 10);

function computeStreak(entries: ProgressEntry[]): number {
  const days = [...new Set(entries.map((e) => utcDay(e.completedAt)))].sort().reverse();
  const first = days[0];
  if (!first) return 0;

  const today = utcDay(isoNow());
  const yesterday = utcDay(new Date(Date.now() - 86_400_000).toISOString());
  if (first !== today && first !== yesterday) return 0;

  let streak = 0;
  let cursor = Date.parse(`${first}T00:00:00Z`);
  for (;;) {
    const day = new Date(cursor).toISOString().slice(0, 10);
    if (!days.includes(day)) break;
    streak += 1;
    cursor -= 86_400_000;
  }
  return streak;
}

export type SubmitProgressResult =
  | { ok: true; entry: ProgressEntry }
  | { ok: false; reason: "challenge_not_found" | "parent_not_found" | "already_completed" };

export const store = {
  listChallenges(opts: { completed?: boolean; parentId?: string; limit?: number } = {}) {
    let result = challenges.slice();

    if (opts.completed !== undefined) {
      result = result.filter((challenge) => {
        const hasProgress = progress.some(
          (entry) =>
            entry.challengeId === challenge.id &&
            (opts.parentId ? entry.parentId === opts.parentId : true),
        );
        return opts.completed ? hasProgress : !hasProgress;
      });
    }

    const total = result.length;
    if (opts.limit !== undefined) result = result.slice(0, opts.limit);
    console.log(
      `[store] listChallenges matched=${total} returned=${result.length} filter=${JSON.stringify(opts)}`,
    );
    return { challenges: result, total };
  },

  getChallenge(id: string): Challenge | undefined {
    const found = challenges.find((c) => c.id === id);
    console.log(`[store] getChallenge ${id} -> ${found ? "hit" : "miss"}`);
    return found;
  },

  createChallenge(input: CreateChallengeInput): Challenge {
    const challenge: Challenge = {
      id: crypto.randomUUID(),
      title: input.title,
      description: input.description,
      difficulty: input.difficulty,
      points: input.points,
      active: input.active ?? true,
    };
    challenges.push(challenge);
    console.log(`[store] created challenge ${challenge.id} (${challenge.title})`);
    return challenge;
  },

  hasParent(parentId: string): boolean {
    return parents.some((p) => p.id === parentId);
  },

  listParents(): Parent[] {
    return parents.slice();
  },

  submitProgress(challengeId: string, input: SubmitProgressInput): SubmitProgressResult {
    if (!challenges.some((c) => c.id === challengeId)) {
      console.log(`[store] submitProgress rejected: challenge ${challengeId} not found`);
      return { ok: false, reason: "challenge_not_found" };
    }
    if (!store.hasParent(input.parentId)) {
      console.log(`[store] submitProgress rejected: parent ${input.parentId} not found`);
      return { ok: false, reason: "parent_not_found" };
    }

    const completedAt = input.completedAt ?? isoNow();
    const duplicate = progress.some(
      (e) =>
        e.challengeId === challengeId &&
        e.parentId === input.parentId &&
        utcDay(e.completedAt) === utcDay(completedAt),
    );
    if (duplicate) {
      console.log(
        `[store] submitProgress rejected: ${input.parentId} already completed ${challengeId} on ${utcDay(completedAt)}`,
      );
      return { ok: false, reason: "already_completed" };
    }

    const challenge = challenges.find((c) => c.id === challengeId);
    const entry: ProgressEntry = {
      id: crypto.randomUUID(),
      challengeId,
      parentId: input.parentId,
      evidenceNote: input.evidenceNote,
      completedAt,
      pointsEarned: challenge?.points ?? 0,
      createdAt: isoNow(),
    };
    progress.push(entry);
    console.log(
      `[store] recorded progress ${entry.id}: parent=${entry.parentId} challenge=${entry.challengeId} points=${entry.pointsEarned}`,
    );
    return { ok: true, entry };
  },

  getProgressSummary(parentId: string): ProgressSummary | null {
    if (!store.hasParent(parentId)) {
      console.log(`[store] getProgressSummary ${parentId} -> parent not found`);
      return null;
    }

    const entries = progress
      .filter((e) => e.parentId === parentId)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

    const summary: ProgressSummary = {
      parentId,
      totalPoints: entries.reduce((sum, e) => sum + e.pointsEarned, 0),
      completedCount: entries.length,
      streakDays: computeStreak(entries),
      entries: entries.map((e) => ({
        id: e.id,
        challengeId: e.challengeId,
        evidenceNote: e.evidenceNote,
        completedAt: e.completedAt,
        pointsEarned: e.pointsEarned,
      })),
    };
    console.log(
      `[store] getProgressSummary ${parentId} -> count=${summary.completedCount} points=${summary.totalPoints} streak=${summary.streakDays}`,
    );
    return summary;
  },

  reset(): void {
    challenges = seedChallenges();
    parents = seedParents();
    const parent = parents[0];
    progress = parent ? seedProgress(parent, challenges) : [];
    console.log("[store] reset");
  },
};
