import { useEffect, useRef, useState } from "react";
import {
  runTokenMachine,
  type TokenMachineRecord,
} from "../engine/token-machine";
import type { SamplingConfig } from "../engine/sampling";
import type { EngineProblem } from "../engine/run-record";
import type { PlayBeat, TokenMachineLesson } from "../lessons/types";
import type { DeckProps } from "../shell/cabinet/ControlDeck";
import { DialControls } from "./DialControls";
import { OddsBoard } from "./OddsBoard";
import { ProbabilityBars } from "./ProbabilityBars";
import { RunRail } from "./RunRail";
import { SentenceTrack } from "./SentenceTrack";

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
  const [betChoice, setBetChoice] = useState<string | null>(null);
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
    const lockedDials = Object.keys(beat.requires.locked).filter(
      (key): key is "temperature" | "topK" =>
        key === "temperature" || key === "topK",
    );

    onDeckChange({
      activated: true,
      temperature: sampling.temperature,
      topK: sampling.topK ?? null,
      dialsEnabled: !settled,
      lockedDials,
      canStart: betChoice !== null && satisfied && seedsLeft,
      startSublabel:
        records.length === 0
          ? "lock your prediction and run"
          : `run again (${records.length} of ${beat.minRuns} needed)`,
      onTemperature: (next) =>
        setSampling((current) => ({ ...current, temperature: next })),
      onTopK: (next) =>
        setSampling((current) => ({ ...current, topK: next ?? undefined })),
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
    betChoice,
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
        <legend>{beat.bet.question}</legend>
        {beat.bet.options.map((option) => (
          <label key={option.id} className="option-row">
            <input
              type="radio"
              name={`bet-${beat.id}`}
              checked={betChoice === option.id}
              disabled={records.length > 0}
              onChange={() => setBetChoice(option.id)}
            />{" "}
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="deck">
        <button
          className="start-button"
          disabled={betChoice === null || !satisfied || !seedsLeft}
          onClick={runOnce}
        >
          Start
          <span className="start-sublabel">
            {records.length === 0
              ? "lock your prediction and run"
              : `run again (${records.length} of ${beat.minRuns} needed)`}
          </span>
        </button>
      </div>
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
              The machine is idle. Lock your prediction and press START.
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
      {settled && betChoice !== null ? (
        <p aria-live="polite" className="verdict">
          {beat.bet.deriveCorrectOption(records) === betChoice
            ? "Your prediction matches what your runs show."
            : "Your prediction does not match what your runs show."}{" "}
          {
            beat.bet.options.find(
              (o) => o.id === beat.bet.deriveCorrectOption(records),
            )?.label
          }{" "}
          is what happened.
        </p>
      ) : null}
    </div>
  );
}

export function LessonPlayer({
  lesson,
  stageNumber,
  onDeckChange,
  onComplete,
}: {
  lesson: TokenMachineLesson;
  stageNumber: number;
  onDeckChange: (deck: DeckProps | null) => void;
  onComplete: () => void;
}) {
  const [beatIndex, setBeatIndex] = useState(0);
  const [settledBeats, setSettledBeats] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState(false);
  const [freeSampling, setFreeSampling] = useState<SamplingConfig>({
    temperature: 1,
  });
  const [freeRecord, setFreeRecord] = useState<TokenMachineRecord | null>(null);
  const [freeProblem, setFreeProblem] = useState<EngineProblem | null>(null);

  const beat = lesson.beats[beatIndex];

  const advance = (): void => {
    const next = beatIndex + 1;
    setBeatIndex(next);
    const upcoming = lesson.beats[next];
    if (upcoming?.kind === "free-play" && !completed) {
      setCompleted(true);
      onComplete();
    }
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

  useEffect(() => {
    if (beat?.kind === "free-play") {
      onDeckChange({
        activated: true,
        temperature: freeSampling.temperature,
        topK: freeSampling.topK ?? null,
        dialsEnabled: true,
        lockedDials: [],
        canStart: true,
        startSublabel: "run with these dials",
        onTemperature: (next) =>
          setFreeSampling((current) => ({
            ...current,
            temperature: next,
          })),
        onTopK: (next) =>
          setFreeSampling((current) => ({
            ...current,
            topK: next ?? undefined,
          })),
        onStart: runFree,
        onStop: () => undefined,
      });
      return;
    }

    if (beat?.kind !== "play") onDeckChange(null);
  }, [beat, freeSampling, onDeckChange]);

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

      {beat.kind === "play" ? (
        <div className="phase-enter">
          <PlaySurface
            key={beat.id}
            lesson={lesson}
            beat={beat}
            onDeckChange={onDeckChange}
            onSettled={() =>
              setSettledBeats((prev) => ({ ...prev, [beat.id]: true }))
            }
          />
          {settledBeats[beat.id] === true ? (
            <button onClick={advance}>Continue</button>
          ) : null}
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
