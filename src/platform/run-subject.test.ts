import { afterEach, describe, expect, test, vi } from "vitest";
import type { EngineResult, StageRunRecord } from "./run-record";
import {
  createRunner,
  handleRunRequest,
  INTERNAL_ERROR,
  runSubject,
  runSubjectWithReport,
  TIMEOUT_PROBLEM,
  type RunRequest,
  type RunResponse,
  type RunWorker,
} from "./run-subject";
import { defineSubject, type Subject, type SubjectRunInput } from "./subject";

type World = { total: number };

// Adds the number on each line to a running total.
function sumRun({ sources, world, seed, options }: SubjectRunInput<World>): EngineResult<StageRunRecord<World>> {
  const text = sources.main ?? "";
  const steps: StageRunRecord<World>["steps"] = [];
  let total = world.total;
  for (const [i, line] of text.split("\n").entries()) {
    if (line === "") continue;
    const amount = Number(line);
    if (!Number.isInteger(amount)) return { ok: false, problem: { what: `Line ${i + 1} is not a number.`, fix: "Write one whole number per line." } };
    const before = { total };
    total += amount;
    steps.push({
      index: steps.length,
      event: {
        kind: "add", status: amount === 0 ? "unchanged" : "changed",
        causes: [{ ref: { artifactId: "main", fromLine: i + 1, toLine: i + 1 }, role: "primary" }],
        targets: [{ entityId: "total" }], summary: `Added ${amount}.`,
      },
      before, after: { total },
    });
  }
  return { ok: true, record: { engine: "sum", seed, config: { sources, options }, initial: { total: world.total }, final: { total }, steps } };
}

function sumSubject(run: Subject<World>["run"] = sumRun): Subject<World> {
  return defineSubject<World>({
    id: "sum",
    version: 1,
    simulated: false,
    artifacts: [{ id: "main", fileName: "numbers.txt", kind: "text", language: "plain" }],
    run,
    describe: ({ world }) => ({ entities: [{ id: "total", kind: "total", title: "Total", facts: [{ id: "value", label: "Value", value: String(world.total), tone: "neutral" }] }] }),
    measures: new Map(),
    results: "list",
    validateStep: () => [],
  });
}

function input(text: string): SubjectRunInput<World> {
  return { sources: { main: text }, world: { total: 0 }, seed: 1, options: {} };
}

describe("runSubject", () => {
  test("returns the subject's run record", () => {
    const result = runSubject(sumSubject(), input("2\n3"));
    expect(result.ok && result.record.final).toEqual({ total: 5 });
  });

  test("passes the subject's own problem through", () => {
    expect(runSubject(sumSubject(), input("x"))).toEqual({ ok: false, problem: { what: "Line 1 is not a number.", fix: "Write one whole number per line." } });
  });

  test("applies source limits before the subject sees the text", () => {
    const run = vi.fn(sumRun);
    const result = runSubject(sumSubject(run), input("1".repeat(401)));
    expect(result).toEqual({ ok: false, problem: { what: "Line 1 of numbers.txt is 401 characters long.", fix: "Keep each line to 400 characters or fewer." } });
    expect(run).not.toHaveBeenCalled();
  });

  test("rejects a file the subject does not declare", () => {
    const run = vi.fn(sumRun);
    const extra: SubjectRunInput<World> = { ...input("1"), sources: JSON.parse('{"main": "1", "__proto__": "x"}') };
    expect(runSubject(sumSubject(run), extra)).toEqual({
      ok: false,
      problem: { what: 'The file "__proto__" is not part of this subject.', fix: "Remove that file and run again." },
    });
    expect(run).not.toHaveBeenCalled();
  });

  test("turns a thrown error into a plain problem", () => {
    const report = runSubjectWithReport(sumSubject(() => { throw new Error("boom"); }), input("1"));
    expect(report.result).toEqual({ ok: false, problem: INTERNAL_ERROR });
    expect(report.internal).toMatch(/boom/);
  });

  test("turns a broken record into a plain problem", () => {
    const report = runSubjectWithReport(sumSubject((value) => {
      const result = sumRun(value);
      if (result.ok) result.record.final = { total: 99 };
      return result;
    }), input("1"));
    expect(report.result).toEqual({ ok: false, problem: INTERNAL_ERROR });
    expect(report.internal).toMatch(/final state/);
  });

  test("turns a result that is not a result into a plain problem", () => {
    const report = runSubjectWithReport(sumSubject(() => JSON.parse('{"ok": false, "problem": {"what": ""}}')), input("1"));
    expect(report.result).toEqual({ ok: false, problem: INTERNAL_ERROR });
    expect(report.internal).toBeDefined();
  });

  test("stops a run with too many steps", () => {
    const result = runSubject(sumSubject(), input(Array.from({ length: 1_000 }, () => "1").join("\n")));
    expect(result.ok).toBe(true);
    const long = sumSubject((value) => {
      const result = sumRun(value);
      if (!result.ok) return result;
      const step = result.record.steps[0];
      if (step === undefined) return result;
      const steps = Array.from({ length: 5_001 }, (_, index) => ({ ...step, index, before: { total: 1 }, after: { total: 1 } }));
      return { ok: true, record: { ...result.record, initial: { total: 1 }, final: { total: 1 }, steps } };
    });
    expect(runSubject(long, input("1"))).toEqual({
      ok: false,
      problem: { what: "The run took 5,001 steps.", fix: "Make the input do less work so the run takes 5,000 steps or fewer." },
    });
  });
});

