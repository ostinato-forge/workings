import { lazy, Suspense, useEffect, useState } from "react";
import { lessonById, lessons } from "../lessons/index";
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
      <ErrorBoundary>
        <nav>
          <a href="#/">All lessons</a>
        </nav>
        <Suspense fallback={<p>Loading the lesson.</p>}>
          <LessonPlayer
            lesson={lesson}
            onComplete={() => {
              const next = { ...readProgress(), [lesson.id]: "complete" as const };
              localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
              setProgress(next);
            }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <main>
      <h1>Workings</h1>
      <p>Playable lessons on how the machine works.</p>
      <ol>
        {lessons.map((entry) => (
          <li key={entry.id}>
            <a href={`#/lesson/${entry.id}`}>{entry.title}</a>
            {progress[entry.id] === "complete" ? " (complete)" : ""}
          </li>
        ))}
      </ol>
    </main>
  );
}
