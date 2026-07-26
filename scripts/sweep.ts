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

  await pressUntilFocused(page, "link", /Why the same question/, 10);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: /Why the same question/ }).waitFor();
  await axeCheck(page, "lesson start");

  for (let guard = 0; guard < 40; guard += 1) {
    if (await page.getByRole("heading", { name: "Free play" }).isVisible().catch(() => false)) {
      break;
    }
    const start = page.getByRole("button", { name: /Start lock your bet and run|Start run again/i });
    if (await start.isVisible().catch(() => false)) {
      // Play beat. Satisfy the dial requirement when unmet.
      const unmet = await page.locator(".requirement.unmet").isVisible().catch(() => false);
      if (unmet) {
        const requirement = await page.locator(".requirement").innerText();
        const temperature = page.getByLabel(/temperature/);
        // Number inputs are filled by accessible label because key-event typing
        // is flaky across engines. Navigation, bets, START, and Continue remain
        // keyboard-driven.
        if (/temperature to exactly 0|temperature dial down to 0/i.test(requirement)) {
          await temperature.fill("0");
        } else if (/top-k at 3/i.test(requirement)) {
          await temperature.fill("1");
          await page.getByLabel(/top-k/).fill("3");
        }
      }
      if (await page.getByRole("radio").first().isEnabled().catch(() => false)) {
        await pressUntilFocused(page, "radio", /.*/, 20);
        await page.keyboard.press("Space");
      }
      await axeCheck(page, "play beat");
      for (let runs = 0; runs < 6; runs += 1) {
        const continueButton = page.getByRole("button", { name: /^Continue$/ });
        if (await continueButton.isVisible().catch(() => false)) break;
        await pressUntilFocused(page, "button", /Start/, 25);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(200);
      }
      await page
        .getByRole("list", { name: "your runs so far" })
        .waitFor();
      await axeCheck(page, "playfield");
    }
    await pressUntilFocused(page, "button", /^Continue$/, 25);
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
  await page.goto(URL);
  await page.getByRole("link", { name: /Why the same question/ }).click();
  await page.getByRole("heading", { name: /Why the same question/ }).waitFor();
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page
    .getByText(/Run the machine three times and watch the endings pile up/)
    .waitFor();
  const button = page.getByRole("button", { name: /Start/ }).first();
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
  await page.goto(URL);
  await page.getByRole("link", { name: /Why the same question/ }).click();
  await page.getByRole("heading", { name: /Why the same question/ }).waitFor();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: /Start lock your bet and run/i })
    .click();
  await page
    .getByRole("list", { name: "your runs so far" })
    .getByRole("button", { name: /Run 1/ })
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
