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

// Space and comments that may sit between a call and its first argument.
const GAP = String.raw`(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*)*`;
// A quoted or template string. A template keeps its ${...} parts, so the
// fixed start of the path still decides where it points.
const LITERAL = String.raw`(?<quote>["'\`])(?<path>(?:(?!\k<quote>)[\s\S])*)\k<quote>`;

const IMPORT_PATTERNS = [
  /\b(?:import|export)\s[^;]*?\bfrom\s*(?<quote>["'])(?<path>[^"']+)\k<quote>/g,
  /\bimport\s*(?<quote>["'])(?<path>[^"']+)\k<quote>/g,
  new RegExp(String.raw`\bimport\s*\(${GAP}${LITERAL}`, "g"),
  new RegExp(String.raw`\brequire\s*\(${GAP}${LITERAL}`, "g"),
  // Covers new Worker(new URL(...)) and any other asset URL.
  new RegExp(String.raw`\bnew\s+URL\s*\(${GAP}${LITERAL}${GAP},${GAP}import\.meta\.url\b`, "g"),
  new RegExp(String.raw`\bimport\.meta\.glob(?:Eager)?\s*\(${GAP}${LITERAL}`, "g"),
];

// import.meta.glob also takes a list of patterns, and a pattern that starts
// with "!" leaves files out.
const GLOB_LIST = new RegExp(String.raw`\bimport\.meta\.glob(?:Eager)?\s*\(${GAP}\[(?<list>[^\]]*)\]`, "g");
const LIST_ITEM = new RegExp(LITERAL, "g");

function importSpecifiers(source: string): string[] {
  const single = IMPORT_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match.groups?.path ?? ""));
  const listed = [...source.matchAll(GLOB_LIST)].flatMap((match) => [...(match.groups?.list ?? "").matchAll(LIST_ITEM)]
    .map((item) => (item.groups?.path ?? "").replace(/^!/, "")));
  return [...single, ...listed];
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

  test.each([
    ["import.meta.glob with one pattern", 'const pages = import.meta.glob("./pages/*.ts");', ["./pages/*.ts"]],
    ["import.meta.glob with a list of patterns", "const pages = import.meta.glob(['./a/*.ts', \"!./a/skip.ts\"]);", ["./a/*.ts", "./a/skip.ts"]],
    ["import.meta.glob with options", "import.meta.glob(\n  './b/*.ts',\n  { eager: true },\n);", ["./b/*.ts"]],
    ["a worker from a URL", 'const worker = new Worker(new URL("./run.worker.ts", import.meta.url), { type: "module" });', ["./run.worker.ts"]],
    ["a URL relative to the module", "const icon = new URL('./icon.svg', import.meta.url).href;", ["./icon.svg"]],
    ["require", 'const a = require("./a");', ["./a"]],
    ["require with a comment before the path", "const a = require(/* why */ './a');", ["./a"]],
    ["dynamic import with a template literal", "const page = await import(`./pages/${name}.ts`);", ["./pages/${name}.ts"]],
    ["dynamic import with a comment before the path", 'const e = () => import(/* @vite-ignore */ "./e");', ["./e"]],
    ["dynamic import with a line comment before the path", "const e = () => import(\n  // lazy\n  './e'\n);", ["./e"]],
  ])("finds %s", (_name, source, expected) => {
    expect(importSpecifiers(source)).toEqual(expected);
  });

  test("files outside tests and test support import nothing from vitest", () => {
    const testingDir = join(platformDir, "testing");
    const appFiles = sourceFiles(platformDir).filter((file) => !/\.test\.tsx?$/.test(file) && !file.startsWith(testingDir + sep));
    const problems = appFiles.filter((file) => importSpecifiers(readFileSync(file, "utf8")).some((specifier) => packageName(specifier) === "vitest"))
      .map((file) => relative(rootDir, file));
    expect(problems).toEqual([]);
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
