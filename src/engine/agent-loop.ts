import { snapshot, type RunRecord } from "./run-record";

export const AGENT_ENGINE_VERSION = "agent-loop/1";
export type AgentProgram = {
  dispatch: "execute" | "stop";
  observation: "append" | "discard" | "wrong-id";
  finish: "return" | "repeat";
  maxTurns: number;
  onError: "stop" | "retry";
  retries: number;
};
export type AgentCase = {
  id: string;
  title: string;
  items: string[];
  inventory: Record<string, number>;
  failures?: Record<string, number>;
  expected: "complete" | "tool-error";
};
export type ToolCall = { kind: "tool-call"; id: string; name: string; arguments: { item: string } };
export type ToolResult = { kind: "tool-result"; callId: string; item: string; stock?: number; error?: string };
export type FinalAnswer = { kind: "answer"; stock: Record<string, number> };
export type AgentMessage = { kind: "request"; items: string[] } | ToolCall | ToolResult | FinalAnswer;
export type AgentStatus = "running" | "complete" | "unhandled-tool" | "turn-limit" | "tool-error" | "invalid" | "stopped";
export type AgentState = {
  phase: "model" | "tool" | "observe" | "finish";
  messages: AgentMessage[];
  pending: ToolCall | FinalAnswer | null;
  result: ToolResult | null;
  calls: number;
  toolCalls: number;
  failures: Record<string, number>;
  retriesUsed: number;
  status: AgentStatus;
  answer: Record<string, number> | null;
};
export type AgentEvent = { kind: "model" | "tool" | "observation" | "finish" | "stop"; label: string; detail: string };
export type AgentRun = RunRecord<AgentProgram, AgentState, AgentEvent> & { caseId: string };
export const workingProgram: AgentProgram = {
  dispatch: "execute", observation: "append", finish: "return", maxTurns: 5, onError: "stop", retries: 0,
};

export function programProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Choose the operations for your loop.";
  const p = value as Record<string, unknown>;
  if (Object.keys(p).sort().join() !== Object.keys(workingProgram).sort().join()) return "The loop contains an unknown or missing operation.";
  if (!["execute", "stop"].includes(String(p.dispatch)) || !["append", "discard", "wrong-id"].includes(String(p.observation)) ||
    !["return", "repeat"].includes(String(p.finish)) || !["stop", "retry"].includes(String(p.onError))) return "Choose a supported operation for each block.";
  if (!Number.isInteger(p.maxTurns) || Number(p.maxTurns) < 1 || Number(p.maxTurns) > 8) return "Set the model-call limit between 1 and 8.";
  if (!Number.isInteger(p.retries) || Number(p.retries) < 0 || Number(p.retries) > 2) return "Set retries between 0 and 2.";
  return null;
}

export function caseProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Missing practice case.";
  const c = value as AgentCase;
  if (typeof c.id !== "string" || !/^[a-z0-9-]+$/.test(c.id) || typeof c.title !== "string" || !c.title.trim()) return "A case needs an ID and title.";
  if (!Array.isArray(c.items) || c.items.length < 1 || c.items.length > 3 || new Set(c.items).size !== c.items.length ||
    c.items.some((item) => typeof item !== "string" || !/^[a-z][a-z0-9-]{0,30}$/.test(item))) return "Use one to three distinct item IDs.";
  if (!c.inventory || typeof c.inventory !== "object" || Array.isArray(c.inventory) ||
    c.items.some((item) => !Object.hasOwn(c.inventory, item) || !Number.isInteger(c.inventory[item]) || c.inventory[item]! < 0 || c.inventory[item]! > 999)) return "Each requested item needs a stock count from 0 to 999.";
  if (!["complete", "tool-error"].includes(c.expected)) return "Unknown expected outcome.";
  if (c.failures !== undefined && (!c.failures || typeof c.failures !== "object" || Array.isArray(c.failures) ||
    Object.entries(c.failures).some(([item, count]) => !c.items.includes(item) || !Number.isInteger(count) || count < 0 || count > 9))) return "Tool failures must belong to requested items and have counts from 0 to 9.";
  return null;
}

// This teaching policy can see only the conversation and tool names.
export function simulatedModel(messages: AgentMessage[], tools: readonly string[]): ToolCall | FinalAnswer {
  const request = messages.find((message) => message.kind === "request");
  if (!request || request.kind !== "request") return { kind: "answer", stock: {} };
  const stock: Record<string, number> = {};
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (message.kind !== "tool-result" || message.error || message.stock === undefined) continue;
    const call = messages.slice(0, index).find((candidate) => candidate.kind === "tool-call" && candidate.id === message.callId);
    if (call?.kind === "tool-call" && call.name === "lookup_stock" && call.arguments.item === message.item) stock[message.item] = message.stock;
  }
  const missing = request.items.find((item) => !Object.hasOwn(stock, item));
  if (missing && tools.includes("lookup_stock")) return {
    kind: "tool-call", id: `call-${messages.filter((message) => message.kind === "tool-call").length + 1}`,
    name: "lookup_stock", arguments: { item: missing },
  };
  return { kind: "answer", stock };
}

