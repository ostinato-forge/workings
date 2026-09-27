import { expect, test } from "vitest";
import { stripTypeScriptTypes } from "node:module";
import { assertRunRecordInvariants } from "./run-record";
import { checkAgent, executeStockTool, programCode, programProblem, runAgent, simulatedModel, startAgent, stepAgent, stopAgent, workingProgram, type AgentCase, type AgentProgram } from "./agent-loop";

const scenario: AgentCase = { id: "stock", title: "Inventory", items: ["cable", "dock"], inventory: { cable: 0, dock: 12 }, expected: "complete" };

test("the program executes tools, returns matching observations, and finishes with grounded data", () => {
  const before = JSON.stringify(scenario);
  const run = runAgent(workingProgram, scenario);
  expect(run.final.status).toBe("complete");
  expect(run.final.calls).toBe(3);
  expect(run.final.toolCalls).toBe(2);
  expect(run.final.answer).toEqual({ cable: 0, dock: 12 });
  expect(checkAgent(run, scenario).every((check) => check.passed)).toBe(true);
  expect(JSON.stringify(scenario)).toBe(before);
  assertRunRecordInvariants(run);
});

test("model simulation sees results only through matching calls in the conversation", () => {
  const request = { kind: "request" as const, items: ["cable"] };
  const call = simulatedModel([request], ["lookup_stock"]);
  expect(call.kind).toBe("tool-call");
  expect(simulatedModel([request, call, { kind: "tool-result", callId: "wrong", item: "cable", stock: 0 }], ["lookup_stock"]).kind).toBe("tool-call");
  expect(simulatedModel([request, call, { kind: "tool-result", callId: "call-1", item: "cable", stock: 0 }], ["lookup_stock"])).toEqual({ kind: "answer", stock: { cable: 0 } });
});

test("all supported clean-inventory programs pass exactly when they implement the loop", () => {
  for (const dispatch of ["execute", "stop"] as const)
    for (const observation of ["append", "discard", "wrong-id"] as const)
      for (const finish of ["return", "repeat"] as const)
        for (const maxTurns of [1, 2, 3, 5, 8]) {
          const program: AgentProgram = { ...workingProgram, dispatch, observation, finish, maxTurns };
          const run = runAgent(program, scenario);
          assertRunRecordInvariants(run);
          expect(run.steps.length).toBeLessThanOrEqual(65);
          expect(run.final.calls).toBeLessThanOrEqual(maxTurns);
          const expected = dispatch === "execute" && observation === "append" && finish === "return" && maxTurns >= 3;
          expect(checkAgent(run, scenario).every((check) => check.passed), JSON.stringify(program)).toBe(expected);
        }
});

test("errors can recover with one retry, while a persistent failure stops without an answer", () => {
  const transient = { ...scenario, failures: { cable: 1 } };
  expect(checkAgent(runAgent(workingProgram, transient), transient).every((check) => check.passed)).toBe(false);
  const retry: AgentProgram = { ...workingProgram, onError: "retry", retries: 1 };
  expect(checkAgent(runAgent(retry, transient), transient).every((check) => check.passed)).toBe(true);
  const persistent: AgentCase = { ...scenario, failures: { cable: 9 }, expected: "tool-error" };
  const run = runAgent(retry, persistent);
  expect(run.final.status).toBe("tool-error");
  expect(run.final.answer).toBeNull();
  expect(run.final.toolCalls).toBe(2);
  expect(checkAgent(run, persistent).every((check) => check.passed)).toBe(true);
});

test("step and run use the same engine; user stop is not successful completion", () => {
  let stepped = startAgent(workingProgram, scenario);
  const first = stepAgent(stepped, scenario);
  expect(stepped.steps).toHaveLength(0);
  const stopped = stopAgent(first);
  expect(stopped.final.status).toBe("stopped");
  expect(checkAgent(stopped, scenario).every((check) => check.passed)).toBe(false);
  while (stepped.final.status === "running") stepped = stepAgent(stepped, scenario);
  expect(stepped).toEqual(runAgent(workingProgram, scenario));
  assertRunRecordInvariants(stopped);
});

test("unsupported operations, injected answers, and invalid tool requests are rejected", () => {
  expect(programProblem({ ...workingProgram, answer: { cable: 0, dock: 12 } })).toMatch(/unknown/);
  expect(runAgent({ ...workingProgram, maxTurns: Infinity }, scenario).final.status).toBe("invalid");
  expect(executeStockTool({ kind: "tool-call", id: "1", name: "delete_inventory", arguments: { item: "cable" } }, scenario, 1).error).toBeTruthy();
  expect(executeStockTool({ kind: "tool-call", id: "1", name: "lookup_stock", arguments: { item: "missing" } }, scenario, 1).error).toBeTruthy();
});

test("a changed inventory changes the answer without changing the program", () => {
  const changed = { ...scenario, inventory: { cable: 8, dock: 0 } };
  expect(runAgent(workingProgram, changed).final.answer).toEqual(changed.inventory);
  expect(checkAgent(runAgent(workingProgram, scenario), changed).every((check) => check.passed)).toBe(false);
  expect(programCode(workingProgram)).toContain("messages.push(result)");
});

test("the downloadable loop executes the same selected behavior", async () => {
  for (const program of [workingProgram, { ...workingProgram, observation: "discard" as const }, { ...workingProgram, finish: "repeat" as const }]) {
    const js = stripTypeScriptTypes(programCode(program)).replace("export async function", "async function");
    const execute = Function(`${js}\nreturn runAgentLoop;`)();
    const execution = execute(scenario.items,
      { reply: async (messages: Parameters<typeof simulatedModel>[0], tools: string[]) => simulatedModel(messages, tools) },
      { execute: async (call: Parameters<typeof executeStockTool>[0]) => executeStockTool(call, scenario, 1) });
    if (runAgent(program, scenario).final.status === "complete") await expect(execution).resolves.toEqual(scenario.inventory);
    else await expect(execution).rejects.toThrow(/Call limit/);
  }
});
