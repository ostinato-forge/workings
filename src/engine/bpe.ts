export type BpeMerge = [string, string];

export type BpeModel = {
  alphabet: string[];
  merges: BpeMerge[];
  vocab: string[];
};

export type BpeSegment = {
  text: string;
  id: number | null;
  fallback: boolean;
};

function pairKey(a: string, b: string): string {
  return `${a}${b}`;
}

export function trainBpe(
  corpus: readonly string[],
  targetVocabSize: number,
): BpeModel {
  const alphabet = [...new Set(corpus.flatMap((text) => [...text]))].sort();
  const merges: BpeMerge[] = [];
  const vocab = [...alphabet];
  let sequences = corpus.map((text) => [...text]);

  while (vocab.length < targetVocabSize) {
    const counts = new Map<string, { pair: BpeMerge; count: number }>();
    for (const seq of sequences) {
      for (let i = 0; i + 1 < seq.length; i += 1) {
        const key = pairKey(seq[i] as string, seq[i + 1] as string);
        const entry = counts.get(key);
        if (entry === undefined) {
          counts.set(key, {
            pair: [seq[i] as string, seq[i + 1] as string],
            count: 1,
          });
        } else {
          entry.count += 1;
        }
      }
    }
    let best: { pair: BpeMerge; count: number } | undefined;
    let bestKey = "";
    for (const [key, entry] of counts) {
      if (
        best === undefined ||
        entry.count > best.count ||
        (entry.count === best.count && key < bestKey)
      ) {
        best = entry;
        bestKey = key;
      }
    }
    if (best === undefined || best.count < 2) break;
    merges.push(best.pair);
    vocab.push(best.pair[0] + best.pair[1]);
    sequences = sequences.map((seq) => applyMerge(seq, best.pair));
  }
  return { alphabet, merges, vocab };
}

function applyMerge(seq: readonly string[], pair: BpeMerge): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < seq.length) {
    if (i + 1 < seq.length && seq[i] === pair[0] && seq[i + 1] === pair[1]) {
      out.push(pair[0] + pair[1]);
      i += 2;
    } else {
      out.push(seq[i] as string);
      i += 1;
    }
  }
  return out;
}

export function encodeSegments(model: BpeModel, text: string): BpeSegment[] {
  const known = new Set(model.alphabet);
  const ids = new Map(model.vocab.map((piece, id) => [piece, id]));
  const segments: BpeSegment[] = [];
  let run: string[] = [];

  const flushRun = (): void => {
    if (run.length === 0) return;
    let pieces = run;
    for (const merge of model.merges) {
      pieces = applyMerge(pieces, merge);
    }
    for (const piece of pieces) {
      segments.push({ text: piece, id: ids.get(piece) as number, fallback: false });
    }
    run = [];
  };

  for (const ch of text) {
    if (known.has(ch)) {
      run.push(ch);
    } else {
      flushRun();
      segments.push({ text: ch, id: null, fallback: true });
    }
  }
  flushRun();
  return segments;
}

export function encodeIds(
  model: BpeModel,
  text: string,
): { ok: true; ids: number[] } | { ok: false; unknown: string[] } {
  const segments = encodeSegments(model, text);
  const unknown = [
    ...new Set(segments.filter((s) => s.fallback).map((s) => s.text)),
  ];
  if (unknown.length > 0) return { ok: false, unknown };
  return { ok: true, ids: segments.map((s) => s.id as number) };
}

export function decode(model: BpeModel, ids: readonly number[]): string {
  return ids
    .map((id) => {
      const piece = model.vocab[id];
      if (piece === undefined) {
        throw new Error(`id ${id} is outside the vocabulary`);
      }
      return piece;
    })
    .join("");
}

export function bpeTokenizerLike(model: BpeModel): {
  vocab: string[];
  tryEncode: (
    text: string,
  ) => { ok: true; ids: number[] } | { ok: false; unknown: string[] };
  decode: (ids: number[]) => string;
} {
  return {
    vocab: model.vocab,
    tryEncode: (text) => encodeIds(model, text),
    decode: (ids) => decode(model, ids),
  };
}
