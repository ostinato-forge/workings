import { describe, expect, test } from "vitest";
import { catalog, defineCatalog, type Catalog } from "./catalog";
import { lessonHref, resolveRoute } from "./routes";

describe("course catalog and routes", () => {
  test("a lesson can be reused by two courses", () => {
    const ai = catalog.courses[0]!;
    const reused = defineCatalog({
      ...catalog,
      courses: [ai, { ...ai, id: "model-settings", title: "Model settings" }],
    });
    const first = resolveRoute(lessonHref("ai", "sampling-dials"), reused);
    const second = resolveRoute(lessonHref("model-settings", "sampling-dials"), reused);
    expect(first.kind).toBe("lesson");
    expect(second.kind).toBe("lesson");
    if (first.kind === "lesson" && second.kind === "lesson") {
      expect(first.lesson).toBe(second.lesson);
      expect(first.course.id).not.toBe(second.course.id);
    }
  });

  test("invalid catalog references fail before a learner opens them", () => {
    const invalid: Catalog[] = [
      { ...catalog, courses: [...catalog.courses, catalog.courses[0]!] },
      { ...catalog, lessons: [...catalog.lessons, catalog.lessons[0]!] },
      { ...catalog, courses: [{ ...catalog.courses[0]!, lessonIds: ["missing"] }] },
      { ...catalog, courses: [{ ...catalog.courses[0]!, lessonIds: [] }] },
      { ...catalog, courses: [{ ...catalog.courses[0]!, lessonIds: ["sampling-dials", "sampling-dials"] }] },
    ];
    invalid.forEach((item) => expect(() => defineCatalog(item)).toThrow());
  });

  test.each(["#/courses/nope", "#/courses/ai/lessons/desired-state", "#/courses/ansible/lessons/nope", "#/lesson/nope", "#/courses/ai/extra"])(
    "unknown or mismatched route has a recovery state: %s", (hash) => {
      expect(resolveRoute(hash, catalog)).toEqual({ kind: "missing" });
    },
  );

  test("old AI links still select the same lesson", () => {
    expect(resolveRoute("#/lesson/sampling-dials", catalog)).toEqual(
      resolveRoute(lessonHref("ai", "sampling-dials"), catalog),
    );
  });

  test("every available lesson loads a player", async () => {
    for (const lesson of catalog.lessons) {
      expect(typeof (await lesson.load()).default).toBe("function");
    }
  });
});
