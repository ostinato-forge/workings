import type { Page } from "playwright";

/*
 * Waits for entry animations to end. A step fades in, and a scan that runs
 * during the fade measures half-transparent text and reports a contrast
 * failure that no learner would see. Animations that never end are ignored.
 */
export async function animationsSettled(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime ?? Infinity)))
    .map((animation) => animation.finished.then(() => undefined, () => undefined))));
}
