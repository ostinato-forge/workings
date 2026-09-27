/*
 * The neutrality lint from the spec's copy rules: hype and deflation
 * registers both fail, em dashes are banned, cutesy diminutives are
 * banned. Checks ignore case and match the short word bet at word boundaries; each violation
 * names the banned phrase and quotes the offending string.
 */

const EM_DASH = String.fromCharCode(8212);

const BANNED: string[] = [
  EM_DASH,
  "revolutionary",
  "magic",
  "magical",
  "superhuman",
  "game-changing",
  "incredible",
  "amazing",
  "unbelievable",
  "thinks like a person",
  "reasons like a person",
  "understands you",
  "fancy autocomplete",
  "just autocomplete",
  "stochastic parrot",
  "just predicts",
  "merely predicts",
  "glorified",
  "dumb machine",
  "little app",
  "little something",
  "delightful",
  "bet",
  "wager",
];

export function lintCopy(strings: readonly string[]): string[] {
  const violations: string[] = [];
  for (const text of strings) {
    const lower = text.toLowerCase();
    for (const banned of BANNED) {
      const matches = banned === "bet" ? /\bbet(?:s|ting)?\b/.test(lower) : lower.includes(banned.toLowerCase());
      if (matches) {
        violations.push(`banned phrase "${banned}" in: ${text}`);
      }
    }
  }
  return violations;
}
