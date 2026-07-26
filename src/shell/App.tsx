import { lazy, Suspense, useEffect, useState } from "react";
import { lessonById, lessons } from "../lessons/index";
import { Cabinet } from "./Cabinet";
import { SHELL_COPY } from "./copy";
import { ErrorBoundary } from "./ErrorBoundary";

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

export function App() {
  const hash = useHashRoute();
  const [progress, setProgress] = useState(readProgress);

  const lessonMatch = /^#\/lesson\/(.+)$/.exec(hash);
  const lesson = lessonMatch ? lessonById(lessonMatch[1] as string) : undefined;

  if (lesson !== undefined) {
    return (
      <Cabinet>
        <ErrorBoundary>
          <nav>
            <a href="#/">{SHELL_COPY.backToList}</a>
          </nav>
          <Suspense fallback={<p>{SHELL_COPY.loading}</p>}>
            <LessonPlayer
              lesson={lesson}
              stageNumber={1}
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
      </Cabinet>
    );
  }

  return (
    <Cabinet>
      <main>
        <h1>{SHELL_COPY.listTitle}</h1>
        <p>{SHELL_COPY.listIntro}</p>
        <ol className="stage-list">
          {lessons.map((entry, index) => (
            <li key={entry.id}>
              <a href={`#/lesson/${entry.id}`}>
                <span className="stage-tag" aria-hidden="true">
                  Stage {index + 1}
                </span>
                <span>{entry.title}</span>
                {progress[entry.id] === "complete" ? (
                  <span className="complete-tag">{SHELL_COPY.completeTag}</span>
                ) : null}
              </a>
            </li>
          ))}
        </ol>
      </main>
    </Cabinet>
  );
}
