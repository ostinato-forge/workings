import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_SECURITY_POLICY } from "./content-security-policy";

// The development server serves a local draft at this address. It must never ship.
const DEVELOPMENT_ONLY = "__workings_draft";

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

// A policy in a meta tag covers only what the browser reads after it, so the tag
// must be the first thing in the head. The build writes quotes as character references.
function declaredPolicy(html: string): string | null {
  const content = /<head>\s*<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1];
  if (content === undefined) return null;
  return content.replaceAll("&#39;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}

/* Returns one plain sentence per problem found in a production build. */
export function distProblems(dir: string): string[] {
  const index = join(dir, "index.html");
  if (!existsSync(index)) return [`No build found: ${index} is missing. Run the build first.`];
  const problems: string[] = [];
  if (declaredPolicy(readFileSync(index, "utf8")) !== CONTENT_SECURITY_POLICY) {
    problems.push("index.html does not declare the expected Content-Security-Policy.");
  }
  for (const file of filesUnder(dir)) {
    if (readFileSync(file).includes(DEVELOPMENT_ONLY)) {
      problems.push(`${relative(dir, file)} contains the development-only draft endpoint.`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = distProblems(fileURLToPath(new URL("../dist", import.meta.url)));
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log("build check passed");
}
