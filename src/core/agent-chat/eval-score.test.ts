import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { AgentRun, RecordedCall, TurnRun } from "./eval-run.ts";
import { casePassed, scoreAgentRun } from "./eval-score.ts";
import type { AgentCase, AgentTurnCase } from "./eval-set.ts";
import type { Cart, OrderLine } from "./order.ts";

const line = (productId: string, quantity = 1): OrderLine => ({
  description: "x",
  productId,
  itemId: `${productId}0`,
  name: `Product ${productId}`,
  brand: null,
  quantity,
  unitPrice: 100,
  total: 100 * quantity,
  reason: "",
  notes: [],
});

const cartOf = (...lines: OrderLine[]): Cart => ({
  postalCode: "1425",
  lines,
  notes: [],
  total: 0,
  warning: "",
  cartLink: "https://eval.invalid/cart",
});

const call = (name: string, output: unknown = {}, input: unknown = {}): RecordedCall => ({
  name,
  input,
  output,
  error: null,
});

const turn = (
  ends: TurnRun["ends"],
  calls: RecordedCall[] = [],
  text = "ok",
  profileBefore: TurnRun["profileBefore"] = { postalCode: "1425" },
): TurnRun => ({
  owner: "hola",
  reply: { role: "assistant", at: "2026-10-16T12:00:00.000Z", text },
  ends,
  calls,
  profileBefore,
  durationMs: 0,
});

const runOf = (turns: TurnRun[], carts: Cart[] = [], postalCode = "1425"): AgentRun => ({
  turns,
  profile: { postalCode },
  carts,
});

const caseOf = (turns: AgentTurnCase[], overrides: Partial<AgentCase> = {}): AgentCase => ({
  id: "a-case",
  covers: ["precise-product"],
  setup: { postalCode: "1425" },
  turns,
  ...overrides,
});

const problemsOf = (evalCase: AgentCase, run: AgentRun) => scoreAgentRun(evalCase, run).problems;

describe("scoreAgentRun, the expectations of a turn", () => {
  it("passes a turn that ends as expected with the required tools", () => {
    const evalCase = caseOf([{ owner: "x", ends: "proposal", calls: ["resolveItem"] }]);
    const run = runOf([turn("proposal", [call("resolveItem", { kind: "picked" })])]);
    assert.deepEqual(scoreAgentRun(evalCase, run), { passed: true, problems: [] });
  });

  it("reports how the turn ended, a missing tool and a forbidden tool", () => {
    const evalCase = caseOf([
      { owner: "x", ends: "proposal", calls: ["resolveItem"], noCalls: ["buildCart"] },
    ]);
    assert.deepEqual(problemsOf(evalCase, runOf([turn("text", [call("buildCart")])])).slice(0, 3), [
      "turn 1: ended with text, expected proposal",
      "turn 1: did not call resolveItem",
      "turn 1: called buildCart",
    ]);
  });

  it("counts the questions of the round", () => {
    const evalCase = caseOf([{ owner: "x", ends: "round", minQuestions: 2 }]);
    const reply = turn("round");
    reply.reply.parts = [
      {
        type: "round",
        round: {
          questions: [
            {
              number: 1,
              ref: "1",
              text: "¿Cuál?",
              options: [{ label: "a", productId: null, price: null }],
              recommended: 1,
            },
          ],
        },
      },
    ];
    assert.deepEqual(problemsOf(evalCase, runOf([reply])), [
      "turn 1: asked 1 questions, expected at least 2",
    ]);
  });

  it("wants a resolveItem call that excludes the products already shown", () => {
    const evalCase = caseOf([{ owner: "x", ends: "round", moreOptions: true }]);
    const choose = { kind: "choose" };
    const asked = call("askQuestions", { kind: "asked" });
    assert.deepEqual(
      problemsOf(evalCase, runOf([turn("round", [call("resolveItem", choose, {}), asked])])),
      ["turn 1: did not call resolveItem with excludeProductIds"],
    );
    assert.deepEqual(
      problemsOf(
        evalCase,
        runOf([turn("round", [call("resolveItem", choose, { excludeProductIds: ["1"] }), asked])]),
      ),
      [],
    );
  });
});

