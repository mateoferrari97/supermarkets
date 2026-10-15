import { normalize } from "./text.ts";
import type { EvalCase, ExpectedItem } from "./eval-set.ts";
import { parseQuantity, type Item } from "./item.ts";

export type PickedProduct = { productId: string; quantity: number; notes: string[] };

export type ItemRun = {
  item: Item;
  matches: string[];
  fits: string[];
  alternatives: string[];
  note: string | null;
  question: string | null;
  pick: PickedProduct | null;
};

export type OrderRun = { items: ItemRun[]; ignoredPreference: boolean };

export type Ratio = { hits: number; total: number };

export type ItemScore = {
  product: string;
  actual: number | null;
  stale: boolean;
  readRight: boolean;
  matchesRecall: Ratio;
  fitsPrecision: Ratio;
  fitsRecall: Ratio;
  pickRight: boolean | null;
  shouldAsk: boolean;
  asked: boolean;
  alternatives: Ratio;
  wrongPickUnseen: boolean;
  passed: boolean;
  problems: string[];
};

export type RunScore = {
  items: ItemScore[];
  itemCountRight: boolean;
  notItemsFound: string[];
  ignoredPreferenceRight: boolean | null;
  passed: boolean;
  problems: string[];
};

export type ScoredRun = { error: string } | { error: null; result: OrderRun; score: RunScore };

export type CaseRuns = { evalCase: EvalCase; runs: ScoredRun[] };

export type Totals = {
  cases: Ratio;
  failedCases: string[];
  runs: number;
  errors: number;
  itemsRead: Ratio;
  itemCountRight: Ratio;
  notItemsKept: Ratio;
  matchesRecall: Ratio;
  fitsPrecision: Ratio;
  fitsRecall: Ratio;
  pickRight: Ratio;
  wrongPicksUnseen: number;
  unexpectedQuestions: number;
  missedQuestions: number;
  scoredItems: number;
  alternatives: Ratio;
  ignoredPreference: Ratio;
  stability: Ratio;
};

type IsLive = (productId: string) => boolean;

const ratio = (hits: number, total: number): Ratio => ({ hits, total });

export function scoreRun(evalCase: EvalCase, run: OrderRun, isLive: IsLive): RunScore {
  const pairs = pairItems(evalCase.items, run.items, isLive);
  const items = evalCase.items.map((expected, index) => {
    const actual = pairs[index] ?? null;
    return scoreItem(expected, actual, actual === null ? null : run.items[actual]!, isLive);
  });
  const itemCountRight = run.items.length === evalCase.items.length;
  const notItemsFound = (evalCase.notItems ?? []).filter((word) =>
    run.items.some(({ item }) => normalize(item.product).includes(normalize(word))),
  );
  const ignoredPreferenceRight =
    evalCase.ignoredPreference === undefined
      ? null
      : evalCase.ignoredPreference === run.ignoredPreference;
  const problems = [
    ...(itemCountRight ? [] : [`expected ${evalCase.items.length} Items, got ${run.items.length}`]),
    ...notItemsFound.map((word) => `"${word}" became an Item`),
    ...(ignoredPreferenceRight === false
      ? [`expected ignoredPreference ${String(evalCase.ignoredPreference)}`]
      : []),
    ...items.flatMap((item) => item.problems.map((problem) => `${item.product}: ${problem}`)),
  ];
  return {
    items,
    itemCountRight,
    notItemsFound,
    ignoredPreferenceRight,
    passed: items.every(({ passed }) => passed),
    problems,
  };
}

