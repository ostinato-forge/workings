import { useState } from "react";
import {
  runTokenMachine,
  type TokenMachineRecord,
} from "../engine/token-machine";
import type { SamplingConfig } from "../engine/sampling";
import type { EngineProblem } from "../engine/run-record";
import type { TokenMachineLesson } from "../lessons/types";
import { DialControls } from "./DialControls";
import { ProbabilityBars } from "./ProbabilityBars";

type Phase =
  | { kind: "reading" }
  | { kind: "predicting"; caseIndex: 0 | 1 }
  | { kind: "revealed"; caseIndex: 0 | 1 }
  | { kind: "complete" };

function Evidence({
  record,
  lesson,
}: {
  record: TokenMachineRecord;
  lesson: TokenMachineLesson;
}) {
  const step = record.steps[0];
  if (step === undefined) return <p>The run produced no steps.</p>;
  const survivors = step.event.candidates.filter((c) => c.survived).length;
  return (
    <div>
      <p>
        Prompt: {record.config.prompt}. Sampled next token:{" "}
        {step.event.sampledToken}. {survivors} of{" "}
        {step.event.candidates.length} candidates survived the cut.
      </p>
      <ProbabilityBars
        candidates={step.event.candidates}
        sampledId={step.event.sampledId}
      />
      <p>
        Derived from this run: {
          lesson.options.find(
            (o) => o.id === lesson.deriveCorrectOption(record),
          )?.label
        }.
      </p>
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
  const [phase, setPhase] = useState<Phase>({ kind: "reading" });
  const [selections, setSelections] = useState<(string | null)[]>([null, null]);
  const [records, setRecords] = useState<(TokenMachineRecord | null)[]>([
    null,
    null,
  ]);
  const [freeSampling, setFreeSampling] = useState<SamplingConfig>({
    temperature: 1,
  });
  const [freeRecord, setFreeRecord] = useState<TokenMachineRecord | null>(null);
  const [freeProblem, setFreeProblem] = useState<EngineProblem | null>(null);

  const runCase = (caseIndex: 0 | 1): void => {
    const lessonCase = lesson.cases[caseIndex];
    const result = runTokenMachine(lesson.model, lesson.tokenizer, lessonCase.config);
    if (!result.ok) {
      throw new Error(`contract-tested case failed: ${result.problem.what}`);
    }
    setRecords((prev) => {
      const next = [...prev];
      next[caseIndex] = result.record;
      return next;
    });
    setPhase({ kind: "revealed", caseIndex });
  };

  const runFree = (): void => {
    const base = lesson.cases[0].config;
    const result = runTokenMachine(lesson.model, lesson.tokenizer, {
      ...base,
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

  return (
    <main>
      <p className="stage-title" aria-hidden="true">
        Stage {stageNumber}
      </p>
      <h1 className="stage-name">{lesson.title}</h1>

      {phase.kind === "reading" ? (
        <div className="phase-enter">
          {lesson.guideCards.map((card) => (
            <section key={card.id} className="panel">
              <h2>{card.title}</h2>
              <p>{card.body}</p>
            </section>
          ))}
          <button onClick={() => setPhase({ kind: "predicting", caseIndex: 0 })}>
            Start the first case
          </button>
        </div>
      ) : null}

      {phase.kind === "predicting" ? (
        <div className="phase-enter">
          <h2>Case {phase.caseIndex + 1}</h2>
          <p>{lesson.cases[phase.caseIndex].setup}</p>
          <fieldset>
            <legend>{lesson.cases[phase.caseIndex].question}</legend>
            {lesson.options.map((option) => (
              <label key={option.id} className="option-row">
                <input
                  type="radio"
                  name={`prediction-${phase.caseIndex}`}
                  checked={selections[phase.caseIndex] === option.id}
                  onChange={() =>
                    setSelections((prev) => {
                      const next = [...prev];
                      next[phase.caseIndex] = option.id;
                      return next;
                    })
                  }
                />{" "}
                {option.label}
              </label>
            ))}
          </fieldset>
          <div className="deck">
            <button
              className="start-button"
              disabled={selections[phase.caseIndex] === null}
              onClick={() => runCase(phase.caseIndex)}
            >
              Start
              <span className="start-sublabel">lock your guess and run</span>
            </button>
          </div>
        </div>
      ) : null}

      {phase.kind === "revealed" ? (
        <div className="phase-enter">
          <h2>Case {phase.caseIndex + 1}: what happened</h2>
          {(() => {
            const record = records[phase.caseIndex];
            if (record === null || record === undefined) {
              return <p>The run record is missing.</p>;
            }
            const derived = lesson.deriveCorrectOption(record);
            const guessed = selections[phase.caseIndex];
            return (
              <div>
                <p aria-live="polite" className="verdict">
                  {derived === guessed
                    ? "Your guess matches what happened."
                    : "Your guess does not match what happened."}
                </p>
                <Evidence record={record} lesson={lesson} />
              </div>
            );
          })()}
          {phase.caseIndex === 0 ? (
            <button onClick={() => setPhase({ kind: "predicting", caseIndex: 1 })}>
              On to the second case
            </button>
          ) : (
            <button
              onClick={() => {
                setPhase({ kind: "complete" });
                onComplete();
              }}
            >
              Finish the lesson
            </button>
          )}
        </div>
      ) : null}

      {phase.kind === "complete" ? (
        <div className="phase-enter">
          <h2>Free play</h2>
          <p>
            The lesson is complete. The dials are unlocked; running here is
            exploration, not assessment.
          </p>
          <div className="deck">
            <DialControls
              value={freeSampling}
              disabled={false}
              onChange={setFreeSampling}
            />
            <button onClick={runFree}>Run with these dials</button>
          </div>
          {freeProblem !== null ? (
            <div role="alert">
              <p>{freeProblem.what}</p>
              <p>{freeProblem.fix}</p>
            </div>
          ) : null}
          {freeRecord !== null ? (
            <Evidence record={freeRecord} lesson={lesson} />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
