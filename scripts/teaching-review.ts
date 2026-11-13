import { createHash } from "node:crypto";
import type { AgentLesson } from "../src/training/agent-package";

export const hashText = (text: string) => createHash("sha256").update(text).digest("hex");
export const teachingCriteria = ["preparation", "worked-example", "prediction", "feedback", "transfer", "source-support"] as const;
export type TeachingPlan = {
  version: 1; lessonId: string; objective: string; audience: string; prerequisites: string[]; scenario: string;
  workedExample: string;
  steps: { id: string; kind: "teach" | "play" | "recap" | "free-play"; purpose: string }[];
  concepts: { id: string; explanation: string; taughtIn: string; practicedIn: string; assessedIn: string }[];
  misconceptions: { belief: string; evidenceStep: string; feedback: string }[];
  transfer: { step: string; task: string; changes: string[]; withheldGuidance: string };
  claimSources: { step: string; sourceId: string; claim: string }[];
};
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function parseTeachingPlan(value: unknown, lessonId: string, sourceIds: string[]): TeachingPlan {
  const plan = value as TeachingPlan;
  if (!plan || plan.version !== 1 || plan.lessonId !== lessonId || ![plan.objective, plan.audience, plan.scenario].every(nonempty) || !Array.isArray(plan.prerequisites) || !plan.prerequisites.length || !plan.prerequisites.every(nonempty)) throw new Error("Teaching plan needs the brief identity, objective, audience, prerequisites, and scenario.");
  if (!Array.isArray(plan.steps) || plan.steps.length < 4 || plan.steps.length > 14 || plan.steps.some((step) => !step || !nonempty(step.id) || !nonempty(step.purpose) || !["teach", "play", "recap", "free-play"].includes(step.kind))) throw new Error("Plan each teaching step and its purpose before drafting.");
  const ids = plan.steps.map((step) => step.id);
  const position = (id: string) => ids.indexOf(id);
  if (new Set(ids).size !== ids.length || plan.steps[position(plan.workedExample)]?.kind !== "play") throw new Error("The plan needs unique steps and a playable worked example.");
  if (!plan.transfer || !nonempty(plan.transfer.task) || !nonempty(plan.transfer.withheldGuidance) || !Array.isArray(plan.transfer.changes) || !plan.transfer.changes.length || !plan.transfer.changes.every(nonempty) || plan.steps[position(plan.transfer.step)]?.kind !== "play" || position(plan.transfer.step) <= position(plan.workedExample)) throw new Error("Plan an independent task after the worked example, including what changes and which instructions are withheld.");
  if (!Array.isArray(plan.concepts) || !plan.concepts.length || plan.concepts.some((concept) => !concept || !nonempty(concept.id) || !nonempty(concept.explanation) || position(concept.taughtIn) < 0 || position(concept.practicedIn) < position(concept.taughtIn) || position(concept.assessedIn) <= position(concept.practicedIn) || concept.assessedIn !== plan.transfer.step || plan.steps[position(concept.practicedIn)]?.kind !== "play")) throw new Error("Every concept needs teaching, then practice, then independent assessment.");
  if (!Array.isArray(plan.misconceptions) || !plan.misconceptions.length || plan.misconceptions.some((item) => !item || !nonempty(item.belief) || !nonempty(item.feedback) || plan.steps[position(item.evidenceStep)]?.kind !== "play")) throw new Error("Connect each misconception to an experiment and explanatory feedback.");
  if (!Array.isArray(plan.claimSources) || !plan.claimSources.length || plan.claimSources.some((claim) => !claim || position(claim.step) < 0 || !sourceIds.includes(claim.sourceId) || !nonempty(claim.claim))) throw new Error("Map technical claims to teaching steps and reviewed source IDs.");
  return plan;
}

export function checkPlanCoverage(lesson: AgentLesson, plan: TeachingPlan): string[] {
  const findings: string[] = [];
  if (lesson.id !== plan.lessonId || lesson.objective !== plan.objective) findings.push("The draft changed the reviewed objective or lesson identity.");
  if (JSON.stringify(lesson.beats.map(({ id, kind }) => ({ id, kind }))) !== JSON.stringify(plan.steps.map(({ id, kind }) => ({ id, kind })))) findings.push("The draft changed the reviewed teaching sequence. Review the revised plan first.");
  const example = lesson.beats.find((beat) => beat.id === plan.workedExample);
  if (example?.kind !== "play" || !example.workedExample || example.mode !== "observe" || example.pass !== "success") findings.push("The reviewed worked example is missing.");
  const transfer = lesson.beats.find((beat) => beat.id === plan.transfer.step);
  if (transfer?.kind !== "play" || transfer.mode !== "challenge") findings.push("The independent task must remain a challenge.");
  for (const beat of lesson.beats) if (beat.kind === "play" && (!beat.debrief || !beat.solutionExplanation)) findings.push(`${beat.id}: explain the outcome and the solution, not only the controls.`);
  return findings;
}

export function checkTeachingReview(value: unknown, lesson: AgentLesson, expectedHashes: Record<string, string>): void {
  const review = value as { version: number; reviewer: string; basis: string; hashes: Record<string, string>; checks: Record<string, { verdict: string; evidence: { step: string; detail: string }[] }> };
  if (!review || review.version !== 1 || !nonempty(review.reviewer) || review.basis !== "author-review" || !review.hashes || Object.entries(expectedHashes).some(([key, hash]) => review.hashes[key] !== hash)) throw new Error("Teaching review is missing or stale. Review the current draft, plan, brief, and sources.");
  const ids = lesson.beats.map((beat) => beat.id);
  for (const criterion of teachingCriteria) {
    const check = review.checks?.[criterion];
    if (!check || check.verdict !== "pass" || !Array.isArray(check.evidence) || !check.evidence.length || check.evidence.some((item) => !item || !ids.includes(item.step) || !nonempty(item.detail))) throw new Error(`Teaching review needs passing evidence for ${criterion}.`);
  }
}
