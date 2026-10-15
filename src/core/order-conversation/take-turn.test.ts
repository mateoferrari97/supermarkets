import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { Item } from "../order-resolution/concepts.ts";
import type { Llm, MapAnswerOutput, ResolveItemOutput } from "../order-resolution/llm.ts";
import type { Delivery, OnlineStore, StoreProduct } from "../product-selection/online-store.ts";
import type { StepEvent } from "./steps.ts";
import {
  NEW_CONVERSATION,
  ORDER_QUESTION,
  POSTAL_CODE_QUESTION,
  takeTurn,
  type ConversationDependencies,
  type ConversationState,
} from "./take-turn.ts";

const vocabulary = {
  groups: [
    {
      id: "grupo-leche",
      name: "Leche",
      productTypes: [
        { id: "leche-entera", name: "Leche entera" },
        { id: "leche-descremada", name: "Leche descremada" },
      ],
    },
    { id: "grupo-yerba", name: "Yerba", productTypes: [{ id: "yerba", name: "Yerba" }] },
  ],
};

const mapping = {
  "Leche entera": "leche-entera",
  "Leche descremada": "leche-descremada",
  Yerba: "yerba",
};

const products = [
  { name: "Leche entera La Serenísima 1 l", brand: "La Serenísima", tipo: "Leche entera" },
  { name: "Leche descremada Sancor 1 l", brand: "Sancor", tipo: "Leche descremada" },
  { name: "Yerba mate Playadito 1 kg", brand: "Playadito", tipo: "Yerba" },
].map((product) => ({ ...product, inStock: true }));

const storeProduct = (itemId: string, name: string): StoreProduct => ({
  productId: itemId,
  itemId,
  name,
  brand: null,
  measure: null,
  weightStepKg: null,
  teasers: [],
});

const shelf: Record<string, StoreProduct> = {
  Yerba: storeProduct("1", "Yerba mate Playadito 1 kg"),
  "Leche entera": storeProduct("2", "Leche entera La Serenísima 1 l"),
  "Leche descremada": storeProduct("3", "Leche descremada Sancor 1 l"),
};

const item = (phrase: string): Item => ({
  phrase,
  quantity: null,
  brand: null,
  terms: [],
  vagueWords: [],
});

type Script = {
  items?: Item[];
  answers?: Record<string, ResolveItemOutput>;
  replies?: Record<string, MapAnswerOutput>;
  ignoredPreference?: boolean;
  deliveries?: Record<string, Delivery>;
};

const conversation = ({
  items = [],
  answers = {},
  replies = {},
  ignoredPreference = false,
  deliveries = {},
}: Script = {}) => {
  const calls: string[] = [];
  const signals: AbortSignal[] = [];
  const seen = (name: string, signal: AbortSignal) => {
    calls.push(name);
    signals.push(signal);
  };
  const llm: Llm = {
    parseOrder: () => Promise.reject(new Error("no parse")),
    splitOrder: (_text, signal) => {
      seen("splitOrder", signal);
      return Promise.resolve({ items, ignoredPreference });
    },
    resolveItem: (input, signal) => {
      seen("resolveItem", signal);
      const answer = answers[input.item.phrase];
      return answer ? Promise.resolve(answer) : Promise.reject(new Error("no answer"));
    },
    rewordItem: (input, signal) => {
      seen("rewordItem", signal);
      return Promise.resolve({ phrase: input.item.phrase });
    },
    mapAnswer: (input, signal) => {
      seen("mapAnswer", signal);
      const reply = replies[input.answer];
      return reply ? Promise.resolve(reply) : Promise.reject(new Error("no reply"));
    },
  };
  const store: OnlineStore = {
    checkDelivery: (postalCode, signal) => {
      seen("checkDelivery", signal);
      return Promise.resolve(deliveries[postalCode] ?? "delivers");
    },
    findCandidates: (query, signal) => {
      seen("findCandidates", signal);
      return Promise.resolve(query.tipos.flatMap((tipo) => (shelf[tipo] ? [shelf[tipo]] : [])));
    },
    simulate: (request, signal) => {
      seen("simulate", signal);
      const lines = request.items.map(({ itemId, quantity }) => ({
        itemId,
        quantity,
        available: true,
        total: 1000 * quantity,
        savings: 0,
        promotions: [],
      }));
      return Promise.resolve({ lines, total: lines.reduce((sum, line) => sum + line.total, 0) });
    },
    cartLink: (cart) => `cart:${cart.map(({ itemId }) => itemId).join(",")}`,
  };
  const deps: ConversationDependencies = {
    products,
    vocabulary,
    mapping,
    snapshot: [],
    llm,
    store,
  };
  return { deps, calls, signals };
};

