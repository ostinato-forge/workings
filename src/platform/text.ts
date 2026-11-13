// Learner text may use any of the three line endings, including a lone
// carriage return, so every platform check splits lines the same way.
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

// Lesson data and messages from another context can hold any value where
// a name belongs, and turning an object into text can throw. Only plain
// values are printed. Anything else is called "that".
export function quotedName(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "number" || typeof value === "boolean") return `"${value.toString()}"`;
  return "that";
}

// Code can throw any value, and even an Error can have a message that
// throws when read, so the message is read with care.
export function thrownMessage(error: unknown): string {
  try {
    if (error instanceof Error) {
      const message: unknown = error.message;
      if (typeof message === "string") return message;
    }
    if (typeof error === "string") return error;
    if (typeof error === "number" || typeof error === "boolean") return error.toString();
  } catch {
    // Fall through to the plain sentence.
  }
  return "a value that is not an error";
}

// Line endings and trailing spaces are not visible to a learner, so a
// comparison of two texts ignores them.
export function normalizeText(text: string): string {
  return splitLines(text).map((line) => line.trimEnd()).join("\n");
}
