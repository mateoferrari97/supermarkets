import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import type { CatalogProduct } from "../../core/order-matching/catalog-product.ts";
import type { FitProductsInput } from "../../core/order-matching/match-items.ts";
import type { PlanInput } from "../../core/planning/plan.ts";
import type { ReadReplyInput } from "../../core/order-matching/read-reply.ts";
import {
  createClaudeCodeLlm,
  createProcessRunner,
  TASK_BUDGETS_USD,
  TASK_MODELS,
  type LlmCall,
  type ProcessResult,
} from "./claude-code-llm.ts";

const promptsDir = mkdtempSync(join(tmpdir(), "prompts-"));
mkdirSync(join(promptsDir, "order-matching"));
mkdirSync(join(promptsDir, "planning"));
writeFileSync(join(promptsDir, "planning", "route-message.md"), "Route the message.");
writeFileSync(join(promptsDir, "planning", "plan.md"), "Plan with the catalog.");
writeFileSync(join(promptsDir, "order-matching", "parse-order.md"), "Parse the order.");
writeFileSync(join(promptsDir, "order-matching", "fit-products.md"), "Fit the products.");
writeFileSync(join(promptsDir, "order-matching", "read-reply.md"), "Read the reply.");

const session = (fields: Record<string, unknown>): ProcessResult => ({
  exitCode: 0,
  stderr: "",
  stdout: JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    total_cost_usd: 0.0137,
    duration_ms: 3039,
    ...fields,
  }),
});

const signal = new AbortController().signal;

const llmWith = (
  result: ProcessResult,
  calls: LlmCall[] = [],
  argsSeen: string[][] = [],
  signalsSeen: AbortSignal[] = [],
  inputsSeen: string[] = [],
) =>
  createClaudeCodeLlm({
    promptsDir,
    run: (args, input, runSignal) => {
      argsSeen.push(args);
      inputsSeen.push(input);
      signalsSeen.push(runSignal);
      return Promise.resolve(result);
    },
    onCall: (call) => calls.push(call),
  });

const yerba = {
  lines: [
    { original: "yerba", product: "Yerba", brand: null, size: "common", quantity: "minimum" },
  ],
  ignoredPreference: false,
};

describe("createClaudeCodeLlm", () => {
  it("returns the validated structured output and reports the call with its raw output", async () => {
    const calls: LlmCall[] = [];
    const argsSeen: string[][] = [];
    const result = session({ structured_output: yerba });
    const llm = llmWith(result, calls, argsSeen);
    const answer = await llm.parseOrder("yerba", signal);
    assert.deepEqual(
      answer.items.map(({ product }) => product),
      ["Yerba"],
    );
    const args = argsSeen[0]!;
    const systemPrompt = args[args.indexOf("--system-prompt") + 1]!;
    assert.deepEqual(calls, [
      {
        task: "parse-order",
        model: "claude-sonnet-5-5",
        effort: "low",
        systemPromptSha256: createHash("sha256").update(systemPrompt).digest("hex"),
        input: "<order>\nyerba\n</order>",
        rawOutput: result.stdout,
        costUsd: 0.0137,
        durationMs: 3039,
      },
    ]);
    assert.equal(args[args.indexOf("--tools") + 1], "");
    assert.ok(args.includes("--no-session-persistence"));
    assert.equal("$schema" in JSON.parse(args[args.indexOf("--json-schema") + 1]!), false);
  });

  it("fails on an answer that does not match the task's schema", async () => {
    const llm = llmWith(session({ structured_output: { lines: [{ original: "" }] } }));
    await assert.rejects(llm.parseOrder("yerba", signal), /parse-order returned an invalid answer/);
  });

  it("fails when the session reports an error such as an exhausted budget", async () => {
    const llm = llmWith(
      session({
        is_error: true,
        subtype: "error_max_budget_usd",
        errors: ["Reached maximum budget ($0.0001)"],
      }),
    );
    await assert.rejects(
      llm.parseOrder("yerba", signal),
      /parse-order failed \(error_max_budget_usd\): Reached maximum budget/,
    );
  });

  it("fails when the CLI exits with an error", async () => {
    const llm = llmWith({ exitCode: 1, stdout: "", stderr: "Not logged in\n" });
    await assert.rejects(llm.parseOrder("yerba", signal), /exited with 1: Not logged in/);
  });

  it("passes the signal of the call to the session it runs", async () => {
    const signalsSeen: AbortSignal[] = [];
    const controller = new AbortController();
    const llm = llmWith(session({ structured_output: yerba }), [], [], signalsSeen);
    await llm.parseOrder("yerba", controller.signal);
    assert.deepEqual(signalsSeen, [controller.signal]);
  });

  it("starts no session once the signal is aborted", async () => {
    const argsSeen: string[][] = [];
    const controller = new AbortController();
    controller.abort();
    const llm = llmWith(session({ structured_output: {} }), [], argsSeen);
    await assert.rejects(llm.parseOrder("yerba", controller.signal), { name: "AbortError" });
    assert.equal(argsSeen.length, 0);
  });
});