const ordering: ConversationState = { stage: "order", postalCode: "1425" };

const yerba: Script = {
  items: [item("yerba")],
  answers: { yerba: { kind: "match", candidates: ["yerba"] } },
};

const leche: Script = {
  items: [item("leche")],
  answers: { leche: { kind: "match", candidates: ["grupo-leche"] } },
  replies: {
    "no sé": { answers: [{ question: 1, kind: "unclear", options: [], phrase: null }] },
    "la entera": { answers: [{ question: 1, kind: "chosen", options: [1], phrase: null }] },
  },
};

describe("takeTurn", () => {
  describe("postal code", () => {
    it("asks for the postal code when a new conversation has none", async () => {
      const { deps, calls } = conversation();
      const turn = await takeTurn(NEW_CONVERSATION, "", deps);
      assert.deepEqual(turn, {
        state: { stage: "postal-code" },
        reply: { kind: "ask", text: POSTAL_CODE_QUESTION },
      });
      assert.deepEqual(calls, []);
    });

    it("asks again when the reply holds no postal code", async () => {
      const { deps, calls } = conversation();
      const turn = await takeTurn(NEW_CONVERSATION, "Palermo", deps);
      assert.deepEqual(turn.state, { stage: "postal-code" });
      assert.deepEqual(turn.reply, {
        kind: "ask",
        text: `"Palermo" no es un código postal válido. ${POSTAL_CODE_QUESTION}`,
      });
      assert.deepEqual(calls, []);
    });

    it("asks again when Carrefour rejects the postal code", async () => {
      const { deps } = conversation({ deliveries: { "9999": "postal-code-rejected" } });
      const turn = await takeTurn(NEW_CONVERSATION, "9999", deps);
      assert.deepEqual(turn.state, { stage: "postal-code" });
      assert.deepEqual(turn.reply, {
        kind: "ask",
        text: `"9999" no es un código postal válido. ${POSTAL_CODE_QUESTION}`,
      });
    });

    it("asks again when Carrefour does not deliver to the postal code", async () => {
      const { deps } = conversation({ deliveries: { "9410": "does-not-deliver" } });
      const turn = await takeTurn(NEW_CONVERSATION, "envío a 9410", deps);
      assert.deepEqual(turn.state, { stage: "postal-code" });
      assert.deepEqual(turn.reply, {
        kind: "ask",
        text: `Carrefour no entrega en el código postal 9410. ${POSTAL_CODE_QUESTION}`,
      });
    });

    it("asks for the order once Carrefour delivers to the postal code", async () => {
      const { deps, calls } = conversation();
      const turn = await takeTurn(NEW_CONVERSATION, "envío a 1425", deps);
      assert.deepEqual(turn, {
        state: { stage: "order", postalCode: "1425" },
        reply: { kind: "ask", text: ORDER_QUESTION },
      });
      assert.deepEqual(calls, ["checkDelivery"]);
    });
  });

  describe("order", () => {
    it("asks for the order again when the reply is empty", async () => {
      const { deps, calls } = conversation(yerba);
      const turn = await takeTurn(ordering, "  ", deps);
      assert.deepEqual(turn, { state: ordering, reply: { kind: "ask", text: ORDER_QUESTION } });
      assert.deepEqual(calls, []);
    });

    it("picks the products right away when the order leaves nothing to ask", async () => {
      const { deps } = conversation(yerba);
      const turn = await takeTurn(ordering, "yerba", deps);
      assert.equal(turn.state.stage, "done");
      assert.equal(turn.reply.kind, "selection");
      if (turn.reply.kind !== "selection") return;
      assert.equal(turn.reply.selection.postalCode, "1425");
      assert.deepEqual(
        turn.reply.selection.lines.map(({ phrase, product }) => [phrase, product?.itemId]),
        [["yerba", "1"]],
      );
      assert.equal(turn.reply.selection.cartLink, "cart:1");
    });

    it("answers with the open questions of the order", async () => {
      const { deps, calls } = conversation(leche);
      const turn = await takeTurn(ordering, "leche", deps);
      assert.equal(turn.state.stage, "questions");
      assert.equal(turn.reply.kind, "questions");
      if (turn.reply.kind !== "questions") return;
      assert.match(turn.reply.text, /Para "leche", ¿cuál querés\?/);
      assert.equal(turn.reply.items[0]?.question?.kind, "productType");
      assert.deepEqual(calls, ["splitOrder", "resolveItem"]);
    });
  });

  describe("questions", () => {
    const asking = async () => {
      const { deps } = conversation(leche);
      return (await takeTurn(ordering, "leche", deps)).state;
    };

    it("asks again the questions an answer left unclear", async () => {
      const state = await asking();
      const { deps } = conversation(leche);
      const turn = await takeTurn(state, "no sé", deps);
      assert.equal(turn.state.stage, "questions");
      assert.equal(turn.reply.kind, "questions");
      if (turn.reply.kind !== "questions") return;
      assert.match(turn.reply.text, /Para "leche", ¿cuál querés\?/);
    });

    it("repeats the questions without asking the LLM when the reply is empty", async () => {
      const state = await asking();
      const { deps, calls } = conversation(leche);
      const turn = await takeTurn(state, "", deps);
      assert.equal(turn.state, state);
      assert.equal(turn.reply.kind, "questions");
      assert.deepEqual(calls, []);
    });

    it("picks the products once the answers leave nothing to ask", async () => {
      const state = await asking();
      const { deps, calls } = conversation(leche);
      const turn = await takeTurn(state, "la entera", deps);
      assert.equal(turn.state.stage, "done");
      assert.equal(turn.reply.kind, "selection");
      if (turn.reply.kind !== "selection") return;
      assert.deepEqual(
        turn.reply.selection.lines.map(({ product }) => product?.itemId),
        ["2"],
      );
      assert.deepEqual(calls.slice(0, 2), ["mapAnswer", "findCandidates"]);
    });

    it("refuses a turn once the Product Selection was delivered", async () => {
      const { deps } = conversation(yerba);
      const { state } = await takeTurn(ordering, "yerba", deps);
      await assert.rejects(takeTurn(state, "más yerba", deps), /already delivered/);
    });
  });

  describe("steps", () => {
    it("reports each step started and done, in order", async () => {
      const { deps } = conversation(yerba);
      const events: StepEvent[] = [];
      await takeTurn(ordering, "yerba", deps, (event) => events.push(event));
      assert.deepEqual(
        events.map(({ status, step }) => [status, step.kind]),
        [
          ["started", "understand-order"],
          ["done", "understand-order"],
          ["started", "search-item"],
          ["done", "search-item"],
          ["started", "find-candidates"],
          ["done", "find-candidates"],
          ["started", "simulate-cart"],
          ["done", "simulate-cart"],
        ],
      );
      assert.deepEqual(events[2]?.step, { kind: "search-item", phrase: "yerba" });
      assert.deepEqual(events[4]?.step, { kind: "find-candidates", phrase: "yerba" });
    });

    it("reports understanding the answer to the questions", async () => {
      const { deps } = conversation(leche);
      const { state } = await takeTurn(ordering, "leche", deps);
      const events: StepEvent[] = [];
      await takeTurn(state, "no sé", deps, (event) => events.push(event));
      assert.deepEqual(events, [
        { status: "started", step: { kind: "understand-answer" } },
        { status: "done", step: { kind: "understand-answer" } },
      ]);
    });
  });

  describe("abort", () => {
    it("passes the turn's signal to every call of both ports", async () => {
      const { deps, calls, signals } = conversation(yerba);
      const controller = new AbortController();
      const { state } = await takeTurn(NEW_CONVERSATION, "1425", {
        ...deps,
        signal: controller.signal,
      });
      await takeTurn(state, "yerba", { ...deps, signal: controller.signal });
      assert.deepEqual(
        new Set(calls),
        new Set(["checkDelivery", "splitOrder", "resolveItem", "findCandidates", "simulate"]),
      );
      assert.ok(signals.every((signal) => signal === controller.signal));
    });

    it("stops an aborted turn and leaves the state as it was before the turn", async () => {
      const state = await (async () => {
        const { deps } = conversation(leche);
        return (await takeTurn(ordering, "leche", deps)).state;
      })();
      const before = structuredClone(state);
      const controller = new AbortController();
      const { deps } = conversation(leche);
      const aborting: ConversationDependencies = {
        ...deps,
        signal: controller.signal,
        llm: {
          ...deps.llm,
          mapAnswer: (input, signal) => {
            controller.abort();
            return deps.llm.mapAnswer(input, signal);
          },
        },
      };
      await assert.rejects(takeTurn(state, "la entera", aborting), { name: "AbortError" });
      assert.deepEqual(state, before);
    });

    it("does not start a turn whose signal is already aborted", async () => {
      const { deps, calls } = conversation();
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        takeTurn(NEW_CONVERSATION, "1425", { ...deps, signal: controller.signal }),
        { name: "AbortError" },
      );
      assert.deepEqual(calls, []);
    });
  });
});
