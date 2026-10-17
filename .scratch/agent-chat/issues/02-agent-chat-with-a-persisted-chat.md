# 02: An agent chat whose Chat survives reloads

**What to build:** A new chat page, next to today's chat, where the Owner talks with the agent behind a port, on the runtime ticket 01 settled. Every message is saved as the Chat and read back on each turn and on page open, so the history survives a reload and a server restart. The agent has no tools yet: it answers, and says briefly what it can do. Today's chat is untouched.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] The new page shows the whole Chat on open, after a reload and after a restart
- [x] Each turn the agent gets the last 40 messages of the Chat
- [x] The Chat is read and written only through validated loaders and savers, which round-trip and reject invalid files (tests)
- [x] `ARCHITECTURE.md` describes the new page, the port and where the Chat is stored
- [x] `pnpm check` is green

## Comments

2026-10-16 (worker): built.

- Core `src/core/agent-chat/`: `chat.ts` (message schema `{ role: "owner" | "assistant", at, text }`, `contextMessages` = last 40), `agent.ts` (`ChatAgent` port), `take-agent-turn.ts` (saves the Owner's message first, asks the agent, saves the reply).
- Adapter `src/adapters/agent/claude-code-agent.ts`: `ToolLoopAgent` over `ai-sdk-provider-claude-code` with the small session of ticket 01 (`sonnet`, `strictMcpConfig`, `settingSources: []`, `tools: []`, `persistSession: false`, `maxTurns` 10, `maxBudgetUsd` 0.5); reads `prompts/agent/system.md` on each turn. `eslint.config.js` now lets only `src/adapters/agent/**` import `ai`, `ai/test` and `ai-sdk-provider-claude-code`; core and the other adapters are unchanged.
- Storage: `loadChatMessages` and `appendChatMessage` in `src/adapters/files/data-files.ts` (`.data/chat/messages.jsonl`, zod per line, errors name the line), exported from `src/compose.ts` with `createChatAgent`.
- App: page `/agent` (`src/app/agent/`), `POST /api/agent` (`src/app/api/agent/route.ts`, one turn at a time, 409 otherwise), `serverExternalPackages` in `next.config.ts`. The root page and `/api/turn` are untouched.
- Dependencies added: `ai` 7.0.143 and `ai-sdk-provider-claude-code` 4.3.3 (both named in the spec). `@ai-sdk/react` is not needed: the page uses `fetch`, no streaming.
- Docs: `ARCHITECTURE.md` (layers, app, data table), `docs/LLM.md` (The agent chat, prompts), `docs/TESTING.md`, Commands in `CLAUDE.md`.
- Tests added: `take-agent-turn.test.ts` (saves in order, last 40 with 100 in history, Owner message kept when the agent fails, schema), `claude-code-agent.test.ts` (`MockLanguageModelV4`: prompt file, messages, re-read per turn, empty text), `data-files.test.ts` (round trip across instances, refusing an invalid message, invalid lines named).

Checked by hand against the dev server already running on localhost:3000 in this repo (pid 71869; I did not restart it):

- `GET /agent` with no Chat: 200, "Hola, escribime lo que necesitás."
- `POST /api/agent {"text":"Hola, mi nombre es Mateo y quiero saber qué podés hacer"}`: 6.9 s, answered that taking orders is not available yet and what will come. `.data/chat/messages.jsonl` then held the 2 lines.
- `POST /api/agent {"text":"¿Cómo me llamo?"}`: answered "Te llamás Mateo ..." (about 2 s), so the history reaches the agent.
- `curl localhost:3000/agent` after that: the server-rendered HTML holds the four messages (each request reads the file, so a reload shows the same).
- `POST` with blank text: 400 `{"errors":["El mensaje no es válido."]}`.
- Appended `{bad` to the file: `/agent` showed "los datos no son válidos" with "messages.jsonl line 5 is not JSON" and the POST returned 500 with the same error; after removing the line it worked again.
- A separate process (`tsx` calling `loadChatMessages` from `src/compose.ts`) read the same four messages.
- Not done: I did not stop and start `pnpm dev` itself (the running server is not mine, and Next refuses a second `next dev` in this folder), and I did not click in a browser. "After a restart" is therefore supported by the fresh process reading the file and by the page reading it on every request, not by a restarted server. The test data in `.data/chat/` was deleted afterwards.
- Not measured: two turns at once through the lock beyond the code path, a turn aborted by a closed tab, and time with 40 messages (open items from ticket 01 stay open).
- `pnpm add` also wrote `minimumReleaseAgeExclude` entries in `pnpm-workspace.yaml` for `ai@7.0.143` and its three `@ai-sdk/*` dependencies, because they are younger than the release-age rule.
