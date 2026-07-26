export type TokenizerLike = {
  vocab: string[];
  tryEncode: (
    text: string,
  ) => { ok: true; ids: number[] } | { ok: false; unknown: string[] };
  decode: (ids: number[]) => string;
};

export type Tokenizer = TokenizerLike & {
  toId: (word: string) => number;
  encode: (text: string) => number[];
};

export function buildTokenizer(lines: string[]): Tokenizer {
  const words = new Set<string>();
  for (const lineText of lines) {
    for (const word of lineText.split(" ")) {
      if (word.length > 0) words.add(word);
    }
  }
  const vocab = [...words].sort();
  const ids = new Map(vocab.map((w, i) => [w, i]));
  const toId = (word: string): number => {
    const id = ids.get(word);
    if (id === undefined) throw new Error(`not in vocabulary: ${word}`);
    return id;
  };
  const tryEncode = (
    text: string,
  ): { ok: true; ids: number[] } | { ok: false; unknown: string[] } => {
    const words = text.split(" ").filter((w) => w.length > 0);
    const unknown = [...new Set(words.filter((w) => !ids.has(w)))];
    if (unknown.length > 0) return { ok: false, unknown };
    return { ok: true, ids: words.map(toId) };
  };
  return {
    vocab,
    toId,
    tryEncode,
    encode: (text) =>
      text
        .split(" ")
        .filter((w) => w.length > 0)
        .map(toId),
    decode: (tokenIds) => tokenIds.map((i) => vocab[i] ?? "?").join(" "),
  };
}
