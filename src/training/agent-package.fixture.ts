import type { AgentLesson } from "./agent-package";
import { workingProgram } from "../engine/agent-loop";

export function referencePackage(): AgentLesson {
  const cases = [
    { id: "case-a", title: "Case A", items: ["cable", "dock"], inventory: { cable: 0, dock: 12 }, expected: "complete" as const },
    { id: "case-b", title: "Case B", items: ["dock", "cable"], inventory: { cable: 7, dock: 0 }, expected: "complete" as const },
  ];
  const prediction = { question: "What will the current loop do?", options: [
    { id: "complete" as const, label: "Finish with an answer" },
    { id: "unhandled-tool" as const, label: "Stop before executing the tool" },
    { id: "turn-limit" as const, label: "Reach the call limit" },
  ] };
  return {
    schemaVersion: 1, revision: 1, engine: "agent-loop/1", topic: "tools", id: "reference-package", title: "Runtime reference fixture",
    description: "Exercise the package reader.", objective: "Return matching observations and finish.", sources: [{ url: "https://example.com/reference", claim: "Fixture evidence." }],
    beats: [
      { kind: "teach", id: "intro", title: "Reference fixture", body: "This package tests the player and is not a generated lesson." },
      { kind: "play", id: "observe", title: "Inspect a request", goal: "Run and inspect the request.", mode: "observe", program: { ...workingProgram, dispatch: "stop" }, editable: [], cases: [cases[0]!], pass: "unhandled-tool", prediction, hints: ["Read the trace.", "Find the request.", "The tool has not run."], navigationHint: "Predict and run." },
      { kind: "play", id: "challenge", title: "Repair the loop", goal: "Return stock counts for every requested item.", mode: "challenge", program: { ...workingProgram, observation: "discard", finish: "repeat" }, editable: ["dispatch", "observation", "finish", "maxTurns"], cases, pass: "success", prediction, hints: ["Read the trace.", "Find missing results.", "Return the tool result with its call ID."], navigationHint: "Repair the loop and test both cases." },
      { kind: "recap", id: "recap", title: "Reference results", body: "The checks evaluate observations and answers." },
      { kind: "free-play", id: "free", intro: "Change the loop and inspect its behavior.", program: workingProgram, cases },
    ],
  };
}