describe("budget per session", () => {
  const budgetOf = (args: string[]) => args[args.indexOf("--max-budget-usd") + 1];

  it("gives each task's session its own budget", async () => {
    const argsSeen: string[][] = [];
    const llm = createClaudeCodeLlm({
      promptsDir,
      budgetsUsd: { "route-message": 0.05 },
      run: (args) => {
        argsSeen.push(args);
        const routing = args.includes("Route the message.");
        return Promise.resolve(
          session({ structured_output: routing ? { topic: "order" } : yerba }),
        );
      },
    });
    await llm.routeMessage("yerba", signal);
    await llm.parseOrder("yerba", signal);
    assert.deepEqual(argsSeen.map(budgetOf), ["0.05", String(TASK_BUDGETS_USD["parse-order"])]);
  });
});

describe("routeMessage", () => {
  const topic = (value: string) => session({ structured_output: { topic: value } });

  it("runs Haiku at its default effort with its prompt and the message wrapped in <message>", async () => {
    const calls: LlmCall[] = [];
    const argsSeen: string[][] = [];
    const inputsSeen: string[] = [];
    const llm = llmWith(topic("plan"), calls, argsSeen, [], inputsSeen);
    const answer = await llm.routeMessage("quiero hacer lasaña para 4", signal);
    assert.deepEqual(answer, { topic: "plan" });
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--model") + 1], "claude-haiku-5-5");
    assert.equal(args.includes("--effort"), false);
    assert.equal(args[args.indexOf("--system-prompt") + 1], "Route the message.");
    assert.deepEqual(inputsSeen, ["<message>\nquiero hacer lasaña para 4\n</message>"]);
    assert.deepEqual(
      calls.map(({ task, model, effort, input }) => ({ task, model, effort, input })),
      [
        {
          task: "route-message",
          model: "claude-haiku-5-5",
          effort: null,
          input: "<message>\nquiero hacer lasaña para 4\n</message>",
        },
      ],
    );
    assert.deepEqual(TASK_MODELS["route-message"], { model: "claude-haiku-5-5", effort: null });
  });

  it("returns each Topic", async () => {
    for (const value of ["order", "plan", "off-topic"]) {
      assert.deepEqual(await llmWith(topic(value)).routeMessage("hola", signal), { topic: value });
    }
  });

  it("fails on a Topic it does not know", async () => {
    await assert.rejects(
      llmWith(topic("recipe")).routeMessage("hola", signal),
      /route-message returned an invalid answer/,
    );
  });
});

