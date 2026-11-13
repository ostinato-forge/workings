import { expect, test } from "vitest";
import { runAgent, workingProgram, type AgentCase } from "../../engine/agent-loop";
import { describeMessage, explainRun, explainStep } from "./agent-feedback";

const scenario: AgentCase = { id: "kit", title: "Kit", items: ["cable", "dock"], inventory: { cable: 0, dock: 12 }, expected: "complete" };
test("feedback distinguishes missing execution, missing data, and unmatched data", () => {
  expect(explainRun(runAgent({ ...workingProgram, dispatch: "stop" }, scenario))).toContain("no tool result");
  expect(explainRun(runAgent({ ...workingProgram, observation: "discard" }, scenario))).toContain("gained no result message");
  expect(explainRun(runAgent({ ...workingProgram, observation: "wrong-id" }, scenario))).toContain("do not match earlier requests");
});
test("a repeated answer is a different cause from too few calls", () => {
  expect(explainRun(runAgent({ ...workingProgram, finish: "repeat" }, scenario))).toContain("produced an answer before the limit");
  expect(explainRun(runAgent({ ...workingProgram, maxTurns: 2 }, scenario))).toContain("further model call");
  expect(explainRun(runAgent(workingProgram, scenario))).toContain("3 model calls and 2 tool executions");
});
test("the worked example separates function output from conversation updates", () => {
  const run = runAgent(workingProgram, scenario);
  expect(explainStep(run, 1).code).toContain("tools.execute");
  expect(run.steps[1]!.after.messages.some((message) => message.kind === "tool-result")).toBe(false);
  expect(explainStep(run, 2).code).toBe("messages.push(result);");
  expect(run.steps[2]!.after.messages.at(-1)).toMatchObject({ kind: "tool-result", callId: "call-1", stock: 0 });
  expect(describeMessage(run.steps[2]!.after.messages.at(-1)!)).toContain("0 in stock");
});
