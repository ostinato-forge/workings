/*
 * The one path platform code uses to run a subject. It applies the input
 * limits, catches anything the subject throws, and checks the record the
 * subject returns, so a fault in a subject becomes a plain message instead
 * of a broken lesson.
 *
 * In the browser, runs happen in a Web Worker. A slow regular expression
 * or an endless loop cannot be stopped from inside the engine, so the page
 * side stops the whole worker after a time limit and starts a fresh one.
 */

import { checkRunSize, checkSourceLimits } from "./limits";
import { assertRunRecordInvariants, type EngineProblem, type EngineResult, type StageRunRecord } from "./run-record";
import { isPlainRecord, stageEventProblems } from "./stage-event";
import { lookup, type Subject, type SubjectRunInput } from "./subject";
import { quotedName, thrownMessage } from "./text";

export const INTERNAL_ERROR: EngineProblem = Object.freeze({
  what: "The run stopped because of an internal error.",
  fix: "Try a different input. If this happens again, report it with the input that caused it.",
});

export const TIMEOUT_PROBLEM: EngineProblem = Object.freeze({
  what: "The run took too long and was stopped.",
  fix: "Simplify the input and run it again.",
});

const INVALID_REQUEST: EngineProblem = Object.freeze({
  what: "The run request was not valid.",
  fix: "Reload the page and try again.",
});

export type RunResult<World> = EngineResult<StageRunRecord<World>>;

// The result for the learner, plus the developer-facing reason when the
// subject itself was at fault. The conformance suite reads the reason, and
// reads eventProblems to report a malformed event under its own rule.
export type RunReport<World> = {
  result: RunResult<World>;
  internal?: string;
  eventProblems?: { step: number; message: string }[];
};

function failed<World>(problem: EngineProblem): RunResult<World> {
  return { ok: false, problem };
}

function internal<World>(reason: string): RunReport<World> {
  return { result: failed(INTERNAL_ERROR), internal: reason };
}

// Compares key by key, so two records with the same entries in a different
// order are equal.
function sameEntries(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && Object.is(a[key], b[key]));
}

function isProblem(value: unknown): value is EngineProblem {
  return isPlainRecord(value) && typeof value.what === "string" && value.what.trim() !== "" &&
    typeof value.fix === "string" && value.fix.trim() !== "";
}

export function runSubjectWithReport<World>(subject: Subject<World>, input: SubjectRunInput<World>): RunReport<World> {
  try {
    const fileNames = new Map(subject.artifacts.map((artifact) => [artifact.id, artifact.fileName]));
    const limit = checkSourceLimits(input.sources, fileNames);
    if (limit !== null) return { result: failed(limit) };
    for (const id of Object.keys(input.sources)) {
      if (!fileNames.has(id)) {
        return { result: failed({ what: `The file "${id}" is not part of this subject.`, fix: "Remove that file and run again." }) };
      }
    }

    let result: RunResult<World>;
    try {
      result = subject.run(input);
    } catch (error) {
      return internal(`The subject's run threw: ${thrownMessage(error)}`);
    }
    // The type of run() promises a result, but subject code can break that
    // promise, so the parts the platform relies on are checked at run time.
    const returned: unknown = result;
    if (!isPlainRecord(returned) || typeof returned.ok !== "boolean") return internal("The subject's run did not return a result.");
    if (!result.ok) {
      return isProblem(result.problem)
        ? { result: failed({ what: result.problem.what, fix: result.problem.fix }) }
        : internal("The subject's run returned a problem without a what and a fix.");
    }
    const record: unknown = result.record;
    if (!isPlainRecord(record) || !Array.isArray(record.steps)) return internal("The subject's run returned a record without steps.");
    // The size check comes before the invariant check, which walks every step.
    const size = checkRunSize({ steps: record.steps });
    if (size !== null) return { result: failed(size) };
    try {
      assertRunRecordInvariants(result.record);
    } catch (error) {
      return internal(`The run record breaks an invariant: ${thrownMessage(error)}`);
    }
    // Measures and causes read the record's own copy of the input, so a
    // subject that changes it could point at text the learner never wrote.
    const config: unknown = result.record.config;
    if (!isPlainRecord(config) || !isPlainRecord(config.sources) || !isPlainRecord(config.options)) {
      return internal("The run record has no sources and options.");
    }
    if (!sameEntries(config.sources, input.sources)) return internal("The run record's sources differ from the text the run was given.");
    if (!sameEntries(config.options, input.options)) return internal("The run record's options differ from the options the run was given.");
    const eventProblems = result.record.steps.flatMap((step) =>
      stageEventProblems(step.event).map((message) => ({ step: step.index, message })));
    const [first] = eventProblems;
    if (first !== undefined) {
      return { ...internal(`The event of step ${first.step} is not valid: ${first.message}`), eventProblems };
    }
    return { result };
  } catch (error) {
    return internal(`The run path failed: ${thrownMessage(error)}`);
  }
}

