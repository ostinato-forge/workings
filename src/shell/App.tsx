import { lazy, Suspense, useEffect, useState } from "react";
import { lessonById, lessons } from "../lessons/index";
import { Cabinet } from "./cabinet/Cabinet";
import { CabinetProvider, useCabinet } from "./cabinet/CabinetState";
import { ControlDeck, type DeckProps } from "./cabinet/ControlDeck";
import { CoinInsert } from "./cabinet/CoinInsert";
import { ErrorBoundary } from "./ErrorBoundary";
import { SHELL_COPY } from "./copy";

const LessonPlayer = lazy(() =>
  import("../workbench/LessonPlayer").then((m) => ({
    default: m.LessonPlayer,
  })),
);

const PROGRESS_KEY = "workings-progress";

function readProgress(): Record<string, "complete"> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}") as Record<
      string,
      "complete"
    >;
  } catch {
    return {};
  }
}

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

const IDLE_DECK: DeckProps = {
  activated: true,
  temperature: 1,
  topK: null,
  dialsEnabled: false,
  lockedDials: [],
  canStart: false,
  startSublabel: "enter a stage to play",
  onTemperature: () => undefined,
  onTopK: () => undefined,
  onStart: () => undefined,
  onStop: () => undefined,
};

function Screens() {
  const { coinInserted, insertCoin } = useCabinet();
  const hash = useHashRoute();
  const [progress, setProgress] = useState(readProgress);
  const [deck, setDeck] = useState<DeckProps | null>(null);

  const lessonMatch = /^#\/lesson\/(.+)$/.exec(hash);
  const lesson = lessonMatch ? lessonById(lessonMatch[1] as string) : undefined;

  if (!coinInserted) {
    return (
      <Cabinet
        screen={<CoinInsert onInsert={insertCoin} />}
        deck={<ControlDeck {...{ ...IDLE_DECK, activated: false }} />}
      />
    );
  }

  if (lesson !== undefined) {
    return (
      <Cabinet
        screen={
          <ErrorBoundary>
            <nav className="screen-nav">
              <a href="#/">{SHELL_COPY.backToList}</a>
            </nav>
            <Suspense fallback={<p>{SHELL_COPY.loading}</p>}>
              <LessonPlayer
                lesson={lesson}
                stageNumber={1}
                onDeckChange={setDeck}
                onComplete={() => {
                  const next = {
                    ...readProgress(),
                    [lesson.id]: "complete" as const,
                  };
                  localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
                  setProgress(next);
                }}
              />
            </Suspense>
          </ErrorBoundary>
        }
        deck={<ControlDeck {...(deck ?? IDLE_DECK)} />}
      />
    );
  }

  return (
    <Cabinet
      screen={
        <main>
          <h1 className="screen-title">{SHELL_COPY.listTitle}</h1>
          <p className="screen-intro">{SHELL_COPY.listIntro}</p>
          <ol className="stage-list">
            {lessons.map((entry, index) => (
              <li key={entry.id}>
                <a href={`#/lesson/${entry.id}`}>
                  <span className="stage-tag" aria-hidden="true">
                    Stage {index + 1}
                  </span>
                  <span>{entry.title}</span>
                  {progress[entry.id] === "complete" ? (
                    <span className="complete-tag">
                      {SHELL_COPY.completeTag}
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ol>
        </main>
      }
      deck={<ControlDeck {...IDLE_DECK} />}
    />
  );
}

export function App() {
  return (
    <CabinetProvider>
      <Screens />
    </CabinetProvider>
  );
}
