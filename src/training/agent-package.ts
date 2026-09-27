import { caseProblem, programProblem, runAgent, checkAgent, workingProgram, type AgentCase, type AgentProgram, type AgentStatus } from "../engine/agent-loop";
import type { Lesson, FreePlayBeatBase } from "../platform/lesson";
import { lintCopy } from "../lessons/lint";

export type AgentPlayBeat = {
  kind: "play";
  id: string;
  title: string;
  goal: string;
  mode: "observe" | "build" | "challenge";
  program: AgentProgram;
  editable: (keyof AgentProgram)[];
  cases: AgentCase[];
  pass: "unhandled-tool" | "turn-limit" | "tool-error" | "success";
  prediction: { question: string; options: { id: AgentStatus; label: string }[] };
  hints: string[];
  navigationHint: string;
};
export type AgentFreeBeat = FreePlayBeatBase & { program: AgentProgram; cases: AgentCase[] };
export type AgentLesson = Lesson<AgentPlayBeat, AgentFreeBeat> & {
  schemaVersion: 1;
  revision: number;
  engine: "agent-loop/1";
  topic: "tools" | "retries";
  description: string;
  objective: string;
  sources: { url: string; claim: string }[];
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 2500; }
function list(value: unknown, min = 1, max = 20): value is unknown[] { return Array.isArray(value) && value.length >= min && value.length <= max; }