describe("plan", () => {
  const products: CatalogProduct[] = [
    {
      productId: "p1",
      itemId: "1",
      name: "Tapas para lasaña 500 g",
      brand: "La Salteña",
      department: "Almacén",
      tipo: "Pastas frescas",
      price: 2500,
      inStock: true,
      sale: { kind: "packaged", size: { dimension: "weight", amount: 500 } },
      teasers: [],
    },
    {
      productId: "p2",
      itemId: "2",
      name: "Carne picada especial x kg",
      brand: null,
      department: "Carnes",
      tipo: null,
      price: 9000,
      inStock: true,
      sale: { kind: "by-weight", saleStepKg: 0.5 },
      teasers: [],
    },
    {
      productId: "p3",
      itemId: "3",
      name: "Salsa de tomate",
      brand: null,
      department: "Almacén",
      tipo: null,
      price: null,
      inStock: true,
      sale: { kind: "packaged", size: null },
      teasers: [],
    },
  ];
  const plan = {
    title: "Lasaña para 4",
    idea: [{ heading: "Pasos", text: "Armá capas y horneá." }],
    lines: [{ productId: "p1", quantity: 2, purpose: "para la lasaña", reason: "La pasta" }],
  };
  const input: PlanInput = {
    messages: [
      { role: "owner", text: "quiero hacer lasaña para 4" },
      { role: "planner", text: "Acá va la lasaña." },
      { role: "owner", text: "que sea para 6" },
    ],
    products,
    lastPlan: plan,
  };
  const output = (fields: Record<string, unknown>) =>
    session({
      structured_output: {
        kind: "answer",
        queries: [],
        message: null,
        plan: null,
        budget: null,
        ...fields,
      },
    });

  it("runs Sonnet at its default effort with its prompt and the conversation it renders", async () => {
    const calls: LlmCall[] = [];
    const argsSeen: string[][] = [];
    const inputsSeen: string[] = [];
    const llm = llmWith(output({ message: "¿Algo más?" }), calls, argsSeen, [], inputsSeen);
    await llm.plan(input, signal);
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--model") + 1], "claude-sonnet-5-5");
    assert.equal(args.includes("--effort"), false);
    assert.equal(args[args.indexOf("--system-prompt") + 1], "Plan with the catalog.");
    assert.equal(
      inputsSeen[0],
      [
        "<conversation>",
        "<owner>quiero hacer lasaña para 4</owner>",
        "<planner>Acá va la lasaña.</planner>",
        "<owner>que sea para 6</owner>",
        "</conversation>",
        "<products>",
        "p1 | Tapas para lasaña 500 g | La Salteña | Almacén | Pastas frescas | $2500 | packaged, 500 g",
        "p2 | Carne picada especial x kg | sin marca | Carnes | sin tipo | $9000 per kg | by weight, Sale Step 500 g",
        "p3 | Salsa de tomate | sin marca | Almacén | sin tipo | no price | packaged, size unknown",
        "</products>",
        "<last-plan>",
        "<title>Lasaña para 4</title>",
        "<idea>",
        "## Pasos",
        "Armá capas y horneá.",
        "</idea>",
        "<lines>",
        "p1 | 2 | para la lasaña | La pasta",
        "</lines>",
        "</last-plan>",
      ].join("\n"),
    );
    assert.deepEqual(
      calls.map(({ task, model, effort }) => ({ task, model, effort })),
      [{ task: "plan", model: "claude-sonnet-5-5", effort: null }],
    );
    assert.deepEqual(TASK_MODELS.plan, { model: "claude-sonnet-5-5", effort: null });
  });

  it("says when no Plan was shown yet", async () => {
    const inputsSeen: string[] = [];
    const llm = llmWith(output({ message: "¿Para cuántos?" }), [], [], [], inputsSeen);
    await llm.plan({ ...input, products: [], lastPlan: null }, signal);
    assert.match(inputsSeen[0]!, /<products>\n<\/products>\n<last-plan>none<\/last-plan>$/);
  });

  it("returns a search with its queries", async () => {
    const llm = llmWith(output({ kind: "search", queries: ["tapas lasaña", "carne picada"] }));
    assert.deepEqual(await llm.plan(input, signal), {
      kind: "search",
      queries: ["tapas lasaña", "carne picada"],
    });
  });

  it("returns an answer with its message, Plan and budget", async () => {
    const llm = llmWith(output({ message: "Acá va.", plan, budget: 50000 }));
    assert.deepEqual(await llm.plan(input, signal), {
      kind: "answer",
      message: "Acá va.",
      plan,
      budget: 50000,
    });
  });

  it("returns an answer with no budget", async () => {
    const llm = llmWith(output({ message: "Acá va.", plan }));
    const answer = await llm.plan(input, signal);
    assert.equal(answer.kind === "answer" && answer.budget, null);
  });

  it("renders the Owner's budget and the total of a Plan sent back over it", async () => {
    const inputsSeen: string[] = [];
    const llm = llmWith(output({ message: "Acá va." }), [], [], [], inputsSeen);
    await llm.plan({ ...input, overBudget: { budget: 50000, total: 58000.5 } }, signal);
    assert.match(
      inputsSeen[0]!,
      /<\/last-plan>\n<over-budget>\nbudget: \$50000\ntotal: \$58000\.5\nover by: \$8000\.5\n<\/over-budget>$/,
    );
  });

  it("fails on a search with no queries", async () => {
    await assert.rejects(
      llmWith(output({ kind: "search" })).plan(input, signal),
      /plan returned an invalid answer/,
    );
  });

  it("fails on an answer with no message", async () => {
    await assert.rejects(
      llmWith(output({ plan })).plan(input, signal),
      /plan returned an invalid answer/,
    );
  });
});

