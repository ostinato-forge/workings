import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "playwright";

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
  role: "button" | "radio" | "link" | "slider" | "textbox" | "group",
  name: RegExp,
  maxTabs: number,
): Promise<void> {
  const target = page.getByRole(role, { name }).first();
  await target.waitFor({ state: "visible", timeout: 10_000 });
  for (let i = 0; i < maxTabs; i += 1) {
    const reached = await target
      .evaluate((el) => el === document.activeElement)
      .catch(() => false);
    if (reached) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`never reached ${role} ${name} by keyboard`);
}

async function waitForSliderEnabled(page: Page, name: RegExp): Promise<void> {
  const slider = page.getByRole("slider", { name }).first();
  await slider.waitFor();
  const handle = await slider.elementHandle();
  if (handle === null) throw new Error(`missing slider ${name}`);
  await page.waitForFunction(
    (element) => element.getAttribute("aria-disabled") === "false",
    handle,
  );
  await handle.dispose();
}

async function pressSliderKey(
  page: Page,
  name: RegExp,
  key: string,
  expected: number,
): Promise<void> {
  await page.keyboard.press(key);
  const slider = page.getByRole("slider", { name }).first();
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const value = Number(await slider.getAttribute("aria-valuenow"));
    if (value === expected) return;
    await page.waitForTimeout(25);
  }
  throw new Error(`slider ${name} did not reach ${expected} after ${key}`);
}

async function keyboardPlay(page: Page): Promise<void> {
  await page.goto(URL);
  if ((await page.title()) !== "Workings") throw new Error("wrong page title");
  await page
    .getByRole("button", { name: /insert coin|coin/i })
    .waitFor();
  await axeCheck(page, "attract screen");
  await pressUntilFocused(page, "button", /insert coin|coin/i, 10);
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: /How AI works/ }).waitFor();
  await axeCheck(page, "course catalog");
  await capture(page, "course-catalog");
  await pressUntilFocused(page, "link", /How AI works/, 10);
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: /Why the same question/ }).waitFor();
  await axeCheck(page, "AI lesson list");

  await pressUntilFocused(page, "link", /Why the same question/, 10);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: /Why the same question/ }).waitFor();
  await axeCheck(page, "lesson start");

  for (let guard = 0; guard < 40; guard += 1) {
    if (await page.getByRole("heading", { name: "Free play" }).isVisible().catch(() => false)) {
      break;
    }
    const start = page.getByRole("button", {
      name: /^Run$/,
    });
    if (await start.isVisible().catch(() => false)) {
      // Play beat. Satisfy the dial requirement when unmet.
      const unmet = await page.locator(".requirement.unmet").isVisible().catch(() => false);
      if (unmet) {
        const requirement = await page.locator(".requirement").innerText();
        if (/temperature to exactly 0|temperature dial down to 0/i.test(requirement)) {
          await waitForSliderEnabled(page, /temperature/i);
          await pressUntilFocused(page, "slider", /temperature/i, 25);
          await pressSliderKey(page, /temperature/i, "Home", 0);
        } else if (/top-k at 3/i.test(requirement)) {
          await waitForSliderEnabled(page, /temperature/i);
          await pressUntilFocused(page, "slider", /temperature/i, 25);
          await pressSliderKey(page, /temperature/i, "Home", 0);
          for (let step = 1; step <= 10; step += 1) {
            await pressSliderKey(
              page,
              /temperature/i,
              "ArrowRight",
              step / 10,
            );
          }
          await waitForSliderEnabled(page, /top-k/i);
          await pressUntilFocused(page, "slider", /top-k/i, 5);
          await pressSliderKey(page, /top-k/i, "End", 5);
          await pressSliderKey(page, /top-k/i, "ArrowLeft", 4);
          await pressSliderKey(page, /top-k/i, "ArrowLeft", 3);
        }
        await page
          .locator(".requirement.unmet")
          .waitFor({ state: "detached", timeout: 3_000 });
      }
      if (await page.getByRole("radio").first().isEnabled().catch(() => false)) {
        await pressUntilFocused(page, "radio", /.*/, 20);
        await page.keyboard.press("Space");
      }
      await axeCheck(page, "play beat");
      for (let runs = 0; runs < 6; runs += 1) {
        const continueButton = page.getByRole("button", { name: /^Continue$/ });
        if (await continueButton.isEnabled().catch(() => false)) break;
        await pressUntilFocused(page, "button", /^Run$/, 25);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(200);
      }
      await page
        .getByRole("list", { name: "your runs so far" })
        .waitFor();
      await axeCheck(page, "playfield");
    }
    const previousStep = await page.locator(".lesson-progress").innerText();
    await pressUntilFocused(page, "button", /^Continue$/, 25);
    await page.keyboard.press("Enter");
    await page.waitForFunction((previous) => document.querySelector(".lesson-progress")?.textContent !== previous, previousStep);
    if (await page.getByRole("radio").count()) await start.waitFor();
  }

  await page.getByRole("heading", { name: "Free play" }).waitFor();
  await axeCheck(page, "free play");
  await pressUntilFocused(page, "button", /Run with these dials/, 20);
  await page.keyboard.press("Enter");
  await page
    .getByRole("list", { name: "candidate tokens by probability" })
    .waitFor();

  await pressUntilFocused(page, "link", /How AI works/, 15);
  await page.keyboard.press("Enter");
  await page.getByText("complete", { exact: true }).waitFor();
}

