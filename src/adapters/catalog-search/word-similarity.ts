import { normalize } from "../../core/order-matching/text.ts";

export type WordSimilarityIndex = { scores(query: string): Map<number, number> };

export function wordsOf(text: string): string[] {
  return [
    ...new Set(
      normalize(text)
        .split(" ")
        .filter((word) => word.length > 0),
    ),
  ];
}

export function trigrams(word: string): Set<string> {
  const padded = `  ${word} `;
  const grams = new Set<string>();
  for (let start = 0; start + 3 <= padded.length; start++)
    grams.add(padded.slice(start, start + 3));
  return grams;
}

export function trigramSimilarity(a: string, b: string): number {
  const first = trigrams(a);
  const second = trigrams(b);
  let shared = 0;
  for (const gram of first) if (second.has(gram)) shared++;
  return shared / (first.size + second.size - shared);
}

export function buildWordSimilarityIndex(documents: string[]): WordSimilarityIndex {
  const wordIds = new Map<string, number>();
  const gramCounts: number[] = [];
  const wordsByGram = new Map<string, number[]>();
  const documentsByWord: number[][] = [];

  documents.forEach((document, documentIndex) => {
    for (const word of wordsOf(document)) {
      let id = wordIds.get(word);
      if (id === undefined) {
        id = gramCounts.length;
        wordIds.set(word, id);
        const grams = trigrams(word);
        gramCounts.push(grams.size);
        documentsByWord.push([]);
        for (const gram of grams) {
          const list = wordsByGram.get(gram) ?? [];
          list.push(id);
          wordsByGram.set(gram, list);
        }
      }
      documentsByWord[id]!.push(documentIndex);
    }
  });

  const similarWords = (word: string) => {
    const grams = trigrams(word);
    const shared = new Map<number, number>();
    for (const gram of grams) {
      for (const id of wordsByGram.get(gram) ?? []) shared.set(id, (shared.get(id) ?? 0) + 1);
    }
    return [...shared].map(([id, count]) => ({
      id,
      similarity: count / (grams.size + gramCounts[id]! - count),
    }));
  };

  return {
    scores(query) {
      const queryWords = wordsOf(query);
      const totals = new Map<number, number>();
      for (const word of queryWords) {
        const best = new Map<number, number>();
        for (const { id, similarity } of similarWords(word)) {
          for (const documentIndex of documentsByWord[id]!) {
            if (similarity > (best.get(documentIndex) ?? 0)) best.set(documentIndex, similarity);
          }
        }
        for (const [documentIndex, similarity] of best) {
          totals.set(documentIndex, (totals.get(documentIndex) ?? 0) + similarity);
        }
      }
      return new Map(
        [...totals].map(([documentIndex, total]) => [documentIndex, total / queryWords.length]),
      );
    },
  };
}
