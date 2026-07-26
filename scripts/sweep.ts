import { spawn, type ChildProcess } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright";

const PORT = 4173;
const URL = `http://localhost:${PORT}/`;

async function waitForServer(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(URL);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`preview server did not answer at ${URL}`);
}

async function axeCheck(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  if (serious.length > 0) {
    const detail = serious
      .map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`)
      .join("\n");
    throw new Error(`axe violations at ${where}:\n${detail}`);
  }
}

async function pressUntilFocused(
  page: Page,
  role: "button" | "radio" | "link",
  name: RegExp,
  maxTabs: number,
): Promise<void> {
  const target = page.getByRole(role, { name }).first();
  for (let i = 0; i < maxTabs; i += 1) {
    const reached = await target
      .evaluate((el) => el === document.activeElement)
      .catch(() => false);
    if (reached) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`never reached ${role} ${name} by keyboard`);
}

async function keyboardPlay(page: Page): Promise<void> {
  await page.goto(URL);
  if ((await page.title()) !== "Workings") throw new Error("wrong page title");
  await axeCheck(page, "stage list");

  await pressUntilFocused(page, "link", /Sampling: the dials/, 10);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: /Sampling: the dials/ }).waitFor();
  await axeCheck(page, "reading phase");

  await pressUntilFocused(page, "button", /Start the first case/, 10);
  await page.keyboard.press("Enter");

  for (const expected of ["Case 1", "Case 2"]) {
    await page.getByRole("heading", { name: expected }).waitFor();
    const start = page.getByRole("button", { name: /Start lock your guess and run/i });
    if (await start.isEnabled()) {
      throw new Error(`${expected}: START must stay locked before a guess`);
    }
    await pressUntilFocused(page, "radio", /.*/, 15);
    await page.keyboard.press("Space");
    if (!(await start.isEnabled())) {
      throw new Error(`${expected}: committing a guess must unlock START`);
    }
    await axeCheck(page, `${expected} predicting`);
    await pressUntilFocused(page, "button", /Start lock your guess and run/i, 15);
    await page.keyboard.press("Enter");
    await page
      .getByRole("list", { name: "candidate tokens by probability" })
      .waitFor();
    await axeCheck(page, `${expected} evidence`);
    const nextName =
      expected === "Case 1" ? /On to the second case/ : /Finish the lesson/;
    await pressUntilFocused(page, "button", nextName, 15);
    await page.keyboard.press("Enter");
  }

  await page.getByRole("heading", { name: "Free play" }).waitFor();
  await axeCheck(page, "free play");
  await pressUntilFocused(page, "button", /Run with these dials/, 20);
  await page.keyboard.press("Enter");
  await page
    .getByRole("list", { name: "candidate tokens by probability" })
    .waitFor();

  await pressUntilFocused(page, "link", /All stages/, 15);
  await page.keyboard.press("Enter");
  await page.getByText("complete").waitFor();
}

async function viewportCheck(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(`${URL}#/lesson/sampling-dials`);
  await page.getByRole("heading", { name: /Sampling: the dials/ }).waitFor();
  const button = page.getByRole("button", { name: /Start the first case/ });
  const box = await button.boundingBox();
  if (box === null || box.height < 44) {
    throw new Error(`${width}x${height}: primary control under 44px`);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (overflow) {
    throw new Error(`${width}x${height}: horizontal overflow`);
  }
}

async function reducedMotionCheck(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${URL}#/lesson/sampling-dials`);
  await page.getByRole("button", { name: /Start the first case/ }).click();
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: /Start lock your guess and run/i })
    .click();
  await page
    .getByRole("list", { name: "candidate tokens by probability" })
    .waitFor();
  await page.emulateMedia({ reducedMotion: null });
}

async function sweep(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await keyboardPlay(page);
  await viewportCheck(page, 390, 844);
  await viewportCheck(page, 844, 390);
  await page.setViewportSize({ width: 1280, height: 900 });
  await reducedMotionCheck(page);

  await browser.close();
  if (consoleErrors.length > 0) {
    throw new Error(`console errors during sweep:\n${consoleErrors.join("\n")}`);
  }
}

let server: ChildProcess | null = null;
try {
  server = spawn(
    "npx",
    ["vite", "preview", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore" },
  );
  await waitForServer(30_000);
  await sweep();
  console.log("sweep passed");
} finally {
  if (server !== null) server.kill("SIGTERM");
}