async function viewportCheck(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(URL);
  const coin = page.getByRole("button", { name: /insert coin|coin/i });
  await coin.waitFor();
  await coin.click();
  await page.getByRole("link", { name: /How AI works/ }).click();
  await page.getByRole("link", { name: /Why the same question/ }).waitFor();
  await page.getByRole("link", { name: /Why the same question/ }).click();
  await page.getByRole("heading", { name: /Why the same question/ }).waitFor();
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page
    .getByText(/Run the machine three times and watch the endings pile up/)
    .waitFor();
  await visibleLessonArea(page, `${width}x${height}`);
  const button = page.getByRole("button", { name: /^Run$/ }).first();
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
  const coin = page.getByRole("button", { name: /insert coin|coin/i });
  await coin.waitFor();
  await coin.click();
  await page.getByRole("link", { name: /How AI works/ }).click();
  await page.getByRole("link", { name: /Why the same question/ }).waitFor();
  await page.getByRole("link", { name: /Why the same question/ }).click();
  await page.getByRole("heading", { name: /Why the same question/ }).waitFor();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("radio").first().check();
  await page
    .getByRole("button", { name: /^Run$/ })
    .click();
  await page
    .getByRole("list", { name: "your runs so far" })
    .getByRole("button", { name: /Run 1/ })
    .waitFor();
  await page.emulateMedia({ reducedMotion: null });
}

async function capture(page: Page, name: string): Promise<void> {
  const directory = process.env.WORKINGS_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true });
}

async function ansiblePlay(page: Page): Promise<void> {
  await page.goto(URL);
  await page.getByRole("button", { name: /insert coin|coin/i }).click();
  const course = page.getByRole("link", { name: /How Ansible works/ });
  if (!(await course.innerText()).includes("0 complete")) {
    throw new Error("AI completion leaked into the Ansible course");
  }
  await pressUntilFocused(page, "link", /How Ansible works/, 10);
  await page.keyboard.press("Enter");
  await pressUntilFocused(page, "link", /Make changes that stay done/, 10);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: /Make changes that stay done/ }).waitFor();
  await pressUntilFocused(page, "button", /^Continue$/, 10);
  await page.keyboard.press("Enter");
  await page.getByLabel("Playbook YAML").waitFor();
  if (await page.getByRole("slider", { name: /temperature/i }).count()) {
    throw new Error("AI controls appeared in the Ansible lesson");
  }
  await axeCheck(page, "Ansible playbook");
  await capture(page, "ansible-playbook");
  await pressUntilFocused(page, "radio", /web-1 and web-2/, 15);
  await page.keyboard.press("Space");
  const editor = page.getByLabel("Playbook YAML");
  const original = await editor.inputValue();
  await editor.fill("---\n[");
  await page.getByRole("button", { name: /^Run playbook$/ }).click();
  await page.getByRole("alert").waitFor();
  if (await page.getByRole("button", { name: /^Continue$/ }).isEnabled()) {
    throw new Error("invalid YAML unlocked lesson progression");
  }
  await editor.fill(original);
  for (let i = 0; i < 2; i += 1) {
    await pressUntilFocused(page, "button", /^Run playbook/, 20);
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: i === 0 ? "Run 1: 3 changed, 0 failed" : "Run 2: 0 changed, 0 failed" }).waitFor();
  }
  await pressUntilFocused(page, "button", /^Continue$/, 20);
  await page.keyboard.press("Enter");
  await pressUntilFocused(page, "button", /^Continue$/, 10);
  await page.keyboard.press("Enter");
  await page.getByRole("radio", { name: "On both runs" }).waitFor();
  await pressUntilFocused(page, "radio", /On both runs/, 15);
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: /^Run playbook$/ }).click();
  await page.getByRole("alert").filter({ hasText: "restarted" }).waitFor();
  await editor.fill(original.replace("state: started", "state: restarted"));
  for (let i = 0; i < 2; i += 1) {
    await pressUntilFocused(page, "button", /^Run playbook/, 20);
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: `Run ${i + 1}: 3 changed, 0 failed` }).waitFor();
  }
  await axeCheck(page, "Ansible transfer results");
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page.getByRole("heading", { name: "Free play" }).waitFor();
  await axeCheck(page, "Ansible free play");
  await page.getByRole("button", { name: /^Run playbook$/ }).click();
  await page.getByRole("heading", { name: "Run 1: 3 changed, 0 failed" }).waitFor();
  await page.getByRole("button", { name: "Reset practice servers" }).click();
  if (await page.getByRole("heading", { name: /^Run 1:/ }).count()) throw new Error("practice reset kept old runs");
  await page.getByRole("link", { name: "How Ansible works", exact: true }).click();
  await page.getByText("1 of 1 lessons complete", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: /insert coin|coin/i }).click();
  await page.getByText("1 of 1 lessons complete", { exact: true }).waitFor();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("workings-course-progress-v1") ?? "null"));
  if (progress?.ai?.["sampling-dials"] !== "complete" || progress?.ansible?.["desired-state"] !== "complete") {
    throw new Error("course progress did not persist independently");
  }
}

