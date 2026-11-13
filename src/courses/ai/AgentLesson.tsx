import { useEffect, useMemo, useRef, useState } from "react";
import { LessonFlow, type LessonPlayerProps } from "../../platform/LessonFlow";
import { checkAgent, programCode, runAgent, startAgent, stepAgent, stopAgent, type AgentProgram, type AgentRun } from "../../engine/agent-loop";
import { parseAgentLesson, solutionProgram, type AgentFreeBeat, type AgentLesson, type AgentPlayBeat } from "../../training/agent-package";
import { emptyEvidence, evidenceKey, readEvidence, type AgentEvidence } from "../../platform/agent-evidence";
import "./agent-lesson.css";
import { describeMessage, explainRun, explainStep } from "./agent-feedback";

const packages = import.meta.glob("../../content/lessons/*.json", { eager: true, import: "default" });
export function loadAgentLesson(id: string): AgentLesson {
  return parseAgentLesson(packages[`../../content/lessons/${id}.json`]);
}
const operations: { key: keyof AgentProgram; label: string; choices: { value: string; label: string }[] }[] = [
  { key: "dispatch", label: "When the model requests a tool", choices: [{ value: "stop", label: "Stop without running the tool" }, { value: "execute", label: "Execute the requested tool" }] },
  { key: "observation", label: "After the tool returns", choices: [{ value: "discard", label: "Discard the result" }, { value: "append", label: "Append the result with its call ID" }, { value: "wrong-id", label: "Append with an unrelated call ID" }] },
  { key: "finish", label: "When the model returns an answer", choices: [{ value: "repeat", label: "Call the model again" }, { value: "return", label: "Return the answer and stop" }] },
  { key: "maxTurns", label: "Maximum model calls", choices: Array.from({ length: 8 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) })) },
  { key: "onError", label: "When a tool returns an error", choices: [{ value: "stop", label: "Stop and report the error" }, { value: "retry", label: "Return the error and retry" }] },
  { key: "retries", label: "Maximum retries after errors", choices: [0, 1, 2].map((n) => ({ value: String(n), label: String(n) })) },
];

