import { z } from "zod";
import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import type { FitProductsLlm } from "../order-matching/match-items.ts";
import type { OnlineStore } from "../product-selection/online-store.ts";
import type { OrdersStore } from "./orders-store.ts";
import type { Profile } from "./profile.ts";
import { askQuestions, askQuestionsInput } from "./ask-questions.ts";
import { buildCart, buildCartInput } from "./build-cart.ts";
import { chooseAlternative, chooseAlternativeInput } from "./choose-alternative.ts";
import { reopenLastOrder, reopenLastOrderInput } from "./reopen-last-order.ts";
import { repeatOrder, repeatOrderInput } from "./repeat-order.ts";
import { proposeOrder, proposeOrderInput } from "./propose-order.ts";
import { resolveItem, resolveItemInput } from "./resolve-item.ts";
import { defineTool, type ToolsForTurn } from "./tool.ts";

export { defineTool, type AgentTool, type AgentTools, type ToolsForTurn } from "./tool.ts";

export const updateProfileInput = z.object({
  postalCode: z.string().describe("The four-digit postal code the Owner stated."),
});

export type UpdateProfileOutput =
  | { kind: "saved"; postalCode: string }
  | { kind: "refused"; postalCode: string; reason: "not-a-postal-code" | "not-delivered" };

export type ProfileDependencies = {
  store: OnlineStore;
  saveProfile: (profile: Profile) => void;
};

export async function updateProfile(
  input: z.infer<typeof updateProfileInput>,
  { store, saveProfile }: ProfileDependencies,
  signal: AbortSignal,
): Promise<UpdateProfileOutput> {
  const postalCode = input.postalCode.trim();
  if (!/^\d{4}$/.test(postalCode)) {
    return { kind: "refused", postalCode, reason: "not-a-postal-code" };
  }
  const delivery = await store.checkDelivery(postalCode, signal);
  if (delivery !== "delivers") return { kind: "refused", postalCode, reason: "not-delivered" };
  saveProfile({ postalCode });
  return { kind: "saved", postalCode };
}

export type AgentToolsDependencies = ProfileDependencies & {
  search: CatalogSearch;
  llm: FitProductsLlm;
  orders: OrdersStore;
  loadProfile: () => Profile | null;
  now: () => Date;
};

export const agentTools =
  (dependencies: AgentToolsDependencies): ToolsForTurn =>
  (outcome, messages = []) => ({
    updateProfile: defineTool(
      "Saves the Owner's postal code in the Profile after checking that the Online Store delivers there. Call it whenever the Owner states or changes their postal code. Returns saved, or refused with the reason.",
      updateProfileInput,
      (input, signal) => updateProfile(input, dependencies, signal),
    ),
    resolveItem: defineTool(
      "Finds the product to buy for one Item the Owner asked for, with the Branch's prices. Call it once per Item, in parallel for several Items, after the postal code is known. Returns picked with the product, quantity and price; choose with up to 3 options when nothing fits, which you put to the Owner with askQuestions; none when nothing fits and there are no options; or refused with the reason. The product is already chosen by code: never name any other. When the Owner asks for more options, call it again for the same Item with excludeProductIds.",
      resolveItemInput,
      (input, signal) => resolveItem(input, dependencies, signal),
    ),
    chooseAlternative: defineTool(
      "Records the option the Owner chose for an Item that resolveItem answered choose, and prices it in the Branch. Pass the ref and the productId of the option, or recommended true when the Owner accepts the recommended answers. Returns picked, unavailable when the Branch cannot sell it now, or refused with the reason.",
      chooseAlternativeInput,
      (input, signal) => chooseAlternative(input, { ...dependencies, messages }, signal),
    ),
    reopenLastOrder: defineTool(
      "Reopens the last closed Order so the Owner's Correction (replace, remove or add an Item after the cart link) goes into a new cart. Call it only when the Owner clearly corrects the Order whose link was just given. Then resolveItem for what is new, proposeOrder with the refs the Order should have now and buildCart with that proposal in the same turn, with no question. Returns reopened, or refused with the reason.",
      reopenLastOrderInput,
      () => reopenLastOrder({ orders: dependencies.orders }),
    ),
    repeatOrder: defineTool(
      "Starts a new Order from one of the past Orders in the <past-orders> block, with the same products and quantities priced in today's Branch. Call it when the Owner asks for the same as a past Order, or chooses to repeat it with an addition, and no Order is open. Returns repeated with each product picked or none when it is no longer available, or refused with the reason. Then resolveItem for anything new and proposeOrder with every ref.",
      repeatOrderInput,
      (input, signal) => repeatOrder(input, dependencies, signal),
    ),
    askQuestions: defineTool(
      "Asks the Owner every open question of this turn in a single round and ends the turn. Each question has its options and the one you recommend. Call it at most once per turn, after every resolveItem of the turn has answered. Write nothing after calling it.",
      askQuestionsInput,
      (input) => askQuestions(input, { orders: dependencies.orders, outcome }),
      true,
    ),
    proposeOrder: defineTool(
      "Shows the Owner the Order for confirmation and ends the turn, except for a reopened Order (a Correction), where the turn goes on so you call buildCart right after. Pass the ref of every resolveItem result to include. The Owner sees each product, quantity and price, and what was not found. Write nothing after calling it.",
      proposeOrderInput,
      (input) => proposeOrder(input, { orders: dependencies.orders, outcome }),
      true,
    ),
    buildCart: defineTool(
      "Builds the Carrefour cart for the latest proposal after the Owner answered it, closes the Order and ends the turn with the cart and its link. Pass the proposal id from the <order> block. Refused when the proposal is not the latest or the Owner has not answered it: never call it in the same turn as proposeOrder. Write nothing after calling it.",
      buildCartInput,
      (input, signal) => buildCart(input, { ...dependencies, outcome, messages }, signal),
      true,
    ),
  });

export function renderProfile(profile: Profile | null): string {
  return profile === null
    ? "<profile>\nThe Owner has not told their postal code yet.\n</profile>"
    : `<profile>\npostalCode: ${profile.postalCode}\n</profile>`;
}