describe("handleRunRequest", () => {
  const subjects = new Map<string, Subject<unknown>>([["sum", sumSubject()]]);

  test("runs the named subject and echoes the request id", () => {
    const response = handleRunRequest(subjects, { requestId: 7, subjectId: "sum", input: input("4") });
    expect(response.requestId).toBe(7);
    expect(response.result.ok).toBe(true);
  });

  test.each(["missing", "__proto__", "constructor"])("reports an unknown subject %s", (subjectId) => {
    expect(handleRunRequest(subjects, { requestId: 1, subjectId, input: input("4") })).toEqual({
      requestId: 1,
      result: { ok: false, problem: { what: `There is no subject named "${subjectId}".`, fix: "Reload the page and try again." } },
    });
  });

  test.each([
    ["no input", '{"requestId": 2, "subjectId": "sum"}'],
    ["a seed that is not a number", '{"requestId": 2, "subjectId": "sum", "input": {"sources": {}, "world": {"total": 0}, "seed": "1", "options": {}}}'],
    ["options that are not plain values", '{"requestId": 2, "subjectId": "sum", "input": {"sources": {}, "world": {"total": 0}, "seed": 1, "options": {"a": {}}}}'],
  ])("reports a request with %s", (_name, json) => {
    const request: RunRequest = JSON.parse(json);
    expect(handleRunRequest(subjects, request)).toEqual({
      requestId: 2,
      result: { ok: false, problem: { what: "The run request was not valid.", fix: "Reload the page and try again." } },
    });
  });
});

type FakeWorker = RunWorker & { requests: RunRequest[]; terminated: boolean; answer(response: unknown): void };

function fakeWorker(answer: "now" | "hold"): FakeWorker {
  const subjects = new Map<string, Subject<unknown>>([["sum", sumSubject()]]);
  const worker: FakeWorker = {
    requests: [],
    terminated: false,
    onmessage: null,
    postMessage(message) {
      worker.requests.push(message);
      if (answer === "now") queueMicrotask(() => worker.answer(handleRunRequest(subjects, message)));
    },
    terminate() { worker.terminated = true; },
    answer(response) { worker.onmessage?.({ data: response }); },
  };
  return worker;
}

function responseFor(request: RunRequest | undefined): RunResponse {
  if (request === undefined) throw new Error("no request was sent");
  return handleRunRequest(new Map<string, Subject<unknown>>([["sum", sumSubject()]]), request);
}

