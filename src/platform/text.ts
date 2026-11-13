// Learner text may use any of the three line endings, including a lone
// carriage return, so every platform check splits lines the same way.
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

// Line endings and trailing spaces are not visible to a learner, so a
// comparison of two texts ignores them.
export function normalizeText(text: string): string {
  return splitLines(text).map((line) => line.trimEnd()).join("\n");
}
