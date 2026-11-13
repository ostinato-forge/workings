import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/*
 * The platform must not depend on a subject, a course, or the cabinet, so
 * that any subject can be built on it. Every file under src/platform,
 * tests included, may import only other platform files and installed
 * packages.
 */

const platformDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(platformDir, "../..");
const manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } =
  JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const installed = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]);

const IMPORT_PATTERNS = [
  /\b(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
];

function importSpecifiers(source: string): string[] {
  return IMPORT_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1] ?? ""));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0] ?? "";
}

function importProblem(file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    const target = resolve(dirname(file), specifier);
    return target === platformDir || target.startsWith(platformDir + sep) ? null : "imports a file outside src/platform";
  }
  if (specifier.startsWith("node:")) return null;
  return installed.has(packageName(specifier)) ? null : "imports something that is not an installed package";
}

describe("platform layering", () => {
  test("finds static, side-effect, type, and dynamic imports", () => {
    expect(importSpecifiers([
      'import { a } from "./a";',
      'import type {\n  B,\n} from "./b";',
      'export * from "./c";',
      'import "./d.css";',
      'const e = () => import("./e");',
    ].join("\n"))).toEqual(["./a", "./b", "./c", "./d.css", "./e"]);
  });

  test("platform files import only platform files and installed packages", () => {
    const files = sourceFiles(platformDir);
    expect(files.length).toBeGreaterThan(10);
    const problems = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return importSpecifiers(source).flatMap((specifier) => {
        const problem = importProblem(file, specifier);
        return problem === null ? [] : [`${relative(rootDir, file)} ${problem}: ${specifier}`];
      });
    });
    expect(problems).toEqual([]);
  });

  test("only tests import the platform's test support", () => {
    const testingDir = join(platformDir, "testing");
    const appFiles = sourceFiles(resolve(platformDir, "..")).filter((file) =>
      !/\.test\.tsx?$/.test(file) && !file.startsWith(testingDir + sep));
    const problems = appFiles.flatMap((file) => importSpecifiers(readFileSync(file, "utf8"))
      .filter((specifier) => specifier.startsWith(".") && resolve(dirname(file), specifier).startsWith(testingDir + sep))
      .map((specifier) => `${relative(rootDir, file)}: ${specifier}`));
    expect(problems).toEqual([]);
  });
});
