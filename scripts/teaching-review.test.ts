import { expect, test } from "vitest";
import planData from "../training/ai/tool-using-agent/teaching-plan.json";
import draftData from "../training/ai/tool-using-agent/candidate.json";
import { parseAgentLesson } from "../src/training/agent-package";
import { runAgent, checkAgent } from "../src/engine/agent-loop";
import { checkPlanCoverage, checkTeachingReview, parseTeachingPlan, teachingCriteria } from "./teaching-review";

const sources = ["agent-loop", "tool-results"];
test("the reviewed sequence prepares each concept before independent use", () => {
  const plan = parseTeachingPlan(planData, "tool-using-agent", sources);
  expect(checkPlanCoverage(parseAgentLesson(draftData), plan)).toEqual([]);
  const invalid = structuredClone(planData);
  invalid.concepts[0]!.taughtIn = "what-you-built";
  expect(() => parseTeachingPlan(invalid, "tool-using-agent", sources)).toThrow(/teaching, then practice/);
  expect(() => parseTeachingPlan(planData, "tool-using-agent", [])).toThrow(/source IDs/);
});
test("a valid runtime package cannot silently remove the reviewed worked example", () => {
  const draft = parseAgentLesson(structuredClone(draftData));
  const example = draft.beats.find((beat) => beat.id === planData.workedExample)!;
  if (example.kind !== "play") throw new Error("Missing example");
  delete example.workedExample;
  expect(checkPlanCoverage(draft, parseTeachingPlan(planData, draft.id, sources))).toContain("The reviewed worked example is missing.");
});
test("the new challenge requires both message repair and a budget for the longer request", () => {
  const challenge = parseAgentLesson(draftData).beats.find((beat) => beat.id === "build-your-agent")!;
  if (challenge.kind !== "play") throw new Error("Missing challenge");
  const onlyMessages = { ...challenge.program, observation: "append" as const };
  expect(checkAgent(runAgent(onlyMessages, challenge.cases[0]!), challenge.cases[0]!).every((check) => check.passed)).toBe(true);
  expect(runAgent(onlyMessages, challenge.cases[1]!).final.status).toBe("turn-limit");
  const onlyBudget = { ...challenge.program, maxTurns: 8 };
  expect(runAgent(onlyBudget, challenge.cases[0]!).final.status).toBe("turn-limit");
  for (const scenario of challenge.cases) expect(checkAgent(runAgent({ ...onlyMessages, maxTurns: 4 }, scenario), scenario).every((check) => check.passed)).toBe(true);
});
test("acceptance rejects stale, incomplete, and unresolved teaching reviews", () => {
  const lesson = parseAgentLesson(draftData);
  const hashes = { content: "current-content", plan: "current-plan" };
  const review = { version: 1, reviewer: "Author", basis: "author-review", hashes, checks: Object.fromEntries(teachingCriteria.map((key) => [key, { verdict: "pass", evidence: [{ step: "meet-the-task", detail: "Reviewed evidence" }] }])) };
  expect(() => checkTeachingReview(review, lesson, hashes)).not.toThrow();
  expect(() => checkTeachingReview(review, lesson, { ...hashes, content: "edited" })).toThrow(/stale/);
  const incomplete = structuredClone(review);
  delete incomplete.checks.feedback;
  expect(() => checkTeachingReview(incomplete, lesson, hashes)).toThrow(/feedback/);
  const unresolved = structuredClone(review);
  unresolved.checks.transfer!.verdict = "revise";
  expect(() => checkTeachingReview(unresolved, lesson, hashes)).toThrow(/transfer/);
});