async function navigationChecks(page: Page): Promise<void> {
  for (const hash of ["#/lesson/sampling-dials", "#/courses/ai/lessons/sampling-dials"]) {
    await page.goto(`${URL}${hash}`);
    await page.reload();
    await page.getByRole("button", { name: /insert coin|coin/i }).click();
    await page.getByRole("heading", { name: /Why the same question/ }).waitFor();
    await page.getByText("Step 1 of 9", { exact: true }).waitFor();
  }
  await page.goto(`${URL}#/courses/ai/lessons/desired-state`);
  await page.reload();
  await page.getByRole("button", { name: /insert coin|coin/i }).click();
  await page.getByRole("heading", { name: "This lesson or course is not available" }).waitFor();
  await page.getByRole("link", { name: "All courses", exact: true }).click();
  await page.getByRole("link", { name: /How AI works/ }).waitFor();
  await axeCheck(page, "route recovery");
}

async function ansibleViewport(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(`${URL}#/courses/ansible/lessons/desired-state`);
  await page.reload();
  await page.getByRole("button", { name: /insert coin|coin/i }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page.getByLabel("Playbook YAML").waitFor();
  await visibleLessonArea(page, `Ansible ${width}x${height}`);
  await axeCheck(page, `Ansible ${width}x${height}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error(`Ansible ${width}x${height}: horizontal overflow`);
  await capture(page, `ansible-${width}x${height}`);
}

async function visibleLessonArea(page: Page, label: string): Promise<void> {
  const area = await page.getByRole("main").boundingBox();
  if (area === null || area.height < 160) {
    throw new Error(`${label}: cabinet leaves less than 160px for the lesson`);
  }
}

async function dragJoystick(page: Page, dx: number, dy: number): Promise<void> {
  const grip = await page.locator(".joystick-stick i").boundingBox();
  if (!grip) throw new Error("missing joystick grip");
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

async function cabinetChecks(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${URL}#/courses/ansible/lessons/desired-state`);
  await page.reload();
  await page.getByRole("heading", { name: "Learn by doing.", exact: true }).waitFor();
  await page.getByRole("button", { name: "Insert coin", exact: true }).click();
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('button[aria-label="Continue"]')?.disabled === false);
  await dragJoystick(page, 30, 0);
  await page.getByLabel("Playbook YAML").waitFor();
  await page.getByRole("radio", { name: "web-1 and web-2", exact: true }).check();
  const source = await page.getByLabel("Playbook YAML").inputValue();
  await page.getByRole("button", { name: "Run playbook", exact: true }).click();
  await page.getByRole("heading", { name: "Run 1: 3 changed, 0 failed" }).waitFor();
  await dragJoystick(page, 30, 0);
  if (await page.locator(".lesson-progress").innerText() !== "Step 2 of 6") {
    throw new Error("the joystick bypassed the required repeat run");
  }
  const theme = page.getByRole("switch", { name: "Light display" });
  for (const mode of ["light", "dark", "light"] as const) {
    if ((await theme.getAttribute("aria-checked") === "true") !== (mode === "light")) {
      await theme.focus();
      await page.keyboard.press("Space");
    }
    if (await page.getByLabel("Playbook YAML").inputValue() !== source ||
      !(await page.getByRole("radio", { name: "web-1 and web-2", exact: true }).isChecked())) {
      throw new Error("switching display themes changed the current experiment");
    }
    await page.getByRole("heading", { name: "Run 1: 3 changed, 0 failed" }).waitFor();
    await axeCheck(page, `${mode} cabinet display`);
    await page.getByRole("main").evaluate((element) => element.scrollTo(0, 0));
    await capture(page, `cabinet-${mode}`);
  }
  if (await page.locator(".wish-screen-content button").count()) {
    throw new Error("Ansible action buttons remained inside the display");
  }
  await page.getByRole("button", { name: "Run playbook again", exact: true }).click();
  await dragJoystick(page, 30, 0);
  await page.getByText("Step 3 of 6", { exact: true }).waitFor();
  await dragJoystick(page, -30, 0);
  await page.getByText("Step 2 of 6", { exact: true }).waitFor();
  if (await page.getByRole("button", { name: "Continue", exact: true }).isEnabled()) {
    throw new Error("returning to an experiment bypassed its new prediction and runs");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("main").evaluate((element) => element.scrollTo(0, 0));
  await dragJoystick(page, 0, 30);
  await page.waitForFunction(() => (document.querySelector("main")?.scrollTop ?? 0) > 0);
  const joystick = page.getByRole("group", { name: "Navigation joystick" });
  await joystick.focus();
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(() => document.querySelector("main")?.scrollTop === 0);
  await page.reload();
  if (await theme.getAttribute("aria-checked") !== "true") throw new Error("display theme did not persist");
  await page.getByRole("button", { name: "Insert coin", exact: true }).click();
  await page.getByRole("link", { name: "All courses", exact: true }).click();
  await axeCheck(page, "light course catalog");
  await theme.click();
}

async function storageChecks(browser: Browser): Promise<void> {
  const page = await browser.newPage();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    localStorage.setItem("workings-progress", JSON.stringify({ "sampling-dials": "complete" }));
  });
  try {
    await page.goto(URL);
    await page.getByRole("button", { name: /insert coin|coin/i }).click();
    if (!(await page.getByRole("link", { name: /How AI works/ }).innerText()).includes("1 complete")) {
      throw new Error("the course catalog lost legacy AI completion");
    }
    if (!(await page.getByRole("link", { name: /How Ansible works/ }).innerText()).includes("0 complete")) {
      throw new Error("legacy completion leaked into Ansible");
    }
    if (requests.some((url) => /\/assets\/(SamplingLesson|DesiredStateLesson)-/.test(url))) {
      throw new Error("opening the catalog loaded a subject's lesson engine");
    }
    await page.evaluate(() => localStorage.setItem("workings-course-progress-v1", "null"));
    await page.reload();
    await page.getByRole("button", { name: /insert coin|coin/i }).click();
    if (!(await page.getByRole("link", { name: /How AI works/ }).innerText()).includes("0 complete")) {
      throw new Error("corrupt progress was treated as valid completion");
    }
  } finally {
    await page.close();
  }

  const blocked = await browser.newPage();
  await blocked.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Storage is disabled", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Storage is disabled", "SecurityError"); };
  });
  try {
    await blocked.goto(URL);
    await blocked.getByRole("switch", { name: "Light display" }).click();
    if (await blocked.getByRole("switch", { name: "Light display" }).getAttribute("aria-checked") !== "true") {
      throw new Error("the display switch failed with unavailable storage");
    }
    await blocked.getByRole("button", { name: /insert coin|coin/i }).click();
    await blocked.getByText(/Progress cannot be saved in this browser/).waitFor();
    await blocked.getByRole("link", { name: /How Ansible works/ }).click();
    await blocked.getByRole("link", { name: /Make changes that stay done/ }).click();
    await blocked.getByRole("button", { name: /^Continue$/ }).click();
    await blocked.getByLabel("Playbook YAML").waitFor();
  } finally {
    await blocked.close();
  }
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

  try {
    console.log("Checking the AI keyboard journey.");
    await keyboardPlay(page);
    console.log("Checking the Ansible journey and saved progress.");
    await ansiblePlay(page);
    console.log("Checking saved links and missing routes.");
    await navigationChecks(page);
    console.log("Checking phone and landscape layouts.");
    await ansibleViewport(page, 390, 844);
    await ansibleViewport(page, 844, 390);
    await viewportCheck(page, 390, 844);
    await viewportCheck(page, 844, 390);
    await page.setViewportSize({ width: 1280, height: 900 });
    await reducedMotionCheck(page);
    console.log("Checking display themes and cabinet navigation.");
    await cabinetChecks(page);
    console.log("Checking legacy, corrupt, and unavailable browser storage.");
    await storageChecks(browser);
  } catch (error) {
    await capture(page, "failure");
    throw error;
  } finally {
    await browser.close();
  }
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