function scoreItem(
  expected: ExpectedItem,
  actualIndex: number | null,
  actual: ItemRun | null,
  isLive: IsLive,
): ItemScore {
  const liveFits = (expected.fits ?? []).filter(isLive);
  const livePick = (expected.pick ?? expected.fits ?? []).filter(isLive);
  const liveAlternatives = (expected.alternatives ?? []).filter(isLive);
  const shouldAsk = expected.fits === undefined;
  const stale = !shouldAsk && livePick.length === 0;
  const base = { product: expected.product, actual: actualIndex, stale, shouldAsk };
  if (actual === null) {
    return {
      ...base,
      readRight: false,
      matchesRecall: ratio(0, liveFits.length),
      fitsPrecision: ratio(0, 0),
      fitsRecall: ratio(0, liveFits.length),
      pickRight: shouldAsk || stale ? null : false,
      asked: false,
      alternatives: ratio(0, 0),
      wrongPickUnseen: false,
      passed: stale,
      problems: ["no Item came back for it"],
    };
  }
  const readProblems = readingProblems(expected, actual.item);
  const asked = actual.question !== null;
  const pickRight = shouldAsk || stale ? null : livePick.includes(actual.pick?.productId ?? "");
  const seen = actual.note !== null || asked || (actual.pick?.notes.length ?? 0) > 0;
  const wrongPick =
    actual.pick !== null && (shouldAsk || (!stale && !livePick.includes(actual.pick.productId)));
  const passed = stale || (shouldAsk ? asked : pickRight === true);
  const problems = [
    ...readProblems,
    ...(shouldAsk && !asked ? ["did not ask"] : []),
    ...(!shouldAsk && asked ? [`asked "${actual.question}"`] : []),
    ...(pickRight === false && actual.pick !== null
      ? [`picked ${actual.pick.productId}`]
      : pickRight === false && !asked
        ? ["picked nothing"]
        : []),
  ];
  return {
    ...base,
    readRight: readProblems.length === 0,
    matchesRecall: ratio(overlap(liveFits, actual.matches), liveFits.length),
    fitsPrecision: ratio(overlap(actual.fits, liveFits), actual.fits.length),
    fitsRecall: ratio(overlap(liveFits, actual.fits), liveFits.length),
    pickRight,
    asked,
    alternatives:
      asked && shouldAsk
        ? ratio(overlap(actual.alternatives, liveAlternatives), actual.alternatives.length)
        : ratio(0, 0),
    wrongPickUnseen: wrongPick && !seen,
    passed,
    problems,
  };
}

function readingProblems(expected: ExpectedItem, item: Item): string[] {
  const problems: string[] = [];
  if (!sameBrand(expected.brand, item.brand)) {
    problems.push(`brand ${JSON.stringify(item.brand)}`);
  }
  if (item.size.kind !== expected.size) problems.push(`size ${item.size.kind}`);
  if (JSON.stringify(item.quantity) !== JSON.stringify(parseQuantity(expected.quantity))) {
    problems.push(`quantity ${JSON.stringify(item.quantity)}`);
  }
  return problems;
}

function sameBrand(expected: ExpectedItem["brand"], actual: string | null): boolean {
  if (expected === null || actual === null) return expected === actual;
  const compact = (brand: string) => normalize(brand).replaceAll(" ", "");
  return (typeof expected === "string" ? [expected] : expected).some(
    (brand) => compact(brand) === compact(actual),
  );
}

export function pairItems(
  expected: readonly ExpectedItem[],
  actual: readonly ItemRun[],
  isLive: IsLive,
): (number | null)[] {
  const pairs = expected.flatMap((wanted, e) => {
    const ids = [...(wanted.fits ?? []), ...(wanted.alternatives ?? [])].filter(isLive);
    return actual.map((got, a) => ({
      e,
      a,
      shared: overlap(ids, [...got.matches, ...got.fits, ...got.alternatives]),
    }));
  });
  pairs.sort(
    (x, y) => y.shared - x.shared || Math.abs(x.e - x.a) - Math.abs(y.e - y.a) || x.e - y.e,
  );
  const result: (number | null)[] = expected.map(() => null);
  const used = new Set<number>();
  for (const { e, a } of pairs) {
    if (result[e] !== null || used.has(a)) continue;
    result[e] = a;
    used.add(a);
  }
  return result;
}

function overlap(ids: readonly string[], among: readonly string[]): number {
  const set = new Set(among);
  return new Set(ids.filter((id) => set.has(id))).size;
}

export function casePassed({ runs }: CaseRuns): boolean {
  return runs.length > 0 && runs.every((run) => run.error === null && run.score.passed);
}

