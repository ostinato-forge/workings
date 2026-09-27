import { useEffect, useRef, useState } from "react";
import {
  runTokenMachine,
  type TokenMachineRecord,
} from "../engine/token-machine";
import type { SamplingConfig } from "../engine/sampling";
import type { EngineProblem } from "../engine/run-record";
import type { PlayBeat, FreePlayBeat, TokenMachineLesson } from "../lessons/types";
import type { DeckProps } from "../shell/cabinet/ControlDeck";
import { OddsBoard } from "./OddsBoard";
import { ProbabilityBars } from "./ProbabilityBars";
import { RunRail } from "./RunRail";
import { SentenceTrack } from "./SentenceTrack";

import { LessonFlow, type LessonPlayerProps } from "../platform/LessonFlow";
import { samplingControls } from "./sampling-controls";

const STEP_MS = 650;

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function PlaySurface({
  lesson,
  beat,
  onSettled,
  onDeckChange,
}: {
  lesson: TokenMachineLesson;
  beat: PlayBeat;
  onSettled: (records: TokenMachineRecord[]) => void;
  onDeckChange: (deck: DeckProps | null) => void;
}) {
  const [sampling, setSampling] = useState<SamplingConfig>({
    temperature: 1,
    ...beat.requires.locked,
  });
  const [predictionChoice, setPredictionChoice] = useState<string | null>(null);
  const [records, setRecords] = useState<TokenMachineRecord[]>([]);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [revealedSteps, setRevealedSteps] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const active =
    replayIndex === null ? records[records.length - 1] : records[replayIndex];
  const satisfied = beat.requires.satisfied(sampling);
  const settled = records.length >= beat.minRuns;
  const seedsLeft = records.length < beat.seeds.length;

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearInterval(timer.current);
    };
  }, []);

  const startReplay = (record: TokenMachineRecord): void => {
    if (timer.current !== null) clearInterval(timer.current);
    if (reducedMotion()) {
      setRevealedSteps(record.steps.length);
      return;
    }
    setRevealedSteps(0);
    timer.current = setInterval(() => {
      setRevealedSteps((prev) => {
        if (prev + 1 >= record.steps.length && timer.current !== null) {
          clearInterval(timer.current);
          timer.current = null;
        }
        return Math.min(prev + 1, record.steps.length);
      });
    }, STEP_MS);
  };

  const runOnce = (): void => {
    const seed = beat.seeds[records.length];
    if (seed === undefined) return;
    const result = runTokenMachine(lesson.model, lesson.tokenizer, {
      prompt: beat.prompt,
      maxNewTokens: beat.maxNewTokens,
      sampling,
      seed,
    });
    if (!result.ok) {
      throw new Error(`play beat rejected its run: ${result.problem.what}`);
    }
    const next = [...records, result.record];
    setRecords(next);
    setReplayIndex(null);
    startReplay(result.record);
    if (next.length >= beat.minRuns) onSettled(next);
  };

  useEffect(() => {
    onDeckChange({
      activated: true,
      dials: samplingControls(
        sampling,
        (change) => setSampling((current) => ({ ...current, ...change })),
        settled || records.length > 0,
        beat.requires.locked,
      ),
      canStart: predictionChoice !== null && satisfied && seedsLeft,
      startSublabel:
        records.length === 0
          ? "lock your prediction and run"
          : `run again (${records.length} of ${beat.minRuns} needed)`,
      onStart: runOnce,
      onStop: () => {
        if (timer.current !== null) {
          clearInterval(timer.current);
          timer.current = null;
        }
      },
    });
  }, [
    beat,
    predictionChoice,
    onDeckChange,
    records.length,
    sampling,
    satisfied,
    seedsLeft,
    settled,
  ]);

  return (
    <div>
      <p className="panel">{beat.goal}</p>
      <p className={satisfied ? "requirement" : "requirement unmet"}>
        {beat.requires.description}
        {satisfied ? "" : " Use the TEMPERATURE knob on the deck."}
      </p>
      <fieldset>
        <legend>{beat.prediction.question}</legend>
        {beat.prediction.options.map((option) => (
          <label key={option.id} className="option-row">
            <input
              type="radio"
              name={`prediction-${beat.id}`}
              checked={predictionChoice === option.id}
              disabled={records.length > 0}
              onChange={() => setPredictionChoice(option.id)}
            />{" "}
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="playfield">
        <div>
          {active !== undefined ? (
            <div>
              <SentenceTrack record={active} revealedSteps={revealedSteps} />
              <OddsBoard
                record={active}
                stepIndex={Math.max(0, Math.min(revealedSteps, active.steps.length) - 1)}
              />
            </div>
          ) : (
            <p className="evidence-meta">
              The machine is idle. Make your prediction and press Run.
            </p>
          )}
        </div>
        <RunRail
          records={records}
          selected={replayIndex}
          onSelect={(index) => {
            const record = records[index];
            if (record === undefined) return;
            setReplayIndex(index);
            startReplay(record);
          }}
        />
      </div>
      {settled && predictionChoice !== null ? (
        <p aria-live="polite" className="verdict">
          {beat.prediction.deriveCorrectOption(records) === predictionChoice
            ? "Your prediction matches what your runs show."
            : "Your prediction does not match what your runs show."}{" "}
          {
            beat.prediction.options.find(
              (o) => o.id === beat.prediction.deriveCorrectOption(records),
            )?.label
          }{" "}
          is what happened.
        </p>
      ) : null}
    </div>
  );
}

function FreePlaySurface({
  lesson,
  beat,
  onDeckChange,
}: {
  lesson: TokenMachineLesson;
  beat: FreePlayBeat;
  onDeckChange: LessonPlayerProps["onDeckChange"];
}) {
  const [sampling, setSampling] = useState<SamplingConfig>(beat.baseConfig.sampling);
  const [record, setRecord] = useState<TokenMachineRecord | null>(null);
  const [problem, setProblem] = useState<EngineProblem | null>(null);

  const run = () => {
    const result = runTokenMachine(lesson.model, lesson.tokenizer, {
      ...beat.baseConfig, sampling,
    });
    setRecord(result.ok ? result.record : null);
    setProblem(result.ok ? null : result.problem);
  };

  useEffect(() => {
    onDeckChange({
      activated: true,
      dials: samplingControls(sampling, (change) =>
        setSampling((current) => ({ ...current, ...change })), false, {}, true),
      canStart: true,
      startSublabel: "run with these dials",
      startLabel: "Run with these dials",
      onStart: run,
    });
  }, [beat, lesson, sampling, onDeckChange]);

  return <>
    <p className="evidence-meta">Adjust the cabinet dials, then press Run.</p>
    {problem ? <div role="alert" className="panel"><p>{problem.what}</p><p>{problem.fix}</p></div> : null}
    {record?.steps[0] ? <ProbabilityBars
      candidates={record.steps[0].event.candidates}
      sampledId={record.steps[0].event.sampledId}
    /> : null}
  </>;
}

export function LessonPlayer({ lesson, ...props }: LessonPlayerProps & {
  lesson: TokenMachineLesson;
}) {
  return <LessonFlow
    {...props}
    lesson={lesson}
    renderPlay={(beat, onSettled) => <PlaySurface
      lesson={lesson} beat={beat} onSettled={onSettled} onDeckChange={props.onDeckChange}
    />}
    renderFreePlay={(beat) => <FreePlaySurface
      lesson={lesson} beat={beat} onDeckChange={props.onDeckChange}
    />}
  />;
}
