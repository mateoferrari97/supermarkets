import "server-only";
import { createConversationDependencies } from "../compose.ts";
import {
  NEW_CONVERSATION,
  type ConversationDependencies,
  type ConversationState,
} from "../core/order-conversation/take-turn.ts";

export const SESSION_IDLE_MS = 60 * 60 * 1000;

type Dependencies = Omit<ConversationDependencies, "signal">;

type Session = { state: ConversationState; working: boolean; expiry: NodeJS.Timeout | null };

type Held = { sessions: Map<string, Session>; dependencies: Dependencies | null };

const held = globalThis as typeof globalThis & { orderChat?: Held };
const store: Held = (held.orderChat ??= { sessions: new Map(), dependencies: null });

export type LoadedDependencies =
  { ok: true; value: Dependencies } | { ok: false; errors: string[] };

export function loadDependencies(): LoadedDependencies {
  if (store.dependencies) return { ok: true, value: store.dependencies };
  const loaded = createConversationDependencies();
  if (loaded.ok) store.dependencies = loaded.value;
  return loaded;
}

export type Claim =
  | { kind: "claimed"; sessionId: string; state: ConversationState; created: boolean }
  | { kind: "missing" }
  | { kind: "working" };

export function claimSession(sessionId: string | null): Claim {
  if (sessionId === null) {
    const id = crypto.randomUUID();
    store.sessions.set(id, { state: NEW_CONVERSATION, working: true, expiry: null });
    return { kind: "claimed", sessionId: id, state: NEW_CONVERSATION, created: true };
  }
  const session = store.sessions.get(sessionId);
  if (!session) return { kind: "missing" };
  if (session.working) return { kind: "working" };
  session.working = true;
  if (session.expiry) clearTimeout(session.expiry);
  session.expiry = null;
  return { kind: "claimed", sessionId, state: session.state, created: false };
}

export function releaseSession(sessionId: string, state: ConversationState): void {
  const session = store.sessions.get(sessionId);
  if (!session) return;
  session.state = state;
  session.working = false;
  session.expiry = setTimeout(() => store.sessions.delete(sessionId), SESSION_IDLE_MS);
  session.expiry.unref();
}

export function deleteSession(sessionId: string): void {
  const session = store.sessions.get(sessionId);
  if (session?.expiry) clearTimeout(session.expiry);
  store.sessions.delete(sessionId);
}
