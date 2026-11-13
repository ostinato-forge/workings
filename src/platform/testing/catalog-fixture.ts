/*
 * A catalog with the same shape as the shipped one, for platform tests.
 * Its players render nothing, so the tests need no course code.
 */

import { defineCatalog, type LessonModule } from "../catalog";

function lesson(id: string, title: string): LessonModule {
  return { id, title, description: `Practice ${title.toLowerCase()}.`, load: async () => ({ default: () => null }) };
}

export const fixtureCatalog = defineCatalog({
  courses: [
    { id: "ai", title: "How AI works", description: "Agents and sampling.", lessonIds: ["tool-using-agent", "sampling-dials"] },
    { id: "ansible", title: "How Ansible works", description: "Desired state.", lessonIds: ["desired-state"] },
  ],
  lessons: [
    lesson("tool-using-agent", "Tool use"),
    lesson("sampling-dials", "Sampling dials"),
    lesson("desired-state", "Desired state"),
  ],
});
