import type { ComponentType } from "react";
import type { LessonPlayerProps } from "./LessonFlow";
import generatedLessons from "../content/catalog.json";

export type LessonModule = {
  id: string;
  title: string;
  description: string;
  load: () => Promise<{ default: ComponentType<LessonPlayerProps> }>;
};

export type Course = {
  id: string;
  title: string;
  description: string;
  lessonIds: readonly string[];
};

export type Catalog = {
  courses: readonly Course[];
  lessons: readonly LessonModule[];
};

export function defineCatalog(catalog: Catalog): Catalog {
  for (const [name, entries] of [["course", catalog.courses], ["lesson", catalog.lessons]] as const) {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || !entry.title.trim()) {
        throw new Error(`Invalid ${name}: ${entry.id}`);
      }
      if (ids.has(entry.id)) throw new Error(`Duplicate ${name}: ${entry.id}`);
      ids.add(entry.id);
    }
  }
  const lessonIds = new Set(catalog.lessons.map((lesson) => lesson.id));
  for (const course of catalog.courses) {
    if (course.lessonIds.length === 0) throw new Error(`Course ${course.id} has no lessons`);
    if (new Set(course.lessonIds).size !== course.lessonIds.length) {
      throw new Error(`Course ${course.id} repeats a lesson`);
    }
    for (const id of course.lessonIds) {
      if (!lessonIds.has(id)) throw new Error(`Course ${course.id} refers to missing lesson ${id}`);
    }
  }
  return catalog;
}

export const catalog = defineCatalog({
  courses: [
    {
      id: "ai",
      title: "How AI works",
      description: "Build agents and explore how language models choose words.",
      lessonIds: [...generatedLessons.map((lesson: { id: string }) => lesson.id), "sampling-dials"],
    },
    {
      id: "ansible",
      title: "How Ansible works",
      description: "Edit a playbook, run it on practice servers, and see what changes.",
      lessonIds: ["desired-state"],
    },
  ],
  lessons: [
    ...generatedLessons.map((lesson: { id: string; title: string; description: string }) => ({
      ...lesson,
      load: async () => {
        const { createAgentLessonPlayer } = await import("../courses/ai/AgentLesson");
        return { default: createAgentLessonPlayer(lesson.id) };
      },
    })),
    {
      id: "sampling-dials",
      title: "Why the same question gets different answers",
      description: "Predict and compare the words a small model selects.",
      load: () => import("../courses/ai/SamplingLesson"),
    },
    {
      id: "desired-state",
      title: "Make changes that stay done",
      description: "Find out why a second playbook run can leave every server unchanged.",
      load: () => import("../courses/ansible/DesiredStateLesson"),
    },
  ],
});