export function runSubject<World>(subject: Subject<World>, input: SubjectRunInput<World>): RunResult<World> {
  return runSubjectWithReport(subject, input).result;
}

// Messages between the page and the run worker. A world crosses the
// boundary as structured data, so the worker side sees it as unknown.
export type RunRequest = { requestId: number; subjectId: string; input: SubjectRunInput<unknown> };
export type RunResponse = { requestId: number; result: RunResult<unknown> };

function isOptionValue(value: unknown): boolean {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function isRunInput(value: unknown): value is SubjectRunInput<unknown> {
  return isPlainRecord(value) && isPlainRecord(value.sources) && Object.hasOwn(value, "world") &&
    typeof value.seed === "number" && Number.isFinite(value.seed) &&
    isPlainRecord(value.options) && Object.values(value.options).every(isOptionValue);
}

// The page side numbers calls from 1, so an answer under this id matches
// no call and is ignored.
const NO_REQUEST_ID = 0;

// The worker side. Request data arrives from another context, so its shape
// is checked before the subject sees it. Never throws.
export function handleRunRequest(lookupSubjects: ReadonlyMap<string, Subject<unknown>>, request: unknown): RunResponse {
  let requestId = NO_REQUEST_ID;
  try {
    if (!isPlainRecord(request)) return { requestId, result: failed(INVALID_REQUEST) };
    const id = request.requestId;
    if (typeof id !== "number" || !Number.isSafeInteger(id)) return { requestId, result: failed(INVALID_REQUEST) };
    requestId = id;
    const subjectId = request.subjectId;
    const subject = lookup(lookupSubjects, subjectId);
    if (subject === undefined) {
      return { requestId, result: failed({ what: `There is no subject named ${quotedName(subjectId)}.`, fix: "Reload the page and try again." }) };
    }
    const input = request.input;
    if (!isRunInput(input)) return { requestId, result: failed(INVALID_REQUEST) };
    return { requestId, result: runSubject(subject, input) };
  } catch {
    return { requestId, result: failed(INVALID_REQUEST) };
  }
}

export type RunWorker = {
  postMessage(message: RunRequest): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
};

export type Runner = {
  run(subjectId: string, input: SubjectRunInput<unknown>): Promise<RunResult<unknown>>;
};

function isRunResult(value: unknown): value is RunResult<unknown> {
  if (!isPlainRecord(value)) return false;
  if (value.ok === false) return isProblem(value.problem);
  if (value.ok !== true || !isPlainRecord(value.record)) return false;
  const { record } = value;
  return typeof record.engine === "string" && typeof record.seed === "number" && isPlainRecord(record.config) &&
    isPlainRecord(record.config.sources) && isPlainRecord(record.config.options) &&
    Object.hasOwn(record, "initial") && Object.hasOwn(record, "final") && Array.isArray(record.steps);
}

// The page side. A worker runs one call at a time, so the runner keeps the
// calls in a queue and posts the next one only when the one before it
// settles. Each call's timer starts when it is posted, so a slow call ahead
// of it cannot use up its time. A call that gets no answer in time stops the
// worker and fails alone. The calls still waiting then run on a fresh worker.
export function createRunner({ spawn, timeoutMs }: { spawn: () => RunWorker; timeoutMs: number }): Runner {
  type Waiting = { subjectId: string; input: SubjectRunInput<unknown>; resolve: (result: RunResult<unknown>) => void };
  let worker: RunWorker | null = null;
  let nextId = 1;
  const queue: Waiting[] = [];
  let running: { requestId: number; resolve: (result: RunResult<unknown>) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  const current = (): RunWorker => {
    if (worker !== null) return worker;
    const created = spawn();
    // Answers from a worker that was stopped are ignored, even when they
    // carry the id of the call that is running.
    created.onmessage = (event) => { if (worker === created) receive(event.data); };
    worker = created;
    return created;
  };

  const settle = (result: RunResult<unknown>) => {
    const call = running;
    if (call === null) return;
    running = null;
    clearTimeout(call.timer);
    call.resolve(result);
    postNext();
  };

  const receive = (data: unknown) => {
    if (running === null || !isPlainRecord(data) || data.requestId !== running.requestId) return;
    settle(isRunResult(data.result) ? data.result : failed(INTERNAL_ERROR));
  };

  const stop = () => {
    const stopped = worker;
    worker = null;
    try {
      stopped?.terminate();
    } catch {
      // The worker is dropped either way.
    }
    settle(failed(TIMEOUT_PROBLEM));
  };

  function postNext(): void {
    if (running !== null) return;
    const call = queue.shift();
    if (call === undefined) return;
    const requestId = nextId;
    nextId += 1;
    running = { requestId, resolve: call.resolve, timer: setTimeout(stop, timeoutMs) };
    try {
      current().postMessage({ requestId, subjectId: call.subjectId, input: call.input });
    } catch {
      settle(failed(INTERNAL_ERROR));
    }
  }

  return {
    run(subjectId, input) {
      return new Promise((resolve) => {
        queue.push({ subjectId, input, resolve });
        postNext();
      });
    },
  };
}
