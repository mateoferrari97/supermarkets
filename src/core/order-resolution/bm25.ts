const K1 = 1.2;
const B = 0.75;

export type Bm25Index = { search(query: string, limit: number): number[] };

export function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0)
    .map(stem);
}

function stem(token: string): string {
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function buildBm25Index(documents: string[]): Bm25Index {
  const termFrequencies = documents.map((document) => {
    const frequencies = new Map<string, number>();
    for (const token of tokenize(document)) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
    return frequencies;
  });
  const lengths = termFrequencies.map((frequencies) =>
    [...frequencies.values()].reduce((total, count) => total + count, 0),
  );
  const averageLength =
    lengths.reduce((total, length) => total + length, 0) / (lengths.length || 1);
  const postings = new Map<string, number[]>();
  termFrequencies.forEach((frequencies, index) => {
    for (const token of frequencies.keys()) {
      const list = postings.get(token) ?? [];
      list.push(index);
      postings.set(token, list);
    }
  });

  return {
    search(query, limit) {
      const scores = new Map<number, number>();
      for (const token of new Set(tokenize(query))) {
        const matches = postings.get(token);
        if (!matches) continue;
        const idf = Math.log(
          1 + (documents.length - matches.length + 0.5) / (matches.length + 0.5),
        );
        for (const index of matches) {
          const frequency = termFrequencies[index]!.get(token)!;
          const norm = frequency + K1 * (1 - B + (B * lengths[index]!) / averageLength);
          scores.set(index, (scores.get(index) ?? 0) + (idf * frequency * (K1 + 1)) / norm);
        }
      }
      return [...scores]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, limit)
        .map(([index]) => index);
    },
  };
}
