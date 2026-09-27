import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DeckProps, LessonNavigation } from "../shell/cabinet/ControlDeck";
import type { FreePlayBeatBase, Lesson, PlayBeatBase } from "./lesson";

export type LessonPlayerProps = {
  stageNumber: number;
  onDeckChange: (deck: DeckProps | null) => void;
  onNavigationChange: (navigation: LessonNavigation | null) => void;
  onComplete: () => void;
};

export function LessonFlow<Play extends PlayBeatBase, Free extends FreePlayBeatBase>({
  lesson,
  stageNumber,
  onDeckChange,
  onNavigationChange,
  onComplete,
  renderPlay,
  renderFreePlay,
}: LessonPlayerProps & {
  lesson: Lesson<Play, Free>;
  renderPlay: (beat: Play, onSettled: () => void, onUnsettled: () => void) => ReactNode;
  renderFreePlay: (beat: Free) => ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [settled, setSettled] = useState<Record<string, boolean>>({});
  const completed = useRef(false);
  const main = useRef<HTMLElement>(null);
  const beat = lesson.beats[index];

  useEffect(() => () => { onDeckChange(null); }, [onDeckChange]);

  useEffect(() => {
    main.current?.focus();
    main.current?.scrollTo(0, 0);
    if (beat?.kind !== "play" && beat?.kind !== "free-play") onDeckChange(null);
  }, [beat, onDeckChange]);

  const advance = () => {
    if (!beat) return;
    if (beat.kind === "play" && !settled[beat.id]) return;
    const next = lesson.beats[index + 1];
    if (next === undefined) return;
    if (next.kind === "play") setSettled((current) => ({ ...current, [next.id]: false }));
    if (next.kind === "free-play" && !completed.current) {
      completed.current = true;
      onComplete();
    }
    setIndex(index + 1);
  };

  useEffect(() => {
    const canAdvance = beat && index < lesson.beats.length - 1 && (beat.kind !== "play" || settled[beat.id]);
    onNavigationChange({
      onBack: index > 0 ? () => {
        const previous = lesson.beats[index - 1];
        if (previous) setSettled((current) => ({ ...current, [previous.id]: false }));
        setIndex(index - 1);
      } : undefined,
      onNext: canAdvance ? advance : undefined,
      hint: beat?.kind === "free-play" ? "Keep experimenting. Use Back to revisit the lesson."
        : canAdvance ? "Ready when you are. Press Next to continue."
        : beat?.kind === "play" && beat.navigationHint ? beat.navigationHint : "Make your prediction, then use Run to test it.",
    });
    return () => onNavigationChange(null);
  }, [beat, index, lesson, settled, onNavigationChange, onComplete]);

  if (beat === undefined) throw new Error("This lesson is missing a step.");

  return (
    <main ref={main} tabIndex={-1}>
      <header className="lesson-heading">
      <p className="stage-title" aria-hidden="true">Stage {stageNumber}</p>
      <h1 className="stage-name">{lesson.title}</h1>
      <p className="lesson-progress evidence-meta">Step {index + 1} of {lesson.beats.length}</p>
      </header>

      {beat.kind === "teach" || beat.kind === "recap" ? (
        <div className="phase-enter" key={beat.id}>
          <section className="panel">
            <h2>{beat.title}</h2>
            <p>{beat.body}</p>
          </section>
        </div>
      ) : null}

      {beat.kind === "play" ? (
        <div className="phase-enter" key={beat.id}>
          {renderPlay(beat, () => setSettled((value) => value[beat.id] ? value : ({ ...value, [beat.id]: true })),
            () => setSettled((value) => !value[beat.id] ? value : ({ ...value, [beat.id]: false })))}
        </div>
      ) : null}

      {beat.kind === "free-play" ? (
        <div className="phase-enter" key={beat.id}>
          <h2>Free play</h2>
          <p>{beat.intro}</p>
          {renderFreePlay(beat)}
        </div>
      ) : null}
    </main>
  );
}
