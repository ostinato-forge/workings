import { describe, expect, test } from "vitest";
import { bpeTokenizerLike, trainBpe } from "./bpe";
import { buildTokenizer, type TokenizerLike } from "./tokenizer";

test("builds a sorted stable vocabulary from lines", () => {
  const tok = buildTokenizer(["mara met omar .", "omar smiled ."]);
  expect(tok.vocab).toEqual([".", "mara", "met", "omar", "smiled"]);
});

test("encode and decode round-trip", () => {
  const tok = buildTokenizer(["a b c .", "c b ."]);
  const ids = tok.encode("c a b .");
  expect(ids).toEqual([tok.toId("c"), tok.toId("a"), tok.toId("b"), tok.toId(".")]);
  expect(tok.decode(ids)).toBe("c a b .");
});

test("unknown words throw with a clear message", () => {
  const tok = buildTokenizer(["a b ."]);
  expect(() => tok.encode("a z .")).toThrow(/not in vocabulary: z/);
});

describe("tryEncode", () => {
  test("returns ids for known text", () => {
    const tokenizer = buildTokenizer(["emma called the plumber"]);
    const result = tokenizer.tryEncode("the plumber called");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(tokenizer.decode(result.ids)).toBe("the plumber called");
    }
  });

  test("reports unknown words without throwing", () => {
    const tokenizer = buildTokenizer(["emma called the plumber"]);
    const result = tokenizer.tryEncode("the plumber phoned zelda");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unknown).toEqual(["phoned", "zelda"]);
    }
  });
});

describe("TokenizerLike compatibility", () => {
  test("both tokenizers satisfy the shared surface", () => {
    const word: TokenizerLike = buildTokenizer(["a b"]);
    const bpe: TokenizerLike = bpeTokenizerLike(trainBpe(["aab"], 4));
    expect(word.vocab.length).toBeGreaterThan(0);
    expect(bpe.vocab.length).toBeGreaterThan(0);
  });
});