describe("parseOrder", () => {
  const line = (fields: Record<string, unknown>) => ({
    original: "coca 2,25",
    product: "Gaseosa cola",
    brand: "Coca Cola",
    size: "common",
    quantity: "minimum",
    ...fields,
  });
  const answer = (lines: Record<string, unknown>[], ignoredPreference = false) =>
    session({ structured_output: { lines, ignoredPreference } });

  it("runs Sonnet at low effort with its prompt and the order wrapped in <order>", async () => {
    const calls: LlmCall[] = [];
    const argsSeen: string[][] = [];
    const inputsSeen: string[] = [];
    const llm = llmWith(answer([line({})]), calls, argsSeen, [], inputsSeen);
    await llm.parseOrder("coca 2,25, pan", signal);
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--model") + 1], "claude-sonnet-5-5");
    assert.equal(args[args.indexOf("--effort") + 1], "low");
    assert.equal(args[args.indexOf("--system-prompt") + 1], "Parse the order.");
    assert.deepEqual(inputsSeen, ["<order>\ncoca 2,25, pan\n</order>"]);
    assert.deepEqual(
      calls.map(({ task, model, effort, input }) => ({ task, model, effort, input })),
      [
        {
          task: "parse-order",
          model: "claude-sonnet-5-5",
          effort: "low",
          input: "<order>\ncoca 2,25, pan\n</order>",
        },
      ],
    );
  });

  it("runs the model and effort it is given for the task", async () => {
    const argsSeen: string[][] = [];
    const llm = createClaudeCodeLlm({
      promptsDir,
      models: { "parse-order": { model: "claude-haiku-5-5", effort: null } },
      run: (args) => {
        argsSeen.push(args);
        return Promise.resolve(answer([line({})]));
      },
    });
    await llm.parseOrder("coca", signal);
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--model") + 1], "claude-haiku-5-5");
    assert.equal(args.includes("--effort"), false);
  });

  it("parses each line's size and quantity into the Item", async () => {
    const llm = llmWith(
      answer(
        [
          line({ size: "2.25 l" }),
          line({
            original: "picana 2kg",
            product: "Picaña",
            brand: null,
            size: "common",
            quantity: "1.5 kg",
          }),
          line({
            original: "coca cola zero grande",
            product: "Gaseosa cola zero",
            size: "biggest",
            quantity: "2 unit",
          }),
        ],
        true,
      ),
    );
    assert.deepEqual(await llm.parseOrder("coca 2,25, picana 2kg", signal), {
      items: [
        {
          original: "coca 2,25",
          product: "Gaseosa cola",
          brand: "Coca Cola",
          size: { kind: "exact", dimension: "volume", amount: 2250 },
          quantity: { kind: "minimum" },
        },
        {
          original: "picana 2kg",
          product: "Picaña",
          brand: null,
          size: { kind: "common" },
          quantity: { kind: "weight", grams: 1500 },
        },
        {
          original: "coca cola zero grande",
          product: "Gaseosa cola zero",
          brand: "Coca Cola",
          size: { kind: "biggest" },
          quantity: { kind: "units", count: 2 },
        },
      ],
      ignoredPreference: true,
    });
  });

  it.each([
    ["a size it cannot read", { size: "grande" }],
    ["a size of zero", { size: "0 ml" }],
    ["a weight as the quantity's size", { quantity: "2 l" }],
    ["a quantity of zero", { quantity: "0 kg" }],
    ["a count of no units", { quantity: "0 unit" }],
  ])("fails on %s", async (_case, fields) => {
    const llm = llmWith(answer([line(fields)]));
    await assert.rejects(llm.parseOrder("coca", signal), /parse-order returned an invalid answer/);
  });

  it("fails on an answer without lines", async () => {
    const llm = llmWith(answer([]));
    await assert.rejects(
      llm.parseOrder("pago con Visa", signal),
      /parse-order returned an invalid answer/,
    );
  });
});

