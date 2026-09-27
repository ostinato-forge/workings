import type { Catalog } from "./catalog";

export const PROGRESS_KEY = "workings-course-progress-v1";
const LEGACY_KEY = "workings-progress";
export type Progress = Record<string, Record<string, "complete">>;
type ProgressStorage = Pick<Storage, "getItem" | "setItem">;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function decodeProgress(raw: string | null, catalog: Catalog): Progress {
  const progress: Progress = {};
  try {
    const data: unknown = JSON.parse(raw ?? "null");
    if (!object(data)) return progress;
    for (const course of catalog.courses) {
      const saved = data[course.id];
      if (!object(saved)) continue;
      const complete: Record<string, "complete"> = {};
      for (const id of course.lessonIds) {
        if (saved[id] === "complete") {
          complete[id] = "complete";
        }
      }
      if (Object.keys(complete).length > 0) progress[course.id] = complete;
    }
  } catch {
    // Invalid saved data starts a fresh session.
  }
  return progress;
}

export function readProgress(storage: ProgressStorage, catalog: Catalog): Progress {
  const raw = storage.getItem(PROGRESS_KEY);
  if (raw !== null) return decodeProgress(raw, catalog);
  try {
    const old: unknown = JSON.parse(storage.getItem(LEGACY_KEY) ?? "null");
    if (object(old) && old["sampling-dials"] === "complete") {
      return decodeProgress(JSON.stringify({ ai: { "sampling-dials": "complete" } }), catalog);
    }
  } catch {
    // Leave legacy data intact when it cannot be read.
  }
  return {};
}

export function completeLesson(progress: Progress, courseId: string, lessonId: string): Progress {
  return { ...progress, [courseId]: { ...progress[courseId], [lessonId]: "complete" } };
}

export function saveProgress(storage: ProgressStorage, progress: Progress, catalog: Catalog): void {
  const merged = readProgress(storage, catalog);
  for (const [courseId, lessons] of Object.entries(progress)) {
    merged[courseId] = { ...merged[courseId], ...lessons };
  }
  storage.setItem(PROGRESS_KEY, JSON.stringify(decodeProgress(JSON.stringify(merged), catalog)));
}