export function executeStockTool(call: ToolCall, scenario: AgentCase, attempt: number): ToolResult {
  const item = call.arguments?.item;
  if (call.name !== "lookup_stock" || typeof item !== "string" || !Object.hasOwn(scenario.inventory, item)) {
    return { kind: "tool-result", callId: call.id, item: typeof item === "string" ? item : "unknown", error: "Unknown tool or item. Check the request." };
  }
  if (attempt <= (scenario.failures?.[item] ?? 0)) return { kind: "tool-result", callId: call.id, item, error: "Inventory is temporarily unavailable." };
  return { kind: "tool-result", callId: call.id, item, stock: scenario.inventory[item] };
}

export function startAgent(program: AgentProgram, scenario: AgentCase): AgentRun {
  const state: AgentState = {
    phase: "model", messages: [{ kind: "request", items: [...scenario.items] }], pending: null, result: null,
    calls: 0, toolCalls: 0, failures: {}, retriesUsed: 0, status: "running", answer: null,
  };
  return { engine: AGENT_ENGINE_VERSION, seed: 0, config: snapshot(program), caseId: scenario.id, initial: snapshot(state), final: state, steps: [] };
}

export function stepAgent(run: AgentRun, scenario: AgentCase): AgentRun {
  if (run.final.status !== "running") return run;
  const before = snapshot(run.final);
  const state = snapshot(before);
  let event: AgentEvent;
  const stop = (status: AgentStatus, detail: string): AgentEvent => {
    state.status = status;
    return { kind: "stop", label: "Loop stopped", detail };
  };
  const problem = programProblem(run.config) ?? caseProblem(scenario);
  if (problem || run.caseId !== scenario.id) event = stop("invalid", problem ?? "This run belongs to another case.");
  else if (run.steps.length >= 64) event = stop("turn-limit", "The engine operation limit stopped this run.");
  else if (state.phase === "model") {
    if (state.calls >= run.config.maxTurns) event = stop("turn-limit", "The model-call limit was reached. The task is unfinished.");
    else {
      state.calls += 1;
      state.pending = simulatedModel(state.messages, ["lookup_stock"]);
      state.messages.push(snapshot(state.pending));
      state.phase = state.pending.kind === "tool-call" ? "tool" : "finish";
      event = { kind: "model", label: `Model call ${state.calls}`, detail: state.pending.kind === "tool-call"
        ? `Requests lookup_stock(${state.pending.arguments.item}) with ID ${state.pending.id}.`
        : `Returns stock: ${Object.entries(state.pending.stock).map(([item, count]) => `${item}: ${count}`).join(", ")}.` };
    }
  } else if (state.phase === "tool" && state.pending?.kind === "tool-call") {
    if (run.config.dispatch === "stop") event = stop("unhandled-tool", "A tool request is waiting. The application has not executed it.");
    else {
      state.toolCalls += 1;
      const item = state.pending.arguments.item;
      const attempt = (state.failures[item] ?? 0) + 1;
      state.failures[item] = attempt;
      state.result = executeStockTool(state.pending, scenario, attempt);
      state.phase = "observe";
      event = { kind: "tool", label: `Tool result for ${item}`, detail: state.result.error ?? `Inventory returned ${state.result.stock} in stock. Call ID: ${state.result.callId}.` };
    }
  } else if (state.phase === "observe" && state.result) {
    if (state.result.error && (run.config.onError === "stop" || state.retriesUsed >= run.config.retries)) {
      event = stop("tool-error", "Inventory could not be read. The loop stops without inventing a stock count.");
    } else {
      if (state.result.error) state.retriesUsed += 1;
      if (run.config.observation !== "discard") state.messages.push({ ...state.result, callId: run.config.observation === "wrong-id" ? "unmatched-call" : state.result.callId });
      state.phase = "model";
      event = { kind: "observation", label: "Update the conversation", detail: run.config.observation === "discard"
        ? "The result was discarded. The next model call cannot see it."
        : run.config.observation === "wrong-id" ? "The result was added with an unrelated call ID. It cannot answer the pending request."
        : state.result.error ? "The error was returned. Retry budget allows another attempt."
        : "The tool result was added with its matching call ID. The model can use it next." };
      state.result = null;
    }
  } else if (state.phase === "finish" && state.pending?.kind === "answer") {
    if (run.config.finish === "return") {
      state.answer = snapshot(state.pending.stock);
      state.status = "complete";
      event = { kind: "finish", label: "Return the answer", detail: "The model supplied an answer. The loop returns it and stops." };
    } else {
      state.phase = "model";
      event = { kind: "finish", label: "Keep calling the model", detail: "The answer was ignored. Another model call will spend the remaining budget." };
    }
  } else event = stop("invalid", "The next operation does not match the current response.");
  return { ...run, final: state, steps: [...run.steps, { index: run.steps.length, before, after: snapshot(state), event }] };
}