describe("scoreAgentRun, the rules every case follows", () => {
  const plain = caseOf([{ owner: "x", ends: "text" }]);

  it("flags a question about the postal code when the Profile has it", () => {
    assert.deepEqual(
      problemsOf(plain, runOf([turn("text", [], "Ya anoté todo. ¿Me pasás tu código postal?")])),
      ["turn 1: asked for the postal code when the Profile had it"],
    );
  });

  it("lets the Assistant say the postal code is saved, and ask for it when the Profile has none", () => {
    assert.deepEqual(
      problemsOf(plain, runOf([turn("text", [], "Listo, guardé tu código postal.")])),
      [],
    );
    assert.deepEqual(
      problemsOf(plain, runOf([turn("text", [], "¿Cuál es tu código postal?", null)])),
      [],
    );
  });

  it("lets the Assistant ask for another postal code after refusing the one the Owner gave", () => {
    const refused = call("updateProfile", { kind: "refused", reason: "not-delivered" });
    assert.deepEqual(
      problemsOf(
        plain,
        runOf([turn("text", [refused], "No llegamos ahí. ¿Tenés otro código postal?")]),
      ),
      [],
    );
  });

  it("flags a round of questions with no choose before it", () => {
    const evalCase = caseOf([{ owner: "x", ends: "round" }]);
    const asked = call("askQuestions", { kind: "asked", questions: 1 });
    const picked = call("resolveItem", { kind: "picked" });
    assert.deepEqual(problemsOf(evalCase, runOf([turn("round", [picked, asked])])), [
      "turn 1: asked a round of questions although no resolveItem answered choose",
    ]);
    const choose = call("resolveItem", { kind: "choose" });
    assert.deepEqual(problemsOf(evalCase, runOf([turn("round", [choose, asked])])), []);
  });

  it("does not count a refused askQuestions as a round", () => {
    const evalCase = caseOf([{ owner: "x", ends: "text" }]);
    const refused = call("askQuestions", { kind: "refused", reason: "bad-option" });
    assert.deepEqual(problemsOf(evalCase, runOf([turn("text", [refused])])), []);
  });

  it("flags a buildCart the tool refused", () => {
    const evalCase = caseOf([{ owner: "x", ends: "text" }]);
    const refused = call("buildCart", { kind: "refused", reason: "unanswered" });
    assert.deepEqual(problemsOf(evalCase, runOf([turn("text", [refused])])), [
      "turn 1: buildCart was refused: unanswered",
    ]);
  });

  it("does not flag a proposeOrder the tool refused, since the agent goes on", () => {
    const evalCase = caseOf([{ owner: "x", ends: "text" }]);
    const refused = call("proposeOrder", { kind: "refused", reason: "unknown-ref" });
    assert.deepEqual(problemsOf(evalCase, runOf([turn("text", [refused])])), []);
  });

  it("flags a cart built with no proposal shown before, except after reopening", () => {
    const evalCase = caseOf([{ owner: "x", ends: "cart" }]);
    const built = call("buildCart", { kind: "built" });
    assert.deepEqual(problemsOf(evalCase, runOf([turn("cart", [built])])), [
      "turn 1: built a cart with no proposal shown to the Owner first",
    ]);
    assert.deepEqual(
      problemsOf(
        evalCase,
        runOf([turn("cart", [call("reopenLastOrder", { kind: "reopened" }), built])]),
      ),
      [],
    );
    const two = caseOf([
      { owner: "x", ends: "proposal" },
      { owner: "y", ends: "cart" },
    ]);
    assert.deepEqual(problemsOf(two, runOf([turn("proposal"), turn("cart", [built])])), []);
  });
});

describe("scoreAgentRun, the Profile and the cart", () => {
  it("compares the Profile at the end", () => {
    const evalCase = caseOf([{ owner: "x", ends: "text" }], { postalCode: "5000" });
    assert.deepEqual(problemsOf(evalCase, runOf([turn("text")], [], "1425")), [
      "the Profile ends with postal code 1425, expected 5000",
    ]);
  });

  it("fails a cart when none should be built", () => {
    const evalCase = caseOf([{ owner: "x", ends: "text" }], { cart: null });
    assert.deepEqual(problemsOf(evalCase, runOf([turn("text")], [cartOf(line("1"))])), [
      "a cart was built",
    ]);
  });

  const ends = [{ owner: "x", ends: "cart" as const }];

  it("matches each expected line to one distinct line of the last cart", () => {
    const evalCase = caseOf(ends, {
      cart: {
        lines: [
          { product: "Leche", fits: ["1", "2"], quantity: 2 },
          { product: "Yerba", fits: ["3"] },
        ],
      },
    });
    assert.deepEqual(
      problemsOf(evalCase, runOf([turn("cart")], [cartOf(line("2", 2), line("3", 4))])),
      [],
    );
  });

  it("reports a missing product with what the cart has, and a wrong quantity", () => {
    const evalCase = caseOf(ends, {
      cart: { lines: [{ product: "Leche", fits: ["1"], quantity: 2 }] },
    });
    assert.deepEqual(problemsOf(evalCase, runOf([turn("cart")], [cartOf(line("1", 1))])), [
      "the cart has no Leche; it has 1 × 1",
      'the cart has products nobody asked for: 1 "Product 1"',
    ]);
  });

  it("flags extra products unless the case allows them, and checks the minimum of lines", () => {
    const lines = [{ product: "Leche", fits: ["1"] }];
    const cart = cartOf(line("1"), line("9"));
    assert.deepEqual(problemsOf(caseOf(ends, { cart: { lines } }), runOf([turn("cart")], [cart])), [
      'the cart has products nobody asked for: 9 "Product 9"',
    ]);
    assert.deepEqual(
      problemsOf(
        caseOf(ends, { cart: { lines, exact: false, minLines: 3 } }),
        runOf([turn("cart")], [cart]),
      ),
      ["the cart has 2 lines, expected at least 3"],
    );
  });

  it("says when no cart was built", () => {
    const evalCase = caseOf(ends, { cart: { minLines: 1 } });
    assert.deepEqual(problemsOf(evalCase, runOf([turn("cart")])), ["no cart was built"]);
  });
});

describe("casePassed", () => {
  it("needs every run to finish with no problem", () => {
    const passed = { error: null, score: { passed: true, problems: [] } };
    const failed = { error: null, score: { passed: false, problems: ["x"] } };
    assert.equal(casePassed([passed, passed]), true);
    assert.equal(casePassed([passed, failed]), false);
    assert.equal(casePassed([passed, { error: "boom" }]), false);
  });
});
