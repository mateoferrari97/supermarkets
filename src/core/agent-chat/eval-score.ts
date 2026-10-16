import type { AgentCase, AgentTurnCase, CartExpectation } from "./eval-set.ts";
import type { AgentRun, RecordedCall, TurnRun } from "./eval-run.ts";
import type { Cart } from "./order.ts";

export type Score = { passed: boolean; problems: string[] };

export type ScoredRun = { error: null; score: Score } | { error: string };

const kindOf = (output: unknown): string | null =>
  typeof output === "object" &&
  output !== null &&
  "kind" in output &&
  typeof output.kind === "string"
    ? output.kind
    : null;

const reasonOf = (output: unknown): string =>
  typeof output === "object" && output !== null && "reason" in output ? String(output.reason) : "";

const called = (turn: TurnRun, name: string): RecordedCall[] =>
  turn.calls.filter((call) => call.name === name);

const asksForPostalCode = (text: string): boolean =>
  text.split(/(?<=[?.!\n])/).some((sentence) => sentence.includes("?") && /postal/i.test(sentence));

const excludesShown = (call: RecordedCall): boolean =>
  typeof call.input === "object" &&
  call.input !== null &&
  "excludeProductIds" in call.input &&
  Array.isArray(call.input.excludeProductIds) &&
  call.input.excludeProductIds.length > 0;

export function scoreAgentRun(evalCase: AgentCase, run: AgentRun): Score {
  const problems: string[] = [];
  for (const [index, turn] of run.turns.entries()) {
    const where = `turn ${String(index + 1)}`;
    const expected = evalCase.turns[index]!;
    problems.push(...turnProblems(expected, turn).map((problem) => `${where}: ${problem}`));
    problems.push(
      ...ruleProblems(run.turns.slice(0, index), turn).map((problem) => `${where}: ${problem}`),
    );
  }
  if (evalCase.postalCode !== undefined && run.profile?.postalCode !== evalCase.postalCode) {
    problems.push(
      `the Profile ends with postal code ${run.profile?.postalCode ?? "none"}, expected ${evalCase.postalCode}`,
    );
  }
  if (evalCase.cart === null && run.carts.length > 0) problems.push("a cart was built");
  if (evalCase.cart) problems.push(...cartProblems(evalCase.cart, run.carts.at(-1) ?? null));
  return { passed: problems.length === 0, problems };
}

function turnProblems(expected: AgentTurnCase, turn: TurnRun): string[] {
  const problems: string[] = [];
  if (turn.ends !== expected.ends) {
    problems.push(`ended with ${turn.ends}, expected ${expected.ends}`);
  }
  for (const name of expected.calls ?? []) {
    if (called(turn, name).length === 0) problems.push(`did not call ${name}`);
  }
  for (const name of expected.noCalls ?? []) {
    if (called(turn, name).length > 0) problems.push(`called ${name}`);
  }
  if (expected.minQuestions !== undefined) {
    const questions = (turn.reply.parts ?? []).flatMap((part) =>
      part.type === "round" ? part.round.questions : [],
    );
    if (questions.length < expected.minQuestions) {
      problems.push(
        `asked ${String(questions.length)} questions, expected at least ${String(expected.minQuestions)}`,
      );
    }
  }
  if (expected.moreOptions && !called(turn, "resolveItem").some(excludesShown)) {
    problems.push("did not call resolveItem with excludeProductIds");
  }
  return problems;
}

function ruleProblems(before: TurnRun[], turn: TurnRun): string[] {
  const problems: string[] = [];
  const refusedPostalCode = called(turn, "updateProfile").some(
    (call) => kindOf(call.output) === "refused",
  );
  if (turn.profileBefore !== null && !refusedPostalCode && asksForPostalCode(turn.reply.text)) {
    problems.push("asked for the postal code when the Profile had it");
  }
  const rounds = called(turn, "askQuestions").filter((call) => kindOf(call.output) === "asked");
  const choices = called(turn, "resolveItem").filter((call) => kindOf(call.output) === "choose");
  if (rounds.length > 0 && choices.length === 0) {
    problems.push("asked a round of questions although no resolveItem answered choose");
  }
  for (const call of called(turn, "buildCart")) {
    if (kindOf(call.output) === "refused") {
      problems.push(`buildCart was refused: ${reasonOf(call.output)}`);
    }
  }
  const proposedBefore = before.some(({ ends }) => ends === "proposal");
  const reopened = called(turn, "reopenLastOrder").length > 0;
  if (
    called(turn, "buildCart").some((call) => kindOf(call.output) === "built") &&
    !proposedBefore &&
    !reopened
  ) {
    problems.push("built a cart with no proposal shown to the Owner first");
  }
  return problems;
}

function cartProblems(expected: CartExpectation, cart: Cart | null): string[] {
  if (cart === null) return ["no cart was built"];
  const problems: string[] = [];
  const remaining = [...cart.lines];
  for (const wanted of expected.lines ?? []) {
    const index = remaining.findIndex(
      (line) =>
        wanted.fits.includes(line.productId) &&
        (wanted.quantity === undefined || line.quantity === wanted.quantity),
    );
    if (index === -1) {
      const bought = cart.lines.map(
        ({ productId, quantity }) => `${productId} × ${String(quantity)}`,
      );
      problems.push(`the cart has no ${wanted.product}; it has ${bought.join(", ")}`);
    } else remaining.splice(index, 1);
  }
  if (expected.lines !== undefined && (expected.exact ?? true) && remaining.length > 0) {
    problems.push(
      `the cart has products nobody asked for: ${remaining.map(({ productId, name }) => `${productId} "${name}"`).join(", ")}`,
    );
  }
  if (expected.minLines !== undefined && cart.lines.length < expected.minLines) {
    problems.push(
      `the cart has ${String(cart.lines.length)} lines, expected at least ${String(expected.minLines)}`,
    );
  }
  return problems;
}

export function casePassed(runs: ScoredRun[]): boolean {
  return runs.every((run) => run.error === null && run.score.passed);
}
