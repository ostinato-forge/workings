import { describe, expect, test } from "vitest";
import { catalog } from "./catalog";
import { lessonHref, resolveRoute } from "./platform/routes";

describe("shipped catalog", () => {
  test("every available lesson loads a player", async () => {
    for (const lesson of catalog.lessons) {
      expect(typeof (await lesson.load()).default).toBe("function");
    }
  }, 30_000); // Importing every player compiles each course; a busy machine needs more than the default 5 seconds.

  test("old AI links still select the original AI lesson", () => {
    const route = resolveRoute("#/lesson/sampling-dials", catalog);
    expect(route).toEqual(resolveRoute(lessonHref("ai", "sampling-dials"), catalog));
    expect(route.kind).toBe("lesson");
  });
});
