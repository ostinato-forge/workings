/*
 * Every string the shell surfaces, in one module, so the lint suite covers
 * shell copy the same way it covers lesson copy.
 */
export const SHELL_COPY = {
  marquee: "Workings",
  listTitle: "Choose a stage",
  listIntro: "Playable lessons on how the machine works.",
  completeTag: "complete",
  backToList: "All stages",
  loading: "Loading the lesson.",
  errorLead: "This lesson hit an error and stopped:",
  errorRecovery:
    "The rest of the app still works. Use the back link to return to the stage list.",
  errorBack: "Back to the stage list",
} as const;

export function shellCopyStrings(): string[] {
  return Object.values(SHELL_COPY);
}
