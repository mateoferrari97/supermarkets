import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { findPaymentCard, paymentCardTableSchema, validatePaymentCards } from "./payment-cards.ts";

const table = {
  cards: [
    {
      names: ["Tarjeta Carrefour Mastercard", "Tarjeta Carrefour"],
      paymentSystem: "502",
      bin: "507858",
    },
    { names: ["Prepaga BSF"], paymentSystem: "505", bin: null },
  ],
};

describe("payment cards", () => {
  it("turns a name the Owner may write into the payment system and BIN", () => {
    assert.deepEqual(findPaymentCard(table, "tarjeta carrefour"), {
      paymentSystem: "502",
      bin: "507858",
    });
    assert.deepEqual(findPaymentCard(table, "Prepaga BSF"), { paymentSystem: "505", bin: null });
    assert.equal(findPaymentCard(table, "Visa Galicia"), null);
  });

  it("rejects a table with a malformed BIN or a name used twice", () => {
    assert.deepEqual(validatePaymentCards(table), []);
    assert.match(
      validatePaymentCards({ cards: [{ names: ["X"], paymentSystem: "502", bin: "5078" }] })[0]!,
      /cards\.0\.bin/,
    );
    assert.deepEqual(
      validatePaymentCards({
        cards: [
          { names: ["Tarjeta Carrefour"], paymentSystem: "502", bin: null },
          { names: ["tarjeta  carrefour"], paymentSystem: "505", bin: null },
        ],
      }),
      ['payment card name "tarjeta  carrefour" is used more than once'],
    );
  });

  it("parses the committed table", () => {
    const committed: unknown = JSON.parse(
      readFileSync(
        new URL("../../vocabulary/carrefour-payment-cards.json", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(paymentCardTableSchema.safeParse(committed).success, true);
  });
});