function AgentWorkbench({ lesson, beat, onDeckChange, onSettled, onUnsettled }: {
  lesson: AgentLesson; beat: AgentPlayBeat | AgentFreeBeat;
  onDeckChange: LessonPlayerProps["onDeckChange"]; onSettled?: () => void; onUnsettled?: () => void;
}) {
  const play = beat.kind === "play" ? beat : null;
  const [program, setProgram] = useState<AgentProgram>({ ...beat.program });
  const [prediction, setPrediction] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [running, setRunning] = useState(false);
  const [caseIndex, setCaseIndex] = useState(0);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [evidence, setEvidence] = useState<AgentEvidence>(() => {
    try { return readEvidence(localStorage, lesson.id, beat.id, lesson.revision); }
    catch { return emptyEvidence(lesson.revision); }
  });
  const [canSave, setCanSave] = useState(true);
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [hintCount, setHintCount] = useState(0);
  const [inspectedStep, setInspectedStep] = useState<number | null>(null);
  const settledCallback = useRef(onSettled);
  settledCallback.current = onSettled;
  const traceEnd = useRef<HTMLLIElement>(null);
  const scenario = beat.cases[practiceIndex]!;
  const terminal = run !== null && run.final.status !== "running" && run.final.status !== "stopped";
  const results = useMemo(() => !terminal || !run ? [] : [run, ...(play?.mode === "challenge" ? beat.cases.slice(1).map((c) => runAgent(program, c)) : [])], [run, terminal, program, beat, play?.mode]);
  const successful = terminal && results.length > 0 && (play && play.pass !== "success"
    ? run!.final.status === play.pass : results.every((result, index) => checkAgent(result, play?.mode === "challenge" ? beat.cases[index]! : scenario).every((check) => check.passed)));
  const visibleRun = results[caseIndex] ?? run;
  const inspectedIndex = Math.min(inspectedStep ?? (visibleRun?.steps.length ?? 1) - 1, (visibleRun?.steps.length ?? 1) - 1);
  const inspected = visibleRun?.steps[inspectedIndex];
  const stepExplanation = inspected && visibleRun ? explainStep(visibleRun, inspectedIndex) : null;
  const selectedCase = play?.mode === "challenge" ? beat.cases[caseIndex]! : scenario;
  const canRun = !running && (play === null || prediction !== null);
  const solution = solutionProgram(lesson);

  function save(next: AgentEvidence) {
    setEvidence(next);
    try { localStorage.setItem(evidenceKey(lesson.id, beat.id), JSON.stringify(next)); }
    catch { setCanSave(false); }
  }
  function invalidate(next: AgentProgram) {
    setRunning(false); setProgram(next); setRun(null); setPrediction(null); setCaseIndex(0); setInspectedStep(null);
    onUnsettled?.();
  }
  function begin(auto: boolean) {
    if (!canRun) return;
    setCaseIndex(0);
    setInspectedStep(null);
    const current = run?.final.status === "running" ? run : startAgent(program, scenario);
    setRun(auto ? current : stepAgent(current, scenario));
    setRunning(auto);
    onUnsettled?.();
  }
  useEffect(() => {
    if (!running || run?.final.status !== "running") return;
    const timer = setTimeout(() => setRun((current) => current ? stepAgent(current, scenario) : current), 180);
    return () => clearTimeout(timer);
  }, [running, run, scenario]);
  useEffect(() => {
    if (!terminal || !run) return;
    setRunning(false);
    if (play) save({ ...evidence, attempts: evidence.attempts + 1, passed: !!successful,
      cases: results.map((result) => result.caseId), program: { ...program } });
    if (successful) settledCallback.current?.();
  }, [terminal, run]);
  useEffect(() => {
    const trace = traceEnd.current?.parentElement;
    if (running && trace) trace.scrollTop = trace.scrollHeight;
  }, [run?.steps.length, running]);
  // The deck gets its handlers one frame after a state change. Calling through a
  // ref means a press in that frame still runs with the current state.
  const latestBegin = useRef(begin);
  latestBegin.current = begin;
  useEffect(() => {
    onDeckChange({ activated: true, dials: [], canStart: canRun, startLabel: "Run agent", startSublabel: play?.mode === "challenge" ? "test every case" : "follow the loop",
      onStart: () => latestBegin.current(true), onStep: () => latestBegin.current(false), canStep: canRun,
      onStop: running || run?.final.status === "running" ? () => { setRunning(false); setRun((current) => current ? stopAgent(current) : null); } : undefined,
      onReset: () => { setRunning(false); setRun(null); setPrediction(null); setCaseIndex(0); setInspectedStep(null); onUnsettled?.(); }, resetLabel: "Reset agent run" });
    return () => onDeckChange(null);
  }, [program, prediction, run, running, scenario, onDeckChange]);

  const options = operations.filter((operation) => lesson.topic === "retries" || !["onError", "retries"].includes(operation.key));
  const programBlocks = <ol className="agent-blocks">
          <li className="agent-fixed"><span className="agent-block-number">1</span><div><strong>Call the model</strong><span>Send the conversation and available tools.</span></div></li>
          {options.map((operation, index) => <li key={operation.key}>
            <span className="agent-block-number">{index + 2}</span>
            <label>{operation.label}
              <select aria-label={operation.label} value={String(program[operation.key])}
                disabled={running || !!play && !play.editable.includes(operation.key)}
                onChange={(event) => invalidate({ ...program, [operation.key]: ["maxTurns", "retries"].includes(operation.key) ? Number(event.target.value) : event.target.value })}>
                {operation.choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
              </select>
            </label>
          </li>)}
        </ol>;
  const inspection = inspected && stepExplanation ? <details className="agent-step-inspector" open={play?.workedExample || undefined}>
          <summary>Inside event {inspectedIndex + 1}</summary>
          <p>{stepExplanation.why}</p>
          <pre tabIndex={0}><code>{stepExplanation.code}</code></pre>
          {inspected.after.result ? <p><strong>Function output:</strong> {describeMessage(inspected.after.result)}</p> : null}
          <h4>Conversation after this event</h4>
          <p className="evidence-meta">{inspected.before.messages.length} messages before; {inspected.after.messages.length} after. This is the history available for the next model call.</p>
          <ol className="agent-message-list">{inspected.after.messages.map((message, index) => <li key={index}>{describeMessage(message)}</li>)}</ol>
        </details> : null;
  return <>
    <div className="agent-task">
      <div><h2>{play?.title ?? "Try another loop"}</h2><p>{play ? play.goal : (beat as AgentFreeBeat).intro}</p></div>
      <p className="agent-task-request"><span>Task</span>Check stock for {selectedCase.items.join(" and ")}. Answer using the tool results.</p>
    </div>
    <p className="simulation-note">Simulated model responses. The loop and inventory tool execute locally. No API key or model calls leave your browser.</p>
    {!play ? <label className="agent-practice-select">Practice case <select aria-label="Practice case" value={practiceIndex} disabled={running} onChange={(event) => { setPracticeIndex(Number(event.target.value)); invalidate(program); }}>
      {beat.cases.map((item, index) => <option key={item.id} value={index}>{item.title}</option>)}
    </select></label> : null}
    <div className="agent-workspace">
      <section className="agent-program" aria-label="Agent program">
        <h3>Your loop</h3>
        <p className="evidence-meta">{play?.mode === "observe" ? "This example is fixed. Use Step to follow each operation, or Run to see the full trace." : "Change a block, predict the outcome, then use Run or Step on the cabinet."}</p>
        {play?.workedExample ? <>
          {inspection}
          <details className="agent-fixed-program" open={!run}>
            <summary>Read the fixed program</summary>
            {programBlocks}
          </details>
        </> : programBlocks}
        <details className="agent-code"><summary>See the matching code</summary><pre tabIndex={0}><code>{programCode(program)}</code></pre>
          <button onClick={() => { const url = URL.createObjectURL(new Blob([programCode(program)], { type: "text/plain" })); const link = document.createElement("a"); link.href = url; link.download = "workings-agent-loop.ts"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download this loop</button>
        </details>
      </section>
      <section className="agent-observer" aria-label="Agent execution">
        {play ? <fieldset className="agent-prediction" disabled={running || run?.final.status === "running"}>
          <legend>{play.prediction.question}</legend>
          {play.mode === "challenge" ? <p className="evidence-meta">Predict the first case. Run also checks the other cases with the same program.</p> : null}
          {play.prediction.options.map((option) => <label key={option.id}>
            <input type="radio" name={`prediction-${beat.id}`} value={option.id} checked={prediction === option.id} onChange={() => setPrediction(option.id)} />{option.label}
          </label>)}
        </fieldset> : null}
        <div className="agent-trace-heading"><h3>Execution trace</h3><span>{visibleRun?.final.calls ?? 0} / {program.maxTurns} model calls</span></div>
        {results.length > 1 ? <div className="agent-cases" aria-label="Case results">{results.map((result, index) => <button key={result.caseId} type="button" aria-pressed={index === caseIndex} onClick={() => { setCaseIndex(index); setInspectedStep(null); }}>
          {beat.cases[index]!.title}: {checkAgent(result, beat.cases[index]!).every((check) => check.passed) ? "passed" : "needs work"}
        </button>)}</div> : null}
        {visibleRun?.steps.length ? <ol className="agent-trace" aria-label="Execution trace events" tabIndex={0}>
          {visibleRun.steps.map((step, index) => <li key={index} data-kind={step.event.kind} ref={index === visibleRun.steps.length - 1 ? traceEnd : undefined}>
            <span className="agent-event-index">{index + 1}</span><div><button className="agent-trace-select" aria-label={`Inspect event ${index + 1}: ${step.event.label}`} aria-pressed={index === inspectedIndex} onClick={() => setInspectedStep(index)}>{step.event.label}</button><p>{step.event.detail}</p></div>
          </li>)}
        </ol> : <div className="agent-trace-empty"><span aria-hidden="true">↳</span><p>Your program has not run yet.</p><p>{play ? "Choose a prediction, then press Step to inspect one operation or Run to follow the whole loop." : "Use Step or Run to try your program."}</p></div>}
        {visibleRun ? <details className="agent-messages"><summary>What the model can see ({visibleRun.final.messages.length} messages)</summary><pre tabIndex={0}>{JSON.stringify(visibleRun.final.messages, null, 2)}</pre></details> : null}
        {!play?.workedExample ? inspection : null}
        <div role="status" className="agent-verdict" data-success={successful || undefined}>
          {run?.final.status === "stopped" ? "Stopped. Your program is unchanged. Run starts a new attempt." : running ? "Running your program..." : terminal ? <>
            <strong>{successful ? play?.mode === "challenge" ? "Your agent passed every case." : "Experiment complete." : "Your loop needs a change."}</strong>
            {play ? <p>{prediction === run!.final.status ? play.mode === "challenge" ? "Your prediction matches the first case." : "Your prediction matches this run." : "The result differs from your prediction. Inspect the first case's trace to find why."}</p> : null}
            {visibleRun ? <p>{explainRun(visibleRun)}</p> : null}
            {successful && play?.debrief ? <p className="agent-debrief">{play.debrief}</p> : null}
            {play?.mode === "challenge" && successful ? <p>{evidence.hints || evidence.solutionViewed ? "Completed with help. Help remains recorded for this challenge." : "Solved without hints or a revealed solution in this challenge."}</p> : null}
          </> : null}
        </div>
        {terminal && visibleRun && play?.pass === "success" ? <ul className="agent-checks" aria-label="Success checks">{checkAgent(visibleRun, selectedCase).map((check) => <li key={check.id}><span aria-hidden="true">{check.passed ? "✓" : "○"}</span>{check.label}: {check.passed ? "passed" : "not yet"}</li>)}</ul> : null}
      </section>
    </div>
    {play && play.mode !== "observe" ? <section className="agent-help" aria-label="Lesson help">
      <div><button disabled={running || hintCount >= play.hints.length} onClick={() => { const next = hintCount + 1; setHintCount(next); save({ ...evidence, hints: Math.max(evidence.hints, next) }); }}>Show hint {Math.min(hintCount + 1, 3)} of 3</button>
        <button disabled={running || solutionOpen} onClick={() => { setSolutionOpen(true); save({ ...evidence, solutionViewed: true }); }}>Show solution</button></div>
      {hintCount > 0 ? <ol>{play.hints.slice(0, hintCount).map((hint, index) => <li key={index}>{hint}</li>)}</ol> : null}
      {solutionOpen ? <div className="agent-solution"><p>{play.solutionExplanation ?? "A complete loop executes the tool, appends its matching result, and returns the final answer. The call limit stops an unfinished run."}</p>
        <pre tabIndex={0}><code>{programCode(solution)}</code></pre><button onClick={() => {
          const next = { ...program }; for (const key of play.editable) Object.assign(next, { [key]: solution[key] }); invalidate(next);
        }}>Apply the editable operations</button></div> : null}
    </section> : null}
    {!canSave ? <p role="status">This browser cannot save practice evidence. You can continue this lesson.</p> : null}
    {!play ? <details className="agent-sources"><summary>Sources and scope</summary><p>The sources explain tool feedback and stopping conditions. This lesson uses a simplified protocol and simulated model responses.</p>
      <ul>{lesson.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.claim}</a></li>)}</ul>
    </details> : null}
  </>;
}

export function AgentLessonView({ lesson, ...props }: LessonPlayerProps & { lesson: AgentLesson }) {
  return <LessonFlow {...props} lesson={lesson}
    renderPlay={(beat, onSettled, onUnsettled) => <AgentWorkbench lesson={lesson} beat={beat} onDeckChange={props.onDeckChange} onSettled={onSettled} onUnsettled={onUnsettled} />}
    renderFreePlay={(beat) => <AgentWorkbench lesson={lesson} beat={beat} onDeckChange={props.onDeckChange} />} />;
}

export default function ToolAgentLesson(props: LessonPlayerProps) {
  return <AgentLessonView {...props} lesson={loadAgentLesson("tool-using-agent")} />;
}

export function createAgentLessonPlayer(id: string) {
  const lesson = loadAgentLesson(id);
  return function AcceptedAgentLesson(props: LessonPlayerProps) { return <AgentLessonView {...props} lesson={lesson} />; };
}
