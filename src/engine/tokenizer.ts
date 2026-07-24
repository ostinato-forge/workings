export type Tokenizer = {
  vocab: string[];
  toId: (word: string) => number;
  encode: (text: string) => number[];
  decode: (ids: number[]) => string;
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
  return {
    vocab,
    toId,
    encode: (text) =>
      text
        .split(" ")
        .filter((w) => w.length > 0)
        .map(toId),
    decode: (tokenIds) => tokenIds.map((i) => vocab[i] ?? "?").join(" "),
  };
}
