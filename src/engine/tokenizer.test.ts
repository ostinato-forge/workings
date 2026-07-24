import { expect, test } from "vitest";
import { buildTokenizer } from "./tokenizer";

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
