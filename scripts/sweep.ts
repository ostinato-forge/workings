import { spawn, type ChildProcess } from "node:child_process";
import { chromium } from "playwright";

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

async function sweep(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.goto(URL);
  if ((await page.title()) !== "Workings") throw new Error("wrong page title");

  // Keyboard-only: tab to the lesson link and enter.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: /Sampling: the dials/ }).waitFor();

  // Reading phase to case 1.
  await page.getByRole("button", { name: "Start the first case" }).click();

  for (const expected of ["Case 1", "Case 2"]) {
    await page.getByRole("heading", { name: expected }).waitFor();
    const run = page.getByRole("button", {
      name: /Start lock your guess and run/i,
    });
    if (await run.isEnabled()) {
      throw new Error(`${expected}: run must stay locked until a guess is committed`);
    }
    await page.getByRole("radio").first().check();
    if (!(await run.isEnabled())) {
      throw new Error(`${expected}: committing a guess must unlock the run`);
    }
    await run.click();
    await page
      .getByRole("list", { name: "candidate tokens by probability" })
      .waitFor();
    const next =
      expected === "Case 1"
        ? page.getByRole("button", { name: "On to the second case" })
        : page.getByRole("button", { name: "Finish the lesson" });
    await next.click();
  }

  await page.getByRole("heading", { name: "Free play" }).waitFor();
  await page.getByRole("button", { name: "Run with these dials" }).click();
  await page
    .getByRole("list", { name: "candidate tokens by probability" })
    .waitFor();

  // Back on the list, the lesson is marked complete.
  await page.getByRole("link", { name: "All stages" }).click();
  await page.getByText("complete").waitFor();

  await browser.close();
  if (consoleErrors.length > 0) {
    throw new Error(`console errors during sweep:\n${consoleErrors.join("\n")}`);
  }
}

let server: ChildProcess | null = null;
try {
  server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore",
  });
  await waitForServer(30_000);
  await sweep();
  console.log("sweep passed");
} finally {
  if (server !== null) server.kill("SIGTERM");
}
