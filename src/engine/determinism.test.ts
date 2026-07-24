import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

test("no wall-clock or unseeded randomness in src or models", () => {
  const files = [...sourceFiles("src"), ...sourceFiles("models")];
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    expect(text.includes("Math.random"), `${file} uses Math.random`).toBe(false);
    expect(text.includes("Date.now"), `${file} uses Date.now`).toBe(false);
  }
});