export function parseAgentLesson(value: unknown): AgentLesson {
  const failures: string[] = [];
  const require = (ok: unknown, detail: string) => { if (!ok) failures.push(detail); };
  if (!object(value)) throw new Error("A lesson must be a JSON object.");
  require(value.schemaVersion === 1 && value.engine === "agent-loop/1", "Unsupported lesson or engine version.");
  require(Number.isInteger(value.revision) && Number(value.revision) >= 1, "A positive lesson revision is required.");
  require(text(value.id) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id), "Invalid lesson ID.");
  require(value.topic === "tools" || value.topic === "retries", "Unsupported learning objective.");
  for (const field of ["title", "description", "objective"]) require(text(value[field]), `Missing ${field}.`);
  require(list(value.sources, 1, 8) && value.sources.every((source) => object(source) && text(source.claim) && text(source.url) && /^https:\/\//.test(source.url)), "Sources need claims and HTTPS URLs.");
  if (!list(value.beats, 4, 14)) throw new Error("A lesson needs 4 to 14 steps.");
  const ids = new Set<string>();
  let challenges = 0;
  let plays = 0;
  for (const [index, beat] of value.beats.entries()) {
    if (!object(beat)) { failures.push(`Step ${index + 1} must be an object.`); continue; }
    const id = String(beat.id);
    require(text(beat.id) && /^[a-z0-9-]+$/.test(id) && !ids.has(id), `Step ${index + 1} needs a unique ID.`);
    ids.add(id);
    if (beat.kind === "teach" || beat.kind === "recap") {
      require(text(beat.title) && text(beat.body), `${id}: title and explanation are required.`);
    } else if (beat.kind === "play" || beat.kind === "free-play") {
      require(programProblem(beat.program) === null, `${id}: ${programProblem(beat.program)}`);
      require(list(beat.cases, 1, 5), `${id}: one to five cases are required.`);
      if (list(beat.cases, 1, 5)) {
        const caseIds = new Set<string>();
        for (const scenario of beat.cases) {
          const problem = caseProblem(scenario);
          require(problem === null, `${id}: ${problem}`);
          if (object(scenario)) { require(!caseIds.has(String(scenario.id)), `${id}: duplicate case ID.`); caseIds.add(String(scenario.id)); }
        }
      }
      if (beat.kind === "free-play") { require(text(beat.intro), `${id}: missing free-play introduction.`); continue; }
      plays += 1;
      require(["observe", "build", "challenge"].includes(String(beat.mode)), `${id}: invalid experiment mode.`);
      require(["unhandled-tool", "turn-limit", "tool-error", "success"].includes(String(beat.pass)), `${id}: unknown success check.`);
      require(text(beat.title) && text(beat.goal) && text(beat.navigationHint), `${id}: missing experiment instructions.`);
      require(list(beat.editable, 0, 6) && beat.editable.every((key) => typeof key === "string" && Object.hasOwn(workingProgram, key)) && new Set(beat.editable).size === beat.editable.length, `${id}: unknown or duplicate editable block.`);
      require(list(beat.hints, 3, 3) && beat.hints.every(text), `${id}: three progressive hints are required.`);
      const prediction = beat.prediction;
      require(object(prediction) && text(prediction.question) && list(prediction.options, 2, 5) && prediction.options.every((option) => object(option) && ["complete", "unhandled-tool", "turn-limit", "tool-error"].includes(String(option.id)) && text(option.label)) && new Set(prediction.options.map((option) => (option as { id: string }).id)).size === prediction.options.length, `${id}: a prediction needs distinct outcome choices.`);
      if (beat.mode === "challenge") {
        challenges += 1;
        require(beat.pass === "success" && list(beat.cases, 2, 5), `${id}: challenge requires success across fresh cases.`);
        require(list(beat.editable, 1, 6), `${id}: the learner must be able to change the challenge program.`);
      }
    } else failures.push(`${id}: unsupported step kind.`);
  }
  require(object(value.beats[0]) && value.beats[0].kind === "teach", "Start with an explanation.");
  require(object(value.beats.at(-1)) && (value.beats.at(-1) as Record<string, unknown>).kind === "free-play", "End with free play.");
  require(value.beats.filter((beat) => object(beat) && beat.kind === "free-play").length === 1, "Use one final free-play step.");
  require(challenges === 1 && plays >= 2, "Include practice and one independent challenge.");
  const copy: string[] = [];
  function collect(node: unknown) {
    if (typeof node === "string") copy.push(node);
    else if (Array.isArray(node)) node.forEach(collect);
    else if (object(node)) Object.values(node).forEach(collect);
  }
  collect(value);
  failures.push(...lintCopy(copy));
  if (failures.length) throw new Error(failures.join("\n"));
  return value as unknown as AgentLesson;
}

export function solutionProgram(lesson: AgentLesson): AgentProgram {
  return { ...workingProgram, maxTurns: 8, onError: lesson.topic === "retries" ? "retry" : "stop", retries: lesson.topic === "retries" ? 1 : 0 };
}

// These cases belong to the engine, not the content generator.
export function trustedCases(topic: AgentLesson["topic"]): AgentCase[] {
  return [
    { id: "reference-a", title: "Reference inventory", items: ["cable", "adapter"], inventory: { cable: 0, adapter: 17 }, expected: "complete" },
    { id: "reference-b", title: "Changed inventory", items: ["adapter", "cable", "screen"], inventory: { cable: 29, adapter: 0, screen: 4 }, expected: "complete" },
    ...(topic === "retries" ? [
      { id: "reference-retry", title: "One temporary failure", items: ["cable"], inventory: { cable: 12 }, failures: { cable: 1 }, expected: "complete" as const },
      { id: "reference-stop", title: "Persistent failure", items: ["adapter"], inventory: { adapter: 3 }, failures: { adapter: 9 }, expected: "tool-error" as const },
    ] : []),
  ];
}

export function validateAgentExercises(lesson: AgentLesson): { passed: boolean; findings: string[]; cases: number } {
  const findings: string[] = [];
  const solution = solutionProgram(lesson);
  let count = 0;
  for (const beat of lesson.beats) {
    if (beat.kind !== "play" && beat.kind !== "free-play") continue;
    for (const scenario of beat.cases) {
      count += 1;
      const run = runAgent(solution, scenario);
      if (!checkAgent(run, scenario).every((check) => check.passed)) findings.push(`${beat.id}/${scenario.id}: reference solution fails.`);
      if (beat.kind === "play") {
        const allowed = { ...beat.program };
        for (const key of beat.editable) Object.assign(allowed, { [key]: solution[key] });
        const goalRun = runAgent(allowed, scenario);
        const goalMet = beat.pass === "success" ? checkAgent(goalRun, scenario).every((check) => check.passed) : goalRun.final.status === beat.pass;
        if (!goalMet) findings.push(`${beat.id}/${scenario.id}: objective is unreachable with the editable blocks.`);
        const initial = runAgent(beat.program, scenario);
        if (!beat.prediction.options.some((option) => option.id === initial.final.status)) findings.push(`${beat.id}: prediction omits the starting program's outcome.`);
      }
    }
  }
  for (const scenario of trustedCases(lesson.topic)) {
    count += 1;
    if (!checkAgent(runAgent(solution, scenario), scenario).every((check) => check.passed)) findings.push(`${scenario.id}: trusted solution fails.`);
  }
  const challenge = lesson.beats.find((beat): beat is AgentPlayBeat => beat.kind === "play" && beat.mode === "challenge")!;
  const wrong: AgentProgram[] = [
    { ...solution, dispatch: "stop" }, { ...solution, observation: "discard" },
    { ...solution, observation: "wrong-id" }, { ...solution, finish: "repeat" }, { ...solution, maxTurns: 1 },
    ...(lesson.topic === "retries" ? [{ ...solution, onError: "stop" as const }] : []),
  ];
  for (const [index, program] of wrong.entries()) {
    if (challenge.cases.every((scenario) => checkAgent(runAgent(program, scenario), scenario).every((check) => check.passed))) findings.push(`Challenge accepts known wrong program ${index + 1}.`);
  }
  const inventories = new Set(challenge.cases.map((scenario) => JSON.stringify(scenario.inventory)));
  if (inventories.size < 2) findings.push("Fresh cases must vary the inventory.");
  if (lesson.topic === "tools" && challenge.cases.some((scenario) => scenario.items.length < 2 || scenario.expected !== "complete")) findings.push("Tool challenges must require two or more actual lookups and a final answer.");
  if (lesson.topic === "retries" && (!challenge.cases.some((scenario) => scenario.expected === "tool-error") || !challenge.cases.some((scenario) => scenario.expected === "complete" && Object.values(scenario.failures ?? {}).some((n) => n > 0)))) findings.push("Retry challenges need both recovery and persistent failure.");
  return { passed: findings.length === 0, findings, cases: count };
}
