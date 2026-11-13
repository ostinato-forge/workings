import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { CONTENT_SECURITY_POLICY } from "./content-security-policy";
import { distProblems } from "./check-dist";

const dirs: string[] = [];

function dist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "workings-dist-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

const page = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}"></head><body></body></html>`;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("production build check", () => {
  test("accepts a page with the policy and no development code", () => {
    expect(distProblems(dist({ "index.html": page, "assets/app.js": "console.log(1)" }))).toEqual([]);
  });

  test("accepts the policy when the build writes its quotes as character references", () => {
    const escaped = page.replaceAll("'", "&#39;");
    expect(distProblems(dist({ "index.html": escaped }))).toEqual([]);
  });

  test("reports a policy that comes after a script, because it would not cover that script", () => {
    const late = page.replace("<head>", "<head><script>window.early = 1</script>");
    expect(distProblems(dist({ "index.html": late }))[0]).toMatch(/Content-Security-Policy/);
  });

  test("reports a policy that is only inside a comment", () => {
    const commented = page.replace("<head>", "<head><!--").replace("</head>", "--></head>");
    expect(distProblems(dist({ "index.html": commented }))[0]).toMatch(/Content-Security-Policy/);
  });

  test("does not decode a character reference twice", () => {
    const twice = page.replaceAll("'", "&amp;#39;");
    expect(distProblems(dist({ "index.html": twice }))[0]).toMatch(/Content-Security-Policy/);
  });

  test("reports the development draft endpoint in a file of any type", () => {
    const problems = distProblems(dist({ "index.html": page, "worker.mjs": "x", "notes.txt": "see /__workings_draft" }));
    expect(problems).toEqual(["notes.txt contains the development-only draft endpoint."]);
  });

  test("reports a page without the policy", () => {
    const problems = distProblems(dist({ "index.html": "<!doctype html><html><head></head></html>" }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Content-Security-Policy/);
  });

  test("reports a weakened policy", () => {
    const weak = page.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
    expect(distProblems(dist({ "index.html": weak }))[0]).toMatch(/Content-Security-Policy/);
  });

  test("reports the development draft endpoint in any built file", () => {
    const problems = distProblems(dist({ "index.html": page, "assets/deep/app.js": 'fetch("/__workings_draft")' }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/assets\/deep\/app\.js/);
  });

  test("reports a missing build", () => {
    expect(distProblems(join(tmpdir(), "workings-no-such-dist"))[0]).toMatch(/index\.html/);
  });
});

describe("content security policy", () => {
  test("allows only this site's own scripts, styles, and connections", () => {
    const rules = Object.fromEntries(CONTENT_SECURITY_POLICY.split("; ").map((rule) => {
      const [name, ...values] = rule.split(" ");
      return [name, values.join(" ")];
    }));
    expect(rules["default-src"]).toBe("'self'");
    expect(rules["script-src"]).toBe("'self'");
    expect(rules["connect-src"]).toBe("'self'");
    expect(rules["object-src"]).toBe("'none'");
    expect(rules["base-uri"]).toBe("'none'");
    expect(rules["img-src"]).toBeUndefined();
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/data:|blob:/);
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });
});
