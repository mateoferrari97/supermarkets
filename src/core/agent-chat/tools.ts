import { z } from "zod";
import type { OnlineStore } from "../product-selection/online-store.ts";
import type { Profile } from "./profile.ts";

export type AgentTool = {
  description: string;
  inputSchema: z.ZodObject;
  execute: (input: unknown, signal: AbortSignal) => Promise<unknown>;
};

export type AgentTools = Record<string, AgentTool>;

export function defineTool<Schema extends z.ZodObject, Output>(
  description: string,
  inputSchema: Schema,
  run: (input: z.infer<Schema>, signal: AbortSignal) => Promise<Output>,
): AgentTool {
  return {
    description,
    inputSchema,
    execute: async (input, signal) => run(inputSchema.parse(input), signal),
  };
}

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

export function agentTools(dependencies: ProfileDependencies): AgentTools {
  return {
    updateProfile: defineTool(
      "Saves the Owner's postal code in the Profile after checking that the Online Store delivers there. Call it whenever the Owner states or changes their postal code. Returns saved, or refused with the reason.",
      updateProfileInput,
      (input, signal) => updateProfile(input, dependencies, signal),
    ),
  };
}

export function renderProfile(profile: Profile | null): string {
  return profile === null
    ? "<profile>\nThe Owner has not told their postal code yet.\n</profile>"
    : `<profile>\npostalCode: ${profile.postalCode}\n</profile>`;
}