export function stopAgent(run: AgentRun): AgentRun {
  if (run.final.status !== "running") return run;
  const after = { ...snapshot(run.final), status: "stopped" as const };
  return { ...run, final: after, steps: [...run.steps, { index: run.steps.length, before: snapshot(run.final), after: snapshot(after), event: { kind: "stop", label: "Stopped by you", detail: "Run again to start a fresh attempt." } }] };
}

export function runAgent(program: AgentProgram, scenario: AgentCase): AgentRun {
  let run = startAgent(program, scenario);
  while (run.final.status === "running") run = stepAgent(run, scenario);
  return run;
}

export type AgentCheck = { id: string; label: string; passed: boolean };
export function checkAgent(run: AgentRun, scenario: AgentCase): AgentCheck[] {
  const toolSteps = run.steps.filter((step) => step.event.kind === "tool");
  const results = toolSteps.map((step) => step.after.result).filter((result): result is ToolResult => result !== null);
  const expectedFailure = scenario.expected === "tool-error";
  const usedTools = expectedFailure ? results.some((result) => !!result.error)
    : scenario.items.every((item) => results.some((result) => result.item === item && result.stock === scenario.inventory[item] && !result.error));
  const observed = expectedFailure ? run.final.answer === null : scenario.items.every((item) => run.final.messages.some((message, index, messages) =>
    message.kind === "tool-result" && message.item === item && message.stock === scenario.inventory[item] && !message.error &&
    messages.slice(0, index).some((call) => call.kind === "tool-call" && call.id === message.callId && call.arguments.item === item)));
  const answer = expectedFailure ? run.final.status === "tool-error" && run.final.answer === null
    : run.final.status === "complete" && scenario.items.every((item) => run.final.answer?.[item] === scenario.inventory[item]) && Object.keys(run.final.answer ?? {}).length === scenario.items.length;
  return [
    { id: "tool", label: "Execute the requested tool", passed: usedTools },
    { id: "observation", label: expectedFailure ? "Do not invent missing data" : "Return matching tool results", passed: observed },
    { id: "answer", label: expectedFailure ? "Stop and report the tool failure" : "Answer from the observed inventory", passed: answer },
    { id: "bounded", label: "Stop before the call limit", passed: run.final.status !== "running" && run.final.status !== "turn-limit" && run.final.calls <= run.config.maxTurns },
  ];
}

export function programCode(program: AgentProgram): string {
  const body = `let retriesUsed = 0;\nfor (let turn = 0; turn < ${program.maxTurns}; turn++) {\n  const response = await model.reply(messages, ["lookup_stock"]);\n  messages.push(response);\n\n  if (response.kind === "answer") {\n    ${program.finish === "return" ? "return response.stock;" : "continue; // The answer is ignored."}\n  }\n\n  ${program.dispatch === "stop" ? 'throw new Error("Tool request not handled");' : `const result = await tools.execute(response);\n  if (result.error) {\n    ${program.onError === "stop" ? "throw new Error(result.error);" : `if (retriesUsed >= ${program.retries}) throw new Error(result.error);\n    retriesUsed++;`}\n  }\n  ${program.observation === "append" ? "messages.push(result); // Retains the call ID." : program.observation === "wrong-id" ? 'messages.push({ ...result, callId: "unmatched-call" });' : "// The tool result is discarded."}`}\n}\nthrow new Error("Call limit reached; task unfinished");`;
  return `// Workings: the loop corresponding to your selected blocks.\n// Supply a model adapter and tool executor using this protocol.\n// The lesson uses simulated responses and a local inventory.\ntype ToolCall = { kind: "tool-call"; id: string; name: string; arguments: { item: string } };\ntype ToolResult = { kind: "tool-result"; callId: string; item: string; stock?: number; error?: string };\ntype Answer = { kind: "answer"; stock: Record<string, number> };\ntype Message = { kind: "request"; items: string[] } | ToolCall | ToolResult | Answer;\ntype Model = { reply(messages: Message[], tools: readonly string[]): Promise<ToolCall | Answer> };\ntype Tools = { execute(call: ToolCall): Promise<ToolResult> };\n\nexport async function runAgentLoop(items: string[], model: Model, tools: Tools) {\n  const messages: Message[] = [{ kind: "request", items }];\n${body.split("\n").map((line) => `  ${line}`).join("\n")}\n}\n`;
}
