/*
 * Every string the shell surfaces, in one module, so the lint suite covers
 * shell copy the same way it covers lesson copy.
 */
export const SHELL_COPY = {
  marquee: "Workings",
  listTitle: "What do you want to understand?",
  listIntro: "Choose a course. Predict what will happen, change something, and inspect the result.",
  completeTag: "complete",
  allCourses: "All courses",
  savedProgress: "Progress is saved in this browser.",
  progressNote: "A complete lesson means you finished its guided experiments.",
  unsavedProgress: "Progress cannot be saved in this browser. It will last until you close or reload this page.",
  missingTitle: "This lesson or course is not available",
  missingBody: "The link may be out of date. Choose a course to continue.",
  loading: "Loading the lesson.",
  errorLead: "This lesson hit an error and stopped:",
  errorRecovery:
    "Return to the courses to choose another lesson, or reload to try this lesson again.",
  errorBack: "Back to courses",
} as const;

export function shellCopyStrings(): string[] {
  return Object.values(SHELL_COPY);
}
