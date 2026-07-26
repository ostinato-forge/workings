import { describe, expect, test } from "vitest";
import {
  bpeTokenizerLike,
  decode,
  encodeIds,
  encodeSegments,
  trainBpe,
} from "./bpe";

describe("trainBpe", () => {
  test("hand-checkable merge order", () => {
    // "aaab" has pairs aa, aa, ab; "aab" has aa, ab. Counts: aa 3, ab 2.
    // First merge is aa. After it no pair occurs twice, so training stops.
    const model = trainBpe(["aaab", "aab"], 10);
    expect(model.alphabet).toEqual(["a", "b"]);
    expect(model.merges).toEqual([["a", "a"]]);
    expect(model.vocab).toEqual(["a", "b", "aa"]);
  });

  test("ties break lexicographically", () => {
    // "ab" and "cd" each occur twice with no other repeated pair.
    const model = trainBpe(["abab", "cdcd"], 6);
    expect(model.merges[0]).toEqual(["a", "b"]);
  });

  test("training is deterministic", () => {
    const corpus = ["the cat sat on the mat", "the cat ate the food"];
    const a = trainBpe(corpus, 40);
    const b = trainBpe(corpus, 40);
    expect(a).toEqual(b);
  });

  test("stops at the target vocabulary size", () => {
    const corpus = ["the cat sat on the mat", "the cat ate the food"];
    const model = trainBpe(corpus, 20);
    expect(model.vocab.length).toBeLessThanOrEqual(20);
  });
});

describe("encodeSegments", () => {
  const model = trainBpe(["aaab", "aab"], 10);

  test("applies merges left to right without overlap", () => {
    expect(encodeSegments(model, "aaab").map((s) => s.text)).toEqual([
      "aa",
      "a",
      "b",
    ]);
  });

  test("is lossless for any input, including unknown characters", () => {
    const inputs = ["aaab", "größe b", "a\tb", ""];
    for (const text of inputs) {
      const segments = encodeSegments(model, text);
      expect(segments.map((s) => s.text).join("")).toBe(text);
    }
  });

  test("marks unknown characters as fallback with null ids", () => {
    const segments = encodeSegments(model, "aXa");
    expect(segments.map((s) => s.fallback)).toEqual([false, true, false]);
    expect(segments[1]?.id).toBeNull();
    expect(segments[1]?.text).toBe("X");
  });

  test("merges never cross an unknown character", () => {
    const segments = encodeSegments(model, "aXa");
    expect(segments.map((s) => s.text)).toEqual(["a", "X", "a"]);
  });
});

describe("encodeIds and decode", () => {
  const model = trainBpe(["aaab", "aab"], 10);

  test("round-trips known text", () => {
    const result = encodeIds(model, "aaab");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(decode(model, result.ids)).toBe("aaab");
    }
  });

  test("reports unknown characters instead of throwing", () => {
    const result = encodeIds(model, "aXaY");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unknown).toEqual(["X", "Y"]);
    }
  });

  test("decode rejects out-of-range ids", () => {
    expect(() => decode(model, [999])).toThrow(/vocabulary/);
  });
});

describe("bpeTokenizerLike", () => {
  test("satisfies the TokenizerLike surface", () => {
    const model = trainBpe(["aaab", "aab"], 10);
    const like = bpeTokenizerLike(model);
    expect(like.vocab).toEqual(model.vocab);
    const good = like.tryEncode("aaab");
    expect(good.ok).toBe(true);
    if (good.ok) expect(like.decode(good.ids)).toBe("aaab");
    const bad = like.tryEncode("aXa");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.unknown).toEqual(["X"]);
  });
});
