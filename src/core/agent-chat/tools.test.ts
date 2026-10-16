import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { Delivery, OnlineStore } from "../product-selection/online-store.ts";
import type { Profile } from "./profile.ts";
import { agentTools, renderProfile, updateProfile } from "./tools.ts";

function fakeStore(deliveries: Record<string, Delivery>) {
  const asked: string[] = [];
  const store: OnlineStore = {
    checkDelivery: (postalCode) => {
      asked.push(postalCode);
      return Promise.resolve(deliveries[postalCode] ?? "postal-code-rejected");
    },
    simulate: () => Promise.reject(new Error("not used")),
    cartLink: () => {
      throw new Error("not used");
    },
  };
  return { store, asked };
}

const signal = new AbortController().signal;

describe("updateProfile", () => {
  it("checks the postal code with the Online Store and saves it", async () => {
    const { store, asked } = fakeStore({ "1425": "delivers" });
    const saved: Profile[] = [];
    const output = await updateProfile(
      { postalCode: " 1425 " },
      { store, saveProfile: (profile) => saved.push(profile) },
      signal,
    );
    assert.deepEqual(output, { kind: "saved", postalCode: "1425" });
    assert.deepEqual(asked, ["1425"]);
    assert.deepEqual(saved, [{ postalCode: "1425" }]);
  });

  it("saves a new postal code over the old one", async () => {
    const { store } = fakeStore({ "1425": "delivers", "5000": "delivers" });
    const saved: Profile[] = [];
    const dependencies = { store, saveProfile: (profile: Profile) => saved.push(profile) };
    await updateProfile({ postalCode: "1425" }, dependencies, signal);
    await updateProfile({ postalCode: "5000" }, dependencies, signal);
    assert.deepEqual(saved.at(-1), { postalCode: "5000" });
  });

  it("refuses a postal code no Branch serves and saves nothing", async () => {
    const { store } = fakeStore({ "9999": "does-not-deliver", "0001": "postal-code-rejected" });
    const saved: Profile[] = [];
    const dependencies = { store, saveProfile: (profile: Profile) => saved.push(profile) };
    assert.deepEqual(await updateProfile({ postalCode: "9999" }, dependencies, signal), {
      kind: "refused",
      postalCode: "9999",
      reason: "not-delivered",
    });
    assert.deepEqual(await updateProfile({ postalCode: "0001" }, dependencies, signal), {
      kind: "refused",
      postalCode: "0001",
      reason: "not-delivered",
    });
    assert.deepEqual(saved, []);
  });

  it("refuses text that is not a four-digit postal code without asking the store", async () => {
    const { store, asked } = fakeStore({});
    const saved: Profile[] = [];
    const output = await updateProfile(
      { postalCode: "C1425" },
      { store, saveProfile: (profile) => saved.push(profile) },
      signal,
    );
    assert.deepEqual(output, { kind: "refused", postalCode: "C1425", reason: "not-a-postal-code" });
    assert.deepEqual(asked, []);
    assert.deepEqual(saved, []);
  });
});

describe("agentTools", () => {
  it("exposes updateProfile and validates its input", async () => {
    const { store } = fakeStore({ "1425": "delivers" });
    const saved: Profile[] = [];
    const tools = agentTools({ store, saveProfile: (profile) => saved.push(profile) });
    assert.deepEqual(Object.keys(tools), ["updateProfile"]);
    const output = await tools.updateProfile?.execute({ postalCode: "1425" }, signal);
    assert.deepEqual(output, { kind: "saved", postalCode: "1425" });
    await assert.rejects(
      tools.updateProfile?.execute({ postalCode: 1425 }, signal) ?? Promise.resolve(),
    );
  });
});

describe("renderProfile", () => {
  it("says the postal code when known and that it is unknown otherwise", () => {
    assert.match(renderProfile({ postalCode: "1425" }), /postalCode: 1425/);
    assert.match(renderProfile(null), /has not told their postal code/);
  });
});
