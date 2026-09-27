import type { Catalog, Course, LessonModule } from "./catalog";

export const courseHref = (courseId: string) => `#/courses/${courseId}`;
export const lessonHref = (courseId: string, lessonId: string) =>
  `${courseHref(courseId)}/lessons/${lessonId}`;

export type Route =
  | { kind: "catalog" }
  | { kind: "course"; course: Course }
  | { kind: "lesson"; course: Course; lesson: LessonModule; stageNumber: number }
  | { kind: "missing" };

export function resolveRoute(hash: string, catalog: Catalog): Route {
  if (["", "#", "#/", "#/courses"].includes(hash)) return { kind: "catalog" };
  // Keep the original AI lesson's saved links usable.
  const canonical = hash === "#/lesson/sampling-dials"
    ? lessonHref("ai", "sampling-dials")
    : hash;
  const match = /^#\/courses\/([a-z0-9-]+)(?:\/lessons\/([a-z0-9-]+))?$/.exec(canonical);
  if (!match) return { kind: "missing" };
  const course = catalog.courses.find((item) => item.id === match[1]);
  if (!course) return { kind: "missing" };
  if (match[2] === undefined) return { kind: "course", course };
  const lesson = catalog.lessons.find((item) => item.id === match[2]);
  const stage = course.lessonIds.indexOf(match[2]);
  if (!lesson || stage < 0) return { kind: "missing" };
  return { kind: "lesson", course, lesson, stageNumber: stage + 1 };
}
