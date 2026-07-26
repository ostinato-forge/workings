import { useState } from "react";
import {
  runTokenMachine,
  type TokenMachineRecord,
} from "../engine/token-machine";
import type { SamplingConfig } from "../engine/sampling";
import type { EngineProblem } from "../engine/run-record";
import type {
  PredictBeat,
  TokenMachineLesson,
} from "../lessons/types";
import { DialControls } from "./DialControls";
import { ProbabilityBars } from "./ProbabilityBars";

function Evidence({
  beat,
  records,
}: {
  beat: PredictBeat;
  records: TokenMachineRecord[];
}) {
  const first = records[0];
  if (first === undefined) return <p>The run records are missing.</p>;
  const firstStep = first.steps[0];
  if (firstStep === undefined) return <p>The run produced no steps.</p>;
  return (
    <div>
      {beat.showEvidence === "all" ? (
        <div className="panel">
          {records.map((record, index) => {
            const step = record.steps[0];
            return step === undefined ? null : (
              <p key={record.seed}>
                Run {index + 1} (seed {record.seed}): picked{" "}
                {step.event.sampledToken}.
              </p>
            );
          })}
        </div>
      ) : null}
      <p>
        Prompt: {first.config.prompt}. Sampled next word:{" "}
        {firstStep.event.sampledToken}.{" "}
        {firstStep.event.candidates.filter((c) => c.survived).length} of{" "}
        {firstStep.event.candidates.length} words could win the draw.
      </p>
      <ProbabilityBars
        candidates={firstStep.event.candidates}
        sampledId={firstStep.event.sampledId}
      />
    </div>
  );
}

export function LessonPlayer({
  lesson,
  stageNumber,
  onComplete,
}: {
  lesson: TokenMachineLesson;
  stageNumber: number;
  onComplete: () => void;
}) {
  const [beatIndex, setBeatIndex] = useState(0);
  const [selection, setSelection] = useState<string | null>(null);
  const [records, setRecords] = useState<TokenMachineRecord[] | null>(null);
  const [completed, setCompleted] = useState(false);
  const [freeSampling, setFreeSampling] = useState<SamplingConfig>({
    temperature: 1,
  });
  const [freeRecord, setFreeRecord] = useState<TokenMachineRecord | null>(null);
  const [freeProblem, setFreeProblem] = useState<EngineProblem | null>(null);

  const beat = lesson.beats[beatIndex];

  const advance = (): void => {
    setSelection(null);
    setRecords(null);
    const next = beatIndex + 1;
    setBeatIndex(next);
    const upcoming = lesson.beats[next];
    if (upcoming?.kind === "free-play" && !completed) {
      setCompleted(true);
      onComplete();
    }
  };

  const runPredict = (predict: PredictBeat): void => {
    const results = predict.configs.map((config) =>
      runTokenMachine(lesson.model, lesson.tokenizer, config),
    );
    const failed = results.find((r) => !r.ok);
    if (failed !== undefined && !failed.ok) {
      throw new Error(`contract-tested beat failed: ${failed.problem.what}`);
    }
    setRecords(
      results.map((r) => {
        if (!r.ok) throw new Error("unreachable");
        return r.record;
      }),
    );
  };

  const runFree = (): void => {
    const freeBeat = lesson.beats.find((b) => b.kind === "free-play");
    if (freeBeat === undefined || freeBeat.kind !== "free-play") return;
    const result = runTokenMachine(lesson.model, lesson.tokenizer, {
      ...freeBeat.baseConfig,
      sampling: freeSampling,
    });
    if (result.ok) {
      setFreeRecord(result.record);
      setFreeProblem(null);
    } else {
      setFreeRecord(null);
      setFreeProblem(result.problem);
    }
  };

  if (beat === undefined) return <p>The lesson has no more beats.</p>;

  return (
    <main>
      <p className="stage-title" aria-hidden="true">
        Stage {stageNumber}
      </p>
      <h1 className="stage-name">{lesson.title}</h1>
      <p className="evidence-meta">
        Beat {beatIndex + 1} of {lesson.beats.length}
      </p>

      {beat.kind === "teach" || beat.kind === "recap" ? (
        <div className="phase-enter">
          <section className="panel">
            <h2>{beat.title}</h2>
            <p>{beat.body}</p>
          </section>
          <button onClick={advance}>Continue</button>
        </div>
      ) : null}

      {beat.kind === "predict" ? (
        <div className="phase-enter">
          <p className="panel">{beat.setup}</p>
          {records === null ? (
            <div>
              <fieldset>
                <legend>{beat.question}</legend>
                {beat.options.map((option) => (
                  <label key={option.id} className="option-row">
                    <input
                      type="radio"
                      name={`prediction-${beat.id}`}
                      checked={selection === option.id}
                      onChange={() => setSelection(option.id)}
                    />{" "}
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <div className="deck">
                <button
                  className="start-button"
                  disabled={selection === null}
                  onClick={() => runPredict(beat)}
                >
                  Start
                  <span className="start-sublabel">lock your guess and run</span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p aria-live="polite" className="verdict">
                {beat.deriveCorrectOption(records) === selection
                  ? "Your guess matches what happened."
                  : "Your guess does not match what happened."}{" "}
                {
                  beat.options.find(
                    (o) => o.id === beat.deriveCorrectOption(records),
                  )?.label
                }{" "}
                is what the run shows.
              </p>
              <Evidence beat={beat} records={records} />
              <button onClick={advance}>Continue</button>
            </div>
          )}
        </div>
      ) : null}

      {beat.kind === "free-play" ? (
        <div className="phase-enter">
          <h2>Free play</h2>
          <p>{beat.intro}</p>
          <div className="deck">
            <DialControls
              value={freeSampling}
              disabled={false}
              onChange={setFreeSampling}
            />
            <button onClick={runFree}>Run with these dials</button>
          </div>
          {freeProblem !== null ? (
            <div role="alert" className="panel">
              <p>{freeProblem.what}</p>
              <p>{freeProblem.fix}</p>
            </div>
          ) : null}
          {freeRecord !== null && freeRecord.steps[0] !== undefined ? (
            <ProbabilityBars
              candidates={freeRecord.steps[0].event.candidates}
              sampledId={freeRecord.steps[0].event.sampledId}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
