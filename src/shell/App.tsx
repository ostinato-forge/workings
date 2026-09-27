import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { catalog } from "../platform/catalog";
import { completeLesson, readProgress, saveProgress, type Progress } from "../platform/progress";
import { courseHref, lessonHref, resolveRoute } from "../platform/routes";
import { Cabinet } from "./cabinet/Cabinet";
import { CabinetProvider, useCabinet } from "./cabinet/CabinetState";
import { ControlDeck, type DeckProps, type LessonNavigation } from "./cabinet/ControlDeck";
import { CoinInsert } from "./cabinet/CoinInsert";
import { ErrorBoundary } from "./ErrorBoundary";
import { SHELL_COPY } from "./copy";

const players = new Map(catalog.lessons.map((lesson) => [lesson.id, lazy(lesson.load)]));
if (import.meta.env.DEV) players.set("draft-preview", lazy(() => import("../courses/ai/AgentDraftPreview")));

function loadProgress(): { progress: Progress; canSave: boolean } {
  try {
    return { progress: readProgress(localStorage, catalog), canSave: true };
  } catch {
    return { progress: {}, canSave: false };
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

function Screens() {
  const { coinInserted, insertCoin } = useCabinet();
  const hash = useHashRoute();
  const route = import.meta.env.DEV && hash === "#/preview" ? {
    kind: "lesson" as const, stageNumber: 1,
    course: { id: "ai", title: "Draft preview", description: "", lessonIds: ["draft-preview"] },
    lesson: { id: "draft-preview", title: "Draft preview", description: "", load: () => import("../courses/ai/AgentDraftPreview") },
  } : resolveRoute(hash, catalog);
  const [saved, setSaved] = useState(loadProgress);
  const [deck, setDeck] = useState<DeckProps | null>(null);
  const [navigation, setNavigation] = useState<LessonNavigation | null>(null);
  const main = useRef<HTMLElement>(null);
  const lessonKey = route.kind === "lesson" ? `${route.course.id}/${route.lesson.id}` : null;

  useEffect(() => {
    main.current?.focus();
    main.current?.scrollTo(0, 0);
  }, [hash, coinInserted]);

  const markComplete = useCallback(() => {
    if (route.kind !== "lesson") return;
    const progress = completeLesson(saved.progress, route.course.id, route.lesson.id);
    let canSave = true;
    try { saveProgress(localStorage, progress, catalog); }
    catch { canSave = false; }
    setSaved({ progress, canSave });
  }, [lessonKey, saved.progress]);

  if (!coinInserted) return <Cabinet screen={<CoinInsert onInsert={insertCoin} />} />;

  let screen;
  if (route.kind === "lesson") {
    const Player = players.get(route.lesson.id)!;
    screen = <>
      <nav className="screen-nav" aria-label="Course navigation">
        <a href="#/courses">{SHELL_COPY.allCourses}</a>
        <a href={courseHref(route.course.id)}>{route.course.title}</a>
      </nav>
      {!saved.canSave ? <p role="status" className="save-notice">{SHELL_COPY.unsavedProgress}</p> : null}
      <ErrorBoundary key={lessonKey}>
        <Suspense fallback={<main><p role="status">{SHELL_COPY.loading}</p></main>}>
          <Player key={lessonKey} stageNumber={route.stageNumber} onDeckChange={setDeck}
            onNavigationChange={setNavigation} onComplete={markComplete} />
        </Suspense>
      </ErrorBoundary>
    </>;
  } else if (route.kind === "course") {
    const { course } = route;
    const complete = course.lessonIds.filter((id) => saved.progress[course.id]?.[id] === "complete").length;
    screen = <>
      <nav className="screen-nav" aria-label="Course navigation"><a href="#/courses">{SHELL_COPY.allCourses}</a></nav>
      <main ref={main} tabIndex={-1}>
        <h1 className="screen-title">{course.title}</h1>
        <p className="screen-intro">{course.description}</p>
        <p className="course-progress">{complete} of {course.lessonIds.length} lessons complete</p>
        {!saved.canSave ? <p role="status">{SHELL_COPY.unsavedProgress}</p> : null}
        <ol className="stage-list">{course.lessonIds.map((id, index) => {
          const lesson = catalog.lessons.find((item) => item.id === id)!;
          return <li key={id}><a href={lessonHref(course.id, id)}>
            <span className="stage-tag" aria-hidden="true">{index + 1}</span>
            <span className="lesson-summary"><strong>{lesson.title}</strong><span>{lesson.description}</span></span>
            {saved.progress[course.id]?.[id] ? <span className="complete-tag">{SHELL_COPY.completeTag}</span> : null}
          </a></li>;
        })}</ol>
        <p className="evidence-meta">{saved.canSave ? SHELL_COPY.savedProgress : ""} {SHELL_COPY.progressNote}</p>
      </main>
    </>;
  } else if (route.kind === "missing") {
    screen = <main ref={main} tabIndex={-1}>
      <h1>{SHELL_COPY.missingTitle}</h1><p>{SHELL_COPY.missingBody}</p>
      <a className="recovery-link" href="#/courses">{SHELL_COPY.allCourses}</a>
    </main>;
  } else {
    screen = <main ref={main} tabIndex={-1}>
      <h1 className="screen-title">{SHELL_COPY.listTitle}</h1>
      <p className="screen-intro">{SHELL_COPY.listIntro}</p>
      <ul className="course-list">{catalog.courses.map((course) => {
        const complete = course.lessonIds.filter((id) => saved.progress[course.id]?.[id] === "complete").length;
        return <li key={course.id}>
          <a href={courseHref(course.id)}>
            <h2>{course.title}</h2><p>{course.description}</p>
            <span className="course-meta">{course.lessonIds.length} {course.lessonIds.length === 1 ? "lesson" : "lessons"} available · {complete} complete</span>
          </a>
        </li>;
      })}</ul>
      <p className="evidence-meta">{saved.canSave ? SHELL_COPY.savedProgress : ""} {SHELL_COPY.progressNote}</p>
      {!saved.canSave ? <p role="status">{SHELL_COPY.unsavedProgress}</p> : null}
    </main>;
  }

  const fallbackNavigation: LessonNavigation = {
    onBack: route.kind === "course" || route.kind === "missing" ? () => { window.location.hash = "/courses"; }
      : route.kind === "lesson" ? () => { window.location.hash = courseHref(route.course.id); } : undefined,
    hint: route.kind === "catalog" ? "Choose a course on the display to begin." : "Choose a lesson on the display.",
  };
  return <Cabinet screen={screen} deck={<ControlDeck experiment={lessonKey ? deck : null}
    navigation={lessonKey && navigation ? { ...navigation, onBack: navigation.onBack ?? fallbackNavigation.onBack } : fallbackNavigation} />} />;
}

export function App() {
  return <CabinetProvider><Screens /></CabinetProvider>;
}