describe("createRunner", () => {
  afterEach(() => { vi.useRealTimers(); });

  test("resolves with the worker's answer", async () => {
    const workers: FakeWorker[] = [];
    const runner = createRunner({ spawn: () => { const worker = fakeWorker("now"); workers.push(worker); return worker; }, timeoutMs: 1_000 });
    const result = await runner.run("sum", input("2\n2"));
    expect(result.ok && result.record.final).toEqual({ total: 4 });
    expect((await runner.run("sum", input("1"))).ok).toBe(true);
    expect(workers).toHaveLength(1);
  });

  test("stops a worker that never answers and starts a fresh one", async () => {
    vi.useFakeTimers();
    const workers: FakeWorker[] = [];
    const runner = createRunner({
      spawn: () => { const worker = fakeWorker(workers.length === 0 ? "hold" : "now"); workers.push(worker); return worker; },
      timeoutMs: 1_000,
    });
    const first = runner.run("sum", input("1"));
    vi.advanceTimersByTime(999);
    expect(workers[0]?.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(await first).toEqual({ ok: false, problem: TIMEOUT_PROBLEM });
    expect(TIMEOUT_PROBLEM).toEqual({ what: "The run took too long and was stopped.", fix: "Simplify the input and run it again." });
    expect(workers[0]?.terminated).toBe(true);
    const second = await runner.run("sum", input("3"));
    expect(second.ok && second.record.final).toEqual({ total: 3 });
    expect(workers).toHaveLength(2);
  });

  test("ignores a late answer from a stopped worker", async () => {
    vi.useFakeTimers();
    const workers: FakeWorker[] = [];
    const runner = createRunner({ spawn: () => { const worker = fakeWorker("hold"); workers.push(worker); return worker; }, timeoutMs: 1_000 });
    const first = runner.run("sum", input("1"));
    vi.advanceTimersByTime(1_000);
    expect(await first).toEqual({ ok: false, problem: TIMEOUT_PROBLEM });

    let settled = false;
    const second = runner.run("sum", input("5")).then((result) => { settled = true; return result; });
    const [old, fresh] = workers;
    const lateRequest = old?.requests[0];
    old?.answer(responseFor(lateRequest));
    // The stopped worker also cannot answer for the new request id.
    old?.answer({ ...responseFor(lateRequest), requestId: fresh?.requests[0]?.requestId });
    await Promise.resolve();
    expect(settled).toBe(false);

    fresh?.answer(responseFor(fresh.requests[0]));
    const result = await second;
    expect(result.ok && result.record.final).toEqual({ total: 5 });
  });

  test("matches overlapping calls to their own answers", async () => {
    const worker = fakeWorker("hold");
    const runner = createRunner({ spawn: () => worker, timeoutMs: 1_000 });
    const first = runner.run("sum", input("1"));
    const second = runner.run("sum", input("2"));
    expect(worker.requests.map((request) => request.requestId)).toHaveLength(2);
    worker.answer(responseFor(worker.requests[1]));
    worker.answer(responseFor(worker.requests[0]));
    const [one, two] = await Promise.all([first, second]);
    expect(one.ok && one.record.final).toEqual({ total: 1 });
    expect(two.ok && two.record.final).toEqual({ total: 2 });
  });

  test("stops every call waiting on a worker that is stopped", async () => {
    vi.useFakeTimers();
    const worker = fakeWorker("hold");
    const runner = createRunner({ spawn: () => worker, timeoutMs: 1_000 });
    const first = runner.run("sum", input("1"));
    vi.advanceTimersByTime(500);
    const second = runner.run("sum", input("2"));
    vi.advanceTimersByTime(500);
    expect(await first).toEqual({ ok: false, problem: TIMEOUT_PROBLEM });
    expect(await second).toEqual({ ok: false, problem: TIMEOUT_PROBLEM });
  });

  test("ignores answers with an unknown request id or no id", async () => {
    const worker = fakeWorker("hold");
    const runner = createRunner({ spawn: () => worker, timeoutMs: 1_000 });
    let settled = false;
    const call = runner.run("sum", input("1")).then((result) => { settled = true; return result; });
    worker.answer({ ...responseFor(worker.requests[0]), requestId: 999 });
    worker.answer("not a response");
    worker.answer(null);
    await Promise.resolve();
    expect(settled).toBe(false);
    worker.answer(responseFor(worker.requests[0]));
    expect((await call).ok).toBe(true);
  });

  test("reports a malformed answer for a known request as an internal error", async () => {
    const worker = fakeWorker("hold");
    const runner = createRunner({ spawn: () => worker, timeoutMs: 1_000 });
    const call = runner.run("sum", input("1"));
    worker.answer({ requestId: worker.requests[0]?.requestId, result: { ok: true } });
    expect(await call).toEqual({ ok: false, problem: INTERNAL_ERROR });
  });

  test("reports a worker that cannot start or cannot take the message", async () => {
    const broken = createRunner({ spawn: () => { throw new Error("no workers"); }, timeoutMs: 1_000 });
    expect(await broken.run("sum", input("1"))).toEqual({ ok: false, problem: INTERNAL_ERROR });
    const worker = fakeWorker("hold");
    worker.postMessage = () => { throw new Error("cannot clone"); };
    const refusing = createRunner({ spawn: () => worker, timeoutMs: 1_000 });
    expect(await refusing.run("sum", input("1"))).toEqual({ ok: false, problem: INTERNAL_ERROR });
  });
});
