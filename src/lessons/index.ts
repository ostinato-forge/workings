import { samplingDialsLesson } from "./sampling-dials";
import type { TokenMachineLesson } from "./types";

export const lessons: TokenMachineLesson[] = [samplingDialsLesson];

export function lessonById(id: string): TokenMachineLesson | undefined {
  return lessons.find((lesson) => lesson.id === id);
}