describe("fitProducts", () => {
  const product = (name: string, brand: string | null, tipo: string | null): CatalogProduct => ({
    productId: name,
    itemId: name,
    name,
    brand,
    department: "Carnes y pescados",
    tipo,
    price: 1000,
    inStock: true,
    sale: { kind: "packaged", size: null },
    teasers: [],
  });
  const input = (alsoInThisLine: string[] = []): FitProductsInput => ({
    item: {
      original: "1 y 1 chorizo morzilla la divisa",
      product: "Morcilla",
      brand: "La Divisa",
      size: { kind: "common" },
      quantity: { kind: "units", count: 1 },
    },
    alsoInThisLine,
    matches: [
      product("Morcilla copetín al vacio La Divisa 400 grs", "La Divisa", "Morcilla"),
      product("Chorizo puro de cerdo La Divisa 400 grs", "La Divisa", null),
      product("Morcilla vasca Paladini x kg", null, "Morcilla"),
    ],
  });
  const answer = (fields: Record<string, unknown>) =>
    session({
      structured_output: { fits: [1], closest: [], note: null, question: null, ...fields },
    });

  it("runs Sonnet at its default effort with its prompt and the line it renders", async () => {
    const calls: LlmCall[] = [];
    const argsSeen: string[][] = [];
    const inputsSeen: string[] = [];
    const llm = llmWith(
      answer({ note: "Tomé 'morzilla' como morcilla." }),
      calls,
      argsSeen,
      [],
      inputsSeen,
    );
    assert.deepEqual(await llm.fitProducts(input(), signal), {
      fits: [1],
      closest: [],
      note: "Tomé 'morzilla' como morcilla.",
      question: null,
    });
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--model") + 1], "claude-sonnet-5-5");
    assert.equal(args.includes("--effort"), false);
    assert.equal(args[args.indexOf("--system-prompt") + 1], "Fit the products.");
    const line = [
      "<line>",
      "<original>1 y 1 chorizo morzilla la divisa</original>",
      "<product>Morcilla</product>",
      "<brand>La Divisa</brand>",
      "<candidates>",
      "1. Morcilla copetín al vacio La Divisa 400 grs | La Divisa | Morcilla",
      "2. Chorizo puro de cerdo La Divisa 400 grs | La Divisa | sin tipo",
      "3. Morcilla vasca Paladini x kg | sin marca | Morcilla",
      "</candidates>",
      "</line>",
    ].join("\n");
    assert.deepEqual(inputsSeen, [line]);
    assert.deepEqual(
      calls.map(({ task, model, effort, input }) => ({ task, model, effort, input })),
      [{ task: "fit-products", model: "claude-sonnet-5-5", effort: null, input: line }],
    );
  });

  it("names the other products of the same words in <also-in-this-line>", async () => {
    const inputsSeen: string[] = [];
    const llm = llmWith(answer({}), [], [], [], inputsSeen);
    await llm.fitProducts(input(["Chorizo parrillero", "Salchicha parrillera"]), signal);
    assert.match(
      inputsSeen[0]!,
      /<brand>La Divisa<\/brand>\n<also-in-this-line>Chorizo parrillero; Salchicha parrillera<\/also-in-this-line>\n<candidates>/,
    );
  });

  it("returns a question with the closest candidates when nothing fits", async () => {
    const llm = llmWith(answer({ fits: [], closest: [3, 1], question: "¿Te sirve alguna?" }));
    assert.deepEqual(await llm.fitProducts(input(), signal), {
      fits: [],
      closest: [3, 1],
      note: null,
      question: "¿Te sirve alguna?",
    });
  });

  it.each([
    ["a number that is not a candidate number", { fits: [0] }],
    ["a question that is empty", { fits: [], question: "" }],
  ])("fails on %s", async (_case, fields) => {
    const llm = llmWith(answer(fields));
    await assert.rejects(
      llm.fitProducts(input(), signal),
      /fit-products returned an invalid answer/,
    );
  });
});

