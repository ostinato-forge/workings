import { useEffect, useRef, useState } from "react";
import { LessonFlow, type LessonPlayerProps } from "../../platform/LessonFlow";
import { desiredStateLesson, guidedPlaybook, initialHosts, initialSource, type AnsiblePlayBeat } from "./desired-state";
import { parsePlaybook, runSimulation, type HostState, type SimulationRun } from "./simulation";

function HostTable({ hosts }: { hosts: HostState[] }) {
  return <div className="table-scroll"><table className="host-table">
    <caption>Practice servers before the next run</caption>
    <thead><tr><th scope="col">Server</th><th scope="col">Nginx package</th><th scope="col">Service</th></tr></thead>
    <tbody>{hosts.map((host) => <tr key={host.id}>
      <th scope="row">{host.id}</th>
      <td>{host.packageInstalled ? "Installed" : "Absent"}</td>
      <td>{host.serviceRunning ? "Running" : "Stopped"}</td>
    </tr>)}</tbody>
  </table></div>;
}

function Results({ runs }: { runs: SimulationRun[] }) {
  return <ol className="ansible-runs" aria-label="Playbook run results">
    {runs.map((run, index) => <li key={index}>
      <h2>Run {index + 1}: {run.changedCount} changed, {run.failedCount} failed</h2>
      <ul>{run.tasks.flatMap(({ task, results }) => results.map((result) => (
        <li key={`${task.id}:${result.hostId}`}>
          <strong>{result.hostId}: {result.status}</strong>. {task.name}. {result.detail}.
        </li>
      )))}</ul>
    </li>)}
  </ol>;
}

function AnsibleWorkbench({ beat, onSettled, onDeckChange }: {
  beat?: AnsiblePlayBeat;
  onSettled?: () => void;
  onDeckChange: LessonPlayerProps["onDeckChange"];
}) {
  const [source, setSource] = useState(initialSource);
  const [choice, setChoice] = useState<string | null>(null);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const hosts = runs[runs.length - 1]?.hosts ?? beat?.initialHosts ?? initialHosts;
  const settled = beat !== undefined && runs.length >= beat.minRuns;
  const canRun = !settled && (beat === undefined || choice !== null);
  const locked = beat !== undefined && runs.length > 0;

  const run = () => {
    if (!canRun) return;
    try {
      const playbook = beat ? guidedPlaybook(source, beat) : parsePlaybook(source);
      const result = runSimulation(playbook, hosts);
      const next = [...runs, result];
      setRuns(next);
      setProblem(null);
      if (beat && next.length >= beat.minRuns && result.failedCount === 0) onSettled?.();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  // The deck gets its handlers one frame after a state change. Calling through a
  // ref means a press in that frame still runs with the current state.
  const latestRun = useRef(run);
  latestRun.current = run;

  useEffect(() => {
    onDeckChange({
      activated: true, dials: [], canStart: canRun,
      startSublabel: runs.length === 0 ? "run the playbook" : "run the same playbook again",
      startLabel: runs.length === 0 ? "Run playbook" : "Run playbook again",
      onStart: () => latestRun.current(),
      onReset: !beat ? () => { setRuns([]); setProblem(null); } : undefined,
    });
  }, [beat, source, choice, runs, canRun, onDeckChange]);

  return <>
    {beat ? <p className="workbench-goal">{beat.goal}</p> : null}
    <div className="ansible-workspace">
    <section className="ansible-editor">
    <label className="editor-label" htmlFor="playbook-source">Playbook YAML</label>
    <textarea id="playbook-source" className="playbook-editor" spellCheck={false}
      value={source} readOnly={locked} aria-describedby="playbook-help"
      onChange={(event) => { setSource(event.target.value); setProblem(null); }} />
    <p id="playbook-help" className="evidence-meta">
      {locked ? "The playbook is fixed for these repeat runs." : "Edit the YAML, then run it to inspect each task result."}
    </p>
    </section>
    <section className="ansible-evidence" aria-label="Practice servers and results">
    <HostTable hosts={hosts} />
    {beat ? <fieldset>
      <legend>{beat.prediction.question}</legend>
      {beat.prediction.options.map((option) => <label className="option-row" key={option.id}>
        <input type="radio" name={`prediction-${beat.id}`} checked={choice === option.id}
          disabled={locked} onChange={() => setChoice(option.id)} /> {option.label}
      </label>)}
    </fieldset> : null}
    {problem ? <p role="alert" className="panel">{problem}</p> : null}
    <p role="status" className="evidence-meta">
      {runs.length > 0 ? `${runs.length} ${runs.length === 1 ? "run" : "runs"} recorded.${beat && !settled ? ` Complete ${beat.minRuns} runs to continue.` : ""}` : ""}
    </p>
    {runs.length ? <Results runs={runs} /> : <div className="run-empty"><span aria-hidden="true">↳</span>
      <h2>Run results</h2><p>Make your prediction, then press Run on the cabinet.</p></div>}
    {beat && settled ? <p className="verdict" role="status">
      {beat.prediction.deriveCorrectOption(runs) === choice
        ? "Your prediction matches what your runs show."
        : "Your prediction does not match what your runs show."} Read the task results before continuing.
    </p> : null}
    </section>
    </div>
    <p className="simulation-note">Browser simulation of Ansible. These practice servers are not real machines.</p>
  </>;
}

export default function DesiredStateLesson(props: LessonPlayerProps) {
  return <LessonFlow
    {...props} lesson={desiredStateLesson}
    renderPlay={(beat, onSettled) => <AnsibleWorkbench
      beat={beat} onSettled={onSettled} onDeckChange={props.onDeckChange} />}
    renderFreePlay={() => <AnsibleWorkbench onDeckChange={props.onDeckChange} />}
  />;
}
