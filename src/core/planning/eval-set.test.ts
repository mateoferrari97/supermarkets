import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  examplePlanningMessages,
  planningEvalSetIds,
  validatePlanningEvalSet,
} from "./eval-set.ts";

const routeCase = (fields: Record<string, unknown> = {}) => ({
  id: "route-leche",
  message: "2 leches y pan",
  topic: "order",
  ...fields,
});

const planCase = (fields: Record<string, unknown> = {}) => ({
  id: "plan-lasagna",
  message: "quiero hacer lasaña para 4",
  covers: ["recipe", "event", "weekly-menu", "gift", "advice", "constraints", "idea-in-cart"],
  plan: true,
  ...fields,
});

const offTopic = routeCase({ id: "route-boca", message: "¿juega Boca hoy?", topic: "off-topic" });

const setOf = (routes: unknown[], plans: unknown[]) => ({ routes, plans });

describe("validatePlanningEvalSet", () => {
  it("accepts a valid set", () => {
    assert.deepEqual(
      validatePlanningEvalSet(
        setOf(
          [routeCase(), offTopic],
          [
            planCase({
              budget: 50000,
              expectedToFail: "reason",
              quantities: [
                { label: "carne", productIds: ["1", "2"], unit: "g", min: 4000, max: 5000 },
              ],
              forbiddenProductIds: ["3"],
              forbiddenWords: ["trigo"],
              allowedWords: ["sin tacc"],
              idea: { headings: ["pasos"], min: 1 },
            }),
          ],
        ),
        [],
      ),
      [],
    );
  });

  it("reports schema errors with their path", () => {
    assert.deepEqual(validatePlanningEvalSet(setOf([routeCase({ topic: "chat" })], []), []), [
      'planning eval set routes.0.topic: Invalid option: expected one of "order"|"plan"|"off-topic"',
    ]);
    assert.deepEqual(
      validatePlanningEvalSet(
        setOf(
          [offTopic],
          [
            planCase({
              quantities: [{ label: "carne", productIds: [], unit: "g", min: 1, max: 2 }],
            }),
          ],
        ),
        [],
      ),
      [
        "planning eval set plans.0.quantities.0.productIds: Too small: expected array to have >=1 items",
      ],
    );
  });

  it("reports repeated ids across routing and plan cases", () => {
    assert.deepEqual(
      validatePlanningEvalSet(setOf([offTopic], [planCase({ id: "route-boca" })]), []),
      ['plan case "route-boca" id is used more than once'],
    );
  });

  it("reports a quantity range whose minimum is above its maximum", () => {
    assert.deepEqual(
      validatePlanningEvalSet(
        setOf(
          [offTopic],
          [
            planCase({
              quantities: [{ label: "carne", productIds: ["1"], unit: "g", min: 5, max: 4 }],
            }),
          ],
        ),
        [],
      ),
      ['plan case "plan-lasagna" range "carne" has a minimum above its maximum'],
    );
  });

  it("reports scoring a Plan in a case that expects none", () => {
    assert.deepEqual(
      validatePlanningEvalSet(
        setOf([offTopic], [planCase({ plan: false, budget: 1000, idea: { min: 1 } })]),
        [],
      ),
      ['plan case "plan-lasagna" expects no Plan but scores one'],
    );
  });

  it("reports a case of the spec no case covers", () => {
    assert.deepEqual(
      validatePlanningEvalSet(setOf([routeCase()], [planCase({ covers: ["recipe"] })]), []),
      [
        "no case covers event",
        "no case covers weekly-menu",
        "no case covers gift",
        "no case covers advice",
        "no case covers constraints",
        "no case covers idea-in-cart",
        "no case covers off-topic",
      ],
    );
  });

  it("reports a message that is an example of the prompts", () => {
    assert.deepEqual(
      validatePlanningEvalSet(setOf([offTopic, routeCase()], [planCase()]), [" 2 leches  Y pan"]),
      ['routing case "route-leche" message is an example message of the prompts'],
    );
  });
});

describe("examplePlanningMessages", () => {
  it("reads the example messages and first Owner messages of a prompt", () => {
    assert.deepEqual(
      examplePlanningMessages(
        "<message>\nleche y pan\n</message>\n<conversation>\n<owner>lasaña para 4</owner>\n<planner>ok</planner>\n<owner>dale</owner>\n</conversation>",
      ),
      ["leche y pan", "lasaña para 4"],
    );
  });
});

describe("planningEvalSetIds", () => {
  it("lists the productIds of each plan case once", () => {
    assert.deepEqual(
      planningEvalSetIds({
        routes: [],
        plans: [
          {
            ...planCase(),
            plan: true,
            covers: ["recipe"],
            quantities: [{ label: "carne", productIds: ["1", "2"], unit: "g", min: 1, max: 2 }],
            forbiddenProductIds: ["2", "3"],
          },
        ],
      }),
      [{ caseId: "plan-lasagna", ids: ["1", "2", "3"] }],
    );
  });
});
