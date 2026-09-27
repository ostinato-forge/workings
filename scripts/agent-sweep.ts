import { mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium, type Page, type Locator } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { parseAgentLesson, solutionProgram, type AgentLesson, type AgentPlayBeat } from "../src/training/agent-package";
import { runAgent, type AgentProgram } from "../src/engine/agent-loop";

const draft = process.argv.includes("--draft");
const base = draft ? "http://127.0.0.1:5173/" : "http://127.0.0.1:4174/";
const labels: Record<keyof AgentProgram, string> = {
  dispatch: "When the model requests a tool", observation: "After the tool returns", finish: "When the model returns an answer",
  maxTurns: "Maximum model calls", onError: "When a tool returns an error", retries: "Maximum retries after errors",
};
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function accessibility(page: Page, state: string) {
  const issues = (await new AxeBuilder({ page }).analyze()).violations.filter((issue) => ["serious", "critical"].includes(issue.impact ?? ""));
  assert(issues.length === 0, `${state}: ${issues.map((issue) => `${issue.id}: ${issue.nodes.map((node) => node.target.join()).join("; ")}`).join("\n")}`);
}
async function overflow(page: Page) {
  const bad = await page.evaluate(() => [...document.querySelectorAll(".wish-cabinet, .wish-screen-content, .deck-dome, .agent-workspace")].filter((element) => {
    const r = element.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1;
  }).map((element) => element.className));
  assert(bad.length === 0, `Horizontal overflow: ${bad.join(", ")}`);
}
async function enter(page: Page, lesson: AgentLesson) {
  await page.goto(`${base}${draft ? "#/preview" : `#/courses/ai/lessons/${lesson.id}`}`);
  const coin = page.getByRole("button", { name: /insert coin/i });
  if (await coin.isVisible()) await coin.click();
  await page.getByRole("heading", { name: lesson.title, exact: true }).waitFor();
}
async function predict(page: Page, beat: AgentPlayBeat, program: AgentProgram) {
  const outcome = runAgent(program, beat.cases[0]!).final.status;
  const option = beat.prediction.options.find((item) => item.id === outcome);
  assert(option, `${beat.id}: no prediction for ${outcome}`);
  await page.getByRole("radio", { name: option.label, exact: true }).check();
}
async function solve(page: Page, lesson: AgentLesson, beat: AgentPlayBeat): Promise<AgentProgram> {
  const solution = solutionProgram(lesson);
  const program = { ...beat.program };
  for (const key of beat.editable) {
    Object.assign(program, { [key]: solution[key] });
    await page.getByLabel(labels[key], { exact: true }).selectOption(String(solution[key]));
  }
  await predict(page, beat, program);
  return program;
}

async function focusByTab(page: Page, target: Locator) {
  for (let tabs = 0; tabs < 80; tabs++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Keyboard could not reach ${await target.getAttribute("aria-label")}`);
}

async function keyboardJourney(page: Page, lesson: AgentLesson) {
  await page.goto(`${base}${draft ? "#/preview" : `#/courses/ai/lessons/${lesson.id}`}`);
  await focusByTab(page, page.getByRole("button", { name: /insert coin/i }));
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: lesson.title, exact: true }).waitFor();
  for (const beat of lesson.beats) {
    if (beat.kind === "play") {
      const program = { ...beat.program };
      const solution = solutionProgram(lesson);
      for (const key of beat.editable) {
        Object.assign(program, { [key]: solution[key] });
        const select = page.getByLabel(labels[key], { exact: true });
        await focusByTab(page, select);
        const index = await select.evaluate((element, value) => [...(element as HTMLSelectElement).options].findIndex((option) => option.value === value), String(solution[key]));
        await page.keyboard.press("Home");
        for (let move = 0; move < index; move++) await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        assert(await select.inputValue() === String(solution[key]), "Keyboard did not set the block.");
      }
      await focusByTab(page, page.getByRole("radio").first());
      await page.keyboard.press("Space");
      const outcome = runAgent(program, beat.cases[0]!).final.status;
      const index = beat.prediction.options.findIndex((option) => option.id === outcome);
      for (let move = 0; move < index; move++) await page.keyboard.press("ArrowDown");
      await focusByTab(page, page.getByRole("button", { name: "Run agent", exact: true }));
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => !(document.querySelector('button[aria-label="Continue"]') as HTMLButtonElement)?.disabled);
    }
    if (beat.kind !== "free-play") {
      await focusByTab(page, page.getByRole("button", { name: "Continue", exact: true }));
      await page.keyboard.press("Enter");
    }
  }
  await page.getByRole("heading", { name: "Free play", exact: true }).waitFor();
}

async function main() {
  const metadata = draft ? [{ id: "draft" }] : JSON.parse(await readFile("src/content/catalog.json", "utf8")) as { id: string }[];
  assert(metadata.length > 0, "No accepted lessons to test.");
  const lessons = await Promise.all(metadata.map(async ({ id }) => parseAgentLesson(JSON.parse(await readFile(draft ? ".workings/preview.json" : `src/content/lessons/${id}.json`, "utf8")))));
  const server = draft ? null : spawn("node", ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4174", "--strictPort"], { stdio: "ignore" });
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const errors: string[] = [];
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await fetch(base).then((response) => response.ok).catch(() => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    await mkdir(".workings/screenshots", { recursive: true });
    for (const lesson of lessons) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(String(error)));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("request", (request) => { if (!request.url().startsWith(base) && !request.url().startsWith("data:") && !request.url().startsWith("blob:")) errors.push(`External browser request: ${request.url()}`); });
      await enter(page, lesson);
      for (const beat of lesson.beats) {
        if (beat.kind === "play") {
          const go = page.getByRole("button", { name: "Continue", exact: true });
          assert(await go.isDisabled(), `${beat.id}: premature continuation`);
          assert(await page.getByRole("button", { name: "Run agent", exact: true }).isDisabled(), "Run should require a prediction.");
          await predict(page, beat, beat.program);
          await page.getByRole("button", { name: "Step agent", exact: true }).click();
          await page.getByRole("list", { name: "Execution trace events" }).waitFor();
          await page.getByRole("button", { name: "Stop", exact: true }).click();
          assert(await go.isDisabled(), "Stopping is not completion.");
          await page.getByRole("button", { name: "Reset agent run", exact: true }).click();
          await solve(page, lesson, beat);
          await page.getByRole("button", { name: "Run agent", exact: true }).click();
          await page.waitForFunction(() => !(document.querySelector('button[aria-label="Continue"]') as HTMLButtonElement)?.disabled);
          await accessibility(page, `${lesson.id}/${beat.id}`);
          if (beat.mode === "challenge") {
            await page.getByText("Your agent passed every case.", { exact: true }).waitFor();
            assert(await page.getByText(/Solved without hints/).isVisible(), "Independent result is missing.");
            for (const button of await page.getByRole("button", { name: /: passed$/ }).all()) await button.click();
            const main = page.locator("main");
            await main.evaluate((element) => { element.scrollTop = 0; });
            await page.screenshot({ path: `.workings/screenshots/${lesson.id}-dark.png` });
            await page.getByRole("switch").click();
            await accessibility(page, `${lesson.id}/light`);
            await page.screenshot({ path: `.workings/screenshots/${lesson.id}-light.png` });
            const key = beat.editable.includes("observation") ? "observation" : "retries";
            await page.getByLabel(labels[key], { exact: true }).selectOption(key === "observation" ? "discard" : "0");
            assert(await go.isDisabled(), "Editing must invalidate the challenge result.");
            await page.getByRole("button", { name: "Show hint 1 of 3", exact: true }).click();
            await solve(page, lesson, beat);
            await page.getByRole("button", { name: "Run agent", exact: true }).click();
            await page.getByText("Your agent passed every case.", { exact: true }).waitFor();
            await page.getByText(/Completed with help/).waitFor();
            for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 }, { width: 320, height: 700 }]) {
              await page.setViewportSize(viewport);
              await overflow(page);
              await accessibility(page, `${lesson.id}/${viewport.width}`);
            }
            await page.setViewportSize({ width: 390, height: 844 });
            await main.evaluate((element) => { element.scrollTop = 0; });
            await page.screenshot({ path: `.workings/screenshots/${lesson.id}-mobile.png` });
            await page.setViewportSize({ width: 1440, height: 1000 });
          }
        }
        if (beat.kind !== "free-play") await page.getByRole("button", { name: "Continue", exact: true }).click();
      }
      await page.getByRole("heading", { name: "Free play", exact: true }).waitFor();
      await page.getByLabel("Practice case", { exact: true }).selectOption("1");
      await page.getByRole("button", { name: "Run agent", exact: true }).click();
      await page.getByText("Experiment complete.", { exact: true }).waitFor();
      await page.getByText("See the matching code", { exact: true }).click();
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download this loop", exact: true }).click()]);
      const downloadPath = await download.path();
      assert(downloadPath && (await readFile(downloadPath, "utf8")).includes("export async function runAgentLoop"), "Reference loop download is missing.");
      const evidence = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("workings-agent-evidence:")).map((key) => JSON.parse(localStorage.getItem(key)!)));
      assert(evidence.some((item) => item.passed && item.hints > 0), "Assistance evidence was not saved.");
      await context.close();
      if (lesson.topic === "tools") {
        const keyboardContext = await browser.newContext({ reducedMotion: "reduce" });
        const keyboardPage = await keyboardContext.newPage();
        keyboardPage.on("pageerror", (error) => errors.push(String(error)));
        await keyboardJourney(keyboardPage, lesson);
        await keyboardContext.close();
        const blockedContext = await browser.newContext({ reducedMotion: "reduce" });
        await blockedContext.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage blocked for this check"); } }));
        const blockedPage = await blockedContext.newPage();
        blockedPage.on("pageerror", (error) => errors.push(String(error)));
        await keyboardJourney(blockedPage, lesson);
        await blockedContext.close();
      }
      console.log(`Passed learner journey: ${lesson.id}`);
    }
    assert(errors.length === 0, errors.join("\n"));
  } finally { await browser.close(); server?.kill(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
