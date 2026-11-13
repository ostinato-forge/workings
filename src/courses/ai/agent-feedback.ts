import type { AgentMessage, AgentRun } from "../../engine/agent-loop";

export function describeMessage(message: AgentMessage): string {
  switch (message.kind) {
    case "request": return `User asks for stock: ${message.items.join(", ")}.`;
    case "tool-call": return `Model requests ${message.name}(${message.arguments.item}). Request ID: ${message.id}.`;
    case "tool-result": return `Tool replies to ${message.callId}: ${message.item}, ${message.error ?? `${message.stock} in stock`}.`;
    case "answer": return `Model answers: ${Object.entries(message.stock).map(([item, count]) => `${item}: ${count}`).join(", ")}.`;
  }
}

// Explain recorded events. Do not infer a result from the selected controls alone.
export function explainRun(run: AgentRun): string {
  if (run.final.status === "complete") return `The loop returned the answer after ${run.final.calls} model calls and ${run.final.toolCalls} tool executions. The stock counts came from results in the conversation. The answer branch stopped the loop.`;
  if (run.final.status === "unhandled-tool") return "The trace contains a model request and no tool result. The model named a function and its input. The application stopped before calling that function, so no inventory data entered the conversation.";
  if (run.final.status === "tool-error") return `The tool returned an error. The loop used ${run.final.retriesUsed} retries and stopped without a stock answer. Read the tool events to distinguish an unavailable inventory from an item whose stock count is zero.`;
  if (run.final.status !== "turn-limit") return "Follow the trace to see what the application did with each model response.";
  const observations = run.steps.filter((step) => step.event.kind === "observation");
  if (observations.some((step) => step.after.messages.length === step.before.messages.length)) return "The tool produced a result, but the conversation gained no result message. The next model call received the request again without its answer. In this simulation, it requests the same item until the call limit stops the loop. More calls alone would not supply the missing result.";
  if (observations.some((step) => {
    const result = step.after.messages.at(-1);
    return result?.kind === "tool-result" && !step.before.messages.some((message) => message.kind === "tool-call" && message.id === result.callId);
  })) return "The conversation contains tool results, but their call IDs do not match earlier requests. The counts are present without a valid link to the requested lookup. This simulation cannot use those results, so it requests the same item again.";
  if (run.steps.some((step) => step.event.kind === "finish" && step.after.status === "running")) return "The model produced an answer before the limit, but the application called the model again. Compare the final-answer event with the last stop event. The application must decide when to return an answer; a call limit only bounds unfinished work.";
  return `The loop used all ${run.final.calls} allowed model calls before returning an answer. Count the tool requests and check whether a further model call is needed to use their results. A successful tool lookup and a final answer are separate events.`;
}

export function explainStep(run: AgentRun, index: number): { code: string; why: string } {
  const step = run.steps[index]!;
  switch (step.event.kind) {
    case "model": return { code: 'const response = await model.reply(messages, ["lookup_stock"]);\nmessages.push(response);', why: step.after.pending?.kind === "answer"
      ? "The model now has matching results for all requested items and produces an answer. The application still needs to return that answer to the user."
      : "The application sends the conversation to the model and saves its response. A tool request is data describing a function call. Producing that request does not run the function." };
    case "tool": return { code: "const result = await tools.execute(response);", why: "The application runs the requested function. Its output is now available to this program, but has not yet been added to the next model input. The call ID identifies the request it answers." };
    case "observation": return { code: run.config.observation === "append" ? "messages.push(result);" : run.config.observation === "wrong-id" ? 'messages.push({ ...result, callId: "unmatched-call" });' : "// No result is added to messages.", why: step.event.detail };
    case "finish": return { code: run.config.finish === "return" ? "return response.stock;" : "continue;", why: step.after.status === "complete" ? "The application returns the model's answer to the user. No further model call is needed." : "The application received an answer but continued the loop. The answer has not been returned to the user." };
    case "stop": return { code: "// The application stops this run.", why: step.event.detail };
  }
}
