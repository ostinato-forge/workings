import { AGENT_ENGINE_VERSION, type AgentProgram } from "../engine/agent-loop";

export type AgentEvidence = {
  revision: number;
  engine: string;
  hints: number;
  solutionViewed: boolean;
  attempts: number;
  passed: boolean;
  cases: string[];
  program: AgentProgram | null;
};
export const evidenceKey = (lesson: string, beat: string) => `workings-agent-evidence:${lesson}:${beat}`;
export function emptyEvidence(revision: number): AgentEvidence {
  return { revision, engine: AGENT_ENGINE_VERSION, hints: 0, solutionViewed: false, attempts: 0, passed: false, cases: [], program: null };
}
export function readEvidence(storage: Pick<Storage, "getItem">, lesson: string, beat: string, revision: number): AgentEvidence {
  const empty = emptyEvidence(revision);
  try {
    const value = JSON.parse(storage.getItem(evidenceKey(lesson, beat)) ?? "null");
    if (!value || value.revision !== revision || value.engine !== AGENT_ENGINE_VERSION ||
      !Number.isInteger(value.hints) || value.hints < 0 || value.hints > 3 || !Number.isInteger(value.attempts) || value.attempts < 0 ||
      typeof value.solutionViewed !== "boolean" || typeof value.passed !== "boolean" || !Array.isArray(value.cases) || !value.cases.every((id: unknown) => typeof id === "string")) return empty;
    return value;
  } catch { return empty; }
}
