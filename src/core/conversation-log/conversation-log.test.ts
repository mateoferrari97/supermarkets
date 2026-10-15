import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { Turn } from "../order-conversation/take-turn.ts";
import type { OnlineStore } from "../product-selection/online-store.ts";
import {
  loggedSteps,
  loggedStore,
  loggedTurn,
  messageOf,
  type ConversationEvent,
} from "./conversation-log.ts";

const signal = new AbortController().signal;

const ticking = () => {
  let time = 0;
  return () => (time += 10);
};

const store: OnlineStore = {
  checkDelivery: (postalCode) =>
    Promise.resolve(postalCode === "1425" ? "delivers" : "does-not-deliver"),
  findCandidates: () => Promise.reject(new Error("Carrefour answered 500")),
  simulate: (request) =>
    Promise.resolve({
      lines: request.items.map((item) => ({
        ...item,
        available: true,
        total: 100,
        savings: 0,
        promotions: [],
      })),
      total: 100,
    }),
  cartLink: (items) => `https://example.test/cart?${items.map((item) => item.itemId).join(",")}`,
};

describe("loggedStore", () => {
  it("records every call to the Online Store with its input, output and duration", async () => {
    const events: ConversationEvent[] = [];
    const logged = loggedStore(store, (event) => events.push(event), ticking());

    assert.equal(await logged.checkDelivery("1425", signal), "delivers");
    const simulation = await logged.simulate(
      { postalCode: "1425", items: [{ itemId: "7", quantity: 2 }] },
      signal,
    );
    const link = logged.cartLink([{ itemId: "7", quantity: 2 }]);

    assert.equal(simulation.total, 100);
    assert.equal(link, "https://example.test/cart?7");
    assert.deepEqual(events, [
      {
        type: "store-call",
        method: "checkDelivery",
        input: { postalCode: "1425" },
        output: "delivers",
        error: null,
        durationMs: 10,
      },
      {
        type: "store-call",
        method: "simulate",
        input: { postalCode: "1425", items: [{ itemId: "7", quantity: 2 }] },
        output: simulation,
        error: null,
        durationMs: 10,
      },
      {
        type: "store-call",
        method: "cartLink",
        input: { items: [{ itemId: "7", quantity: 2 }] },
        output: link,
        error: null,
        durationMs: 10,
      },
    ]);
  });

  it("records a failed call with its error and rethrows it", async () => {
    const events: ConversationEvent[] = [];
    const logged = loggedStore(store, (event) => events.push(event), ticking());
    const query = {
      postalCode: "1425",
      tipos: ["Yerba"],
      brands: [],
      sort: "discount:desc" as const,
      limit: 5,
    };

    await assert.rejects(logged.findCandidates(query, signal), /Carrefour answered 500/);

    assert.deepEqual(events, [
      {
        type: "store-call",
        method: "findCandidates",
        input: query,
        output: null,
        error: "Carrefour answered 500",
        durationMs: 10,
      },
    ]);
  });
});

describe("loggedSteps", () => {
  it("records each step started and done with its duration", () => {
    const events: ConversationEvent[] = [];
    const onStep = loggedSteps((event) => events.push(event), ticking());

    onStep({ status: "started", step: { kind: "understand-order" } });
    onStep({ status: "started", step: { kind: "choose-products", original: "yerba" } });
    onStep({ status: "done", step: { kind: "choose-products", original: "yerba" } });
    onStep({ status: "done", step: { kind: "understand-order" } });

    assert.deepEqual(events, [
      { type: "step-started", step: { kind: "understand-order" } },
      { type: "step-started", step: { kind: "choose-products", original: "yerba" } },
      { type: "step-done", step: { kind: "choose-products", original: "yerba" }, durationMs: 10 },
      { type: "step-done", step: { kind: "understand-order" }, durationMs: 30 },
    ]);
  });
});

describe("loggedTurn", () => {
  const turn: Turn = {
    state: { stage: "order", postalCode: "1425" },
    reply: { kind: "ask", text: "¿Qué necesitás del súper?" },
  };

  it("records the Owner's message, the reply and a completed outcome", async () => {
    const events: ConversationEvent[] = [];

    const result = await loggedTurn(
      (event) => events.push(event),
      "1425",
      signal,
      () => Promise.resolve(turn),
      ticking(),
    );

    assert.equal(result, turn);
    assert.deepEqual(events, [
      { type: "owner-message", text: "1425" },
      { type: "assistant-reply", reply: turn.reply },
      { type: "turn-ended", outcome: "completed", error: null, durationMs: 10 },
    ]);
  });

  it("ends a failed turn with the error the Owner is shown", async () => {
    const events: ConversationEvent[] = [];

    await assert.rejects(
      loggedTurn(
        (event) => events.push(event),
        "leche",
        signal,
        () => Promise.reject(new Error("Claude Code session for split-order exited with 1")),
        ticking(),
      ),
      /exited with 1/,
    );

    assert.deepEqual(events, [
      { type: "owner-message", text: "leche" },
      {
        type: "assistant-reply",
        reply: { kind: "error", message: "Claude Code session for split-order exited with 1" },
      },
      {
        type: "turn-ended",
        outcome: "failed",
        error: "Claude Code session for split-order exited with 1",
        durationMs: 10,
      },
    ]);
  });

  it("ends an aborted turn with no reply", async () => {
    const events: ConversationEvent[] = [];
    const controller = new AbortController();

    await assert.rejects(
      loggedTurn(
        (event) => events.push(event),
        "leche",
        controller.signal,
        () => {
          controller.abort(new Error("The Owner closed the tab"));
          return Promise.reject(controller.signal.reason as Error);
        },
        ticking(),
      ),
      /closed the tab/,
    );

    assert.deepEqual(events, [
      { type: "owner-message", text: "leche" },
      { type: "turn-ended", outcome: "aborted", error: "The Owner closed the tab", durationMs: 10 },
    ]);
  });
});

describe("messageOf", () => {
  it("names an error that has no message", () => {
    assert.equal(messageOf(new DOMException("", "AbortError")), "AbortError");
    assert.equal(messageOf(new Error("Carrefour answered 500")), "Carrefour answered 500");
    assert.equal(messageOf("timeout"), "timeout");
  });
});