export function stability({ evalCase, runs }: CaseRuns): Ratio {
  const scored = runs.flatMap((run) => (run.error === null ? [run] : []));
  const items = evalCase.items.flatMap((_, index) => {
    if (scored.some(({ score }) => score.items[index]!.stale)) return [];
    const outcomes = scored.map(({ result, score }) => {
      const actual = score.items[index]!.actual;
      const got = actual === null ? null : result.items[actual]!;
      return JSON.stringify(
        got === null ? null : { fits: [...got.fits].sort(), pick: got.pick?.productId ?? null },
      );
    });
    return [scored.length === runs.length && new Set(outcomes).size === 1];
  });
  return ratio(items.filter(Boolean).length, items.length);
}

export function summarize(cases: readonly CaseRuns[]): Totals {
  const add = (a: Ratio, b: Ratio): Ratio => ratio(a.hits + b.hits, a.total + b.total);
  const zero = ratio(0, 0);
  const runs = cases.flatMap(({ runs }) => runs);
  const scores = runs.flatMap((run) => (run.error === null ? [run.score] : []));
  const items = scores.flatMap(({ items }) => items.filter(({ stale }) => !stale));
  const sum = (pick: (item: ItemScore) => Ratio) => items.map(pick).reduce(add, zero);
  const count = (test: (item: ItemScore) => boolean) => items.filter(test).length;
  const failedCases = cases.filter((runs) => !casePassed(runs)).map(({ evalCase }) => evalCase.id);
  return {
    cases: ratio(cases.length - failedCases.length, cases.length),
    failedCases,
    runs: runs.length,
    errors: runs.length - scores.length,
    itemsRead: ratio(
      count(({ readRight }) => readRight),
      items.length,
    ),
    itemCountRight: ratio(
      scores.filter(({ itemCountRight }) => itemCountRight).length,
      scores.length,
    ),
    notItemsKept: ratio(
      scores.filter(({ notItemsFound }) => notItemsFound.length === 0).length,
      scores.length,
    ),
    matchesRecall: sum(({ matchesRecall }) => matchesRecall),
    fitsPrecision: sum(({ fitsPrecision }) => fitsPrecision),
    fitsRecall: sum(({ fitsRecall }) => fitsRecall),
    pickRight: ratio(
      count(({ pickRight }) => pickRight === true),
      count(({ pickRight }) => pickRight !== null),
    ),
    wrongPicksUnseen: count(({ wrongPickUnseen }) => wrongPickUnseen),
    unexpectedQuestions: count(({ shouldAsk, asked }) => !shouldAsk && asked),
    missedQuestions: count(({ shouldAsk, asked }) => shouldAsk && !asked),
    scoredItems: items.length,
    alternatives: sum(({ alternatives }) => alternatives),
    ignoredPreference: ratio(
      scores.filter(({ ignoredPreferenceRight }) => ignoredPreferenceRight === true).length,
      scores.filter(({ ignoredPreferenceRight }) => ignoredPreferenceRight !== null).length,
    ),
    stability: cases.map(stability).reduce(add, zero),
  };
}

export function unexpectedFailures(cases: readonly CaseRuns[]): string[] {
  return cases
    .filter((runs) => runs.evalCase.expectedToFail === undefined && !casePassed(runs))
    .map(({ evalCase }) => evalCase.id);
}

export function unexpectedPasses(cases: readonly CaseRuns[]): string[] {
  return cases
    .filter((runs) => runs.evalCase.expectedToFail !== undefined && casePassed(runs))
    .map(({ evalCase }) => evalCase.id);
}

export type CaseOutcome = { id: string; passed: boolean };

export function changesSince(
  previous: readonly CaseOutcome[],
  current: readonly CaseOutcome[],
): string[] {
  const before = new Map(previous.map(({ id, passed }) => [id, passed]));
  const word = (passed: boolean) => (passed ? "passed" : "failed");
  return current.flatMap(({ id, passed }) => {
    const old = before.get(id);
    return old === undefined || old === passed ? [] : [`${id} ${word(old)} → ${word(passed)}`];
  });
}
