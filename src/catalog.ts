// The courses and lessons this build ships. The platform defines what a
// catalog is; this file supplies the concrete one.
import generatedLessons from "./content/catalog.json";
import { defineCatalog } from "./platform/catalog";

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
        const { createAgentLessonPlayer } = await import("./courses/ai/AgentLesson");
        return { default: createAgentLessonPlayer(lesson.id) };
      },
    })),
    {
      id: "sampling-dials",
      title: "Why the same question gets different answers",
      description: "Predict and compare the words a small model selects.",
      load: () => import("./courses/ai/SamplingLesson"),
    },
    {
      id: "desired-state",
      title: "Make changes that stay done",
      description: "Find out why a second playbook run can leave every server unchanged.",
      load: () => import("./courses/ansible/DesiredStateLesson"),
    },
  ],
});