describe("readReply", () => {
  const product = (name: string, brand: string | null): CatalogProduct => ({
    productId: name,
    itemId: name,
    name,
    brand,
    department: "Bebidas",
    tipo: null,
    price: 1000,
    inStock: true,
    sale: { kind: "packaged", size: null },
    teasers: [],
  });
  const input: ReadReplyInput = {
    items: [
      {
        kind: "asked",
        original: "cerveza artesanal de tamarindo",
        question: {
          text: "No encontré cerveza de tamarindo. ¿Te sirve alguna?",
          alternatives: [
            product("Cerveza ipa República Artesanal 473 ml", "República Artesanal"),
            product("Cerveza roja Patagonia 730 cc", "Patagonia"),
          ],
        },
      },
      {
        kind: "bought",
        original: "coca cola zero grande",
        product: product("Gaseosa cola Coca Cola Zero 2,25 lts", "Coca Cola"),
      },
      {
        kind: "asked",
        original: "1 bolsa de carbon",
        question: {
          text: "¿Te sirve este?",
          alternatives: [product("Carbón vegetal 4 kg", null)],
        },
      },
    ],
    reply: "la 2, y sacá el carbón",
  };
  const line = (fields: Record<string, unknown>) => ({
    original: "un vino tinto",
    product: "Vino tinto",
    brand: null,
    size: "common",
    quantity: "minimum",
    ...fields,
  });
  const answer = (entries: Record<string, unknown>[], newLines: unknown[] = []) =>
    session({ structured_output: { entries, newLines, ignoredPreference: false } });

  it("runs Sonnet at low effort with its prompt and the Items and reply it renders", async () => {
    const calls: LlmCall[] = [];
    const argsSeen: string[][] = [];
    const inputsSeen: string[] = [];
    const llm = llmWith(
      answer([
        { item: 1, kind: "choice", alternative: 2 },
        { item: 3, kind: "drop" },
      ]),
      calls,
      argsSeen,
      [],
      inputsSeen,
    );
    assert.deepEqual(await llm.readReply(input, signal), {
      entries: [
        { item: 1, kind: "choice", alternative: 2 },
        { item: 3, kind: "drop" },
      ],
      newLines: [],
      ignoredPreference: false,
    });
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--model") + 1], "claude-sonnet-5-5");
    assert.equal(args[args.indexOf("--effort") + 1], "low");
    assert.equal(args[args.indexOf("--system-prompt") + 1], "Read the reply.");
    const rendered = [
      "<items>",
      '<item number="1" state="asked">',
      "<original>cerveza artesanal de tamarindo</original>",
      "<question>No encontré cerveza de tamarindo. ¿Te sirve alguna?</question>",
      "<alternatives>",
      "1. Cerveza ipa República Artesanal 473 ml | República Artesanal",
      "2. Cerveza roja Patagonia 730 cc | Patagonia",
      "</alternatives>",
      "</item>",
      '<item number="2" state="in-cart">',
      "<original>coca cola zero grande</original>",
      "<bought>Gaseosa cola Coca Cola Zero 2,25 lts | Coca Cola</bought>",
      "</item>",
      '<item number="3" state="asked">',
      "<original>1 bolsa de carbon</original>",
      "<question>¿Te sirve este?</question>",
      "<alternatives>",
      "1. Carbón vegetal 4 kg | sin marca",
      "</alternatives>",
      "</item>",
      "</items>",
      "<reply>",
      "la 2, y sacá el carbón",
      "</reply>",
    ].join("\n");
    assert.deepEqual(inputsSeen, [rendered]);
    assert.deepEqual(
      calls.map(({ task, model, effort, input }) => ({ task, model, effort, input })),
      [{ task: "read-reply", model: "claude-sonnet-5-5", effort: "low", input: rendered }],
    );
  });

  it("parses the size and quantity of replacing lines and new lines into Items", async () => {
    const llm = llmWith(
      answer(
        [
          {
            item: 2,
            kind: "lines",
            lines: [
              line({
                original: "la coca de 1,5",
                product: "Gaseosa cola zero",
                brand: "Coca Cola",
                size: "1.5 l",
              }),
            ],
          },
        ],
        [line({ quantity: "2 unit" })],
      ),
    );
    assert.deepEqual(await llm.readReply(input, signal), {
      entries: [
        {
          item: 2,
          kind: "lines",
          lines: [
            {
              original: "la coca de 1,5",
              product: "Gaseosa cola zero",
              brand: "Coca Cola",
              size: { kind: "exact", dimension: "volume", amount: 1500 },
              quantity: { kind: "minimum" },
            },
          ],
        },
      ],
      newLines: [
        {
          original: "un vino tinto",
          product: "Vino tinto",
          brand: null,
          size: { kind: "common" },
          quantity: { kind: "units", count: 2 },
        },
      ],
      ignoredPreference: false,
    });
  });

  it("keeps a question for an ambiguous Correction of an Item in the cart", async () => {
    const llm = llmWith(
      answer([
        { item: 1, kind: "choice", alternative: 1 },
        { item: 2, kind: "unanswered", question: "¿Cuál coca, la zero o la normal?" },
        { item: 3, kind: "unanswered", question: null },
      ]),
    );
    assert.deepEqual((await llm.readReply(input, signal)).entries[1], {
      item: 2,
      kind: "unanswered",
      question: "¿Cuál coca, la zero o la normal?",
    });
  });

  it.each([
    ["an alternative of zero", [{ item: 1, kind: "choice", alternative: 0 }]],
    ["lines without a line", [{ item: 2, kind: "lines", lines: [] }]],
    [
      "a line with a size it cannot read",
      [{ item: 2, kind: "lines", lines: [line({ size: "1,5" })] }],
    ],
    ["an unknown kind", [{ item: 1, kind: "any" }]],
  ])("fails on %s", async (_case, entries) => {
    const llm = llmWith(answer(entries));
    await assert.rejects(llm.readReply(input, signal), /read-reply returned an invalid answer/);
  });

  it("fails on a new line with a quantity it cannot read", async () => {
    const llm = llmWith(answer([], [line({ quantity: "0 unit" })]));
    await assert.rejects(llm.readReply(input, signal), /read-reply returned an invalid answer/);
  });
});

describe("createProcessRunner", () => {
  it("returns what the process wrote and its exit code", async () => {
    const run = createProcessRunner(process.execPath);
    const result = await run(
      ["-e", "process.stdin.pipe(process.stdout); process.exitCode = 3"],
      "hola",
      signal,
    );
    assert.deepEqual(result, { exitCode: 3, stdout: "hola", stderr: "" });
  });

  it("kills the process when the signal is aborted and rejects once it has exited", async () => {
    const run = createProcessRunner(process.execPath);
    const controller = new AbortController();
    const running = run(
      ["-e", "process.stdout.write('started'); setInterval(() => {}, 1000)"],
      "",
      controller.signal,
    );
    setTimeout(() => controller.abort(), 200);
    await assert.rejects(running, { name: "AbortError" });
  });
});
