# 03: The postal code is told once and kept in the Profile

**What to build:** In the agent chat, the Owner says their postal code once and the agent saves it in the Profile with `updateProfile`, which checks it against the Online Store first, and says so. It is never asked again; saying a new one replaces it; a postal code no Branch serves is refused. Each turn the agent gets the Profile.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] A known postal code is not asked again after a reload or a restart
- [x] A new postal code replaces the old one; an unserved one is refused and not saved (tests with a fake Online Store)
- [x] `docs/LLM.md` describes the agent, its prompt and its first tool
- [x] `pnpm check` is green

## Comments

2026-10-16 (worker): built.

- Core: `src/core/agent-chat/profile.ts` (`profileSchema`: `{ postalCode }`, four digits), `tools.ts` (`AgentTool`, `defineTool`, `updateProfile`, `agentTools`, `renderProfile`). `updateProfile` refuses a malformed code (`not-a-postal-code`, store not asked), asks `OnlineStore.checkDelivery`, refuses anything but `delivers` (`not-delivered`, nothing saved) and otherwise saves and answers `saved`. The `ChatAgent` port now takes `{ messages, profile, tools }`; `takeAgentTurn` passes them.
- Adapter: `claude-code-agent.ts` appends the `<profile>` block to `prompts/agent/system.md` each turn and puts the tools in an in-process MCP server `chat` (`createAiSdkMcpServer`), allowing only `mcp__chat__<tool>`.
- Storage: `loadProfile` and `saveProfile` in `src/adapters/files/data-files.ts` (`.data/chat/profile.json`, zod), exported from `src/compose.ts` with `createAgentTools()`; the `POST /api/agent` route loads the Profile every turn and returns 500 with the errors if the file is invalid.
- Prompt: `prompts/agent/system.md` has a section on the Profile and the postal code.
- Docs: `ARCHITECTURE.md`, `docs/LLM.md` (the agent, its prompt and `updateProfile`), `docs/TESTING.md`, `docs/references/claude-code-provider.md`, Commands in `CLAUDE.md`.
- Tests: `tools.test.ts` (saved, replaced by a new code, refused when not delivered or `postal-code-rejected` with nothing saved, malformed code without asking the store, input validation, `renderProfile`), `take-agent-turn.test.ts` (Profile and tools reach the agent), `claude-code-agent.test.ts` (Profile in the system prompt, tools reach the model factory, session allows only them), `data-files.test.ts` (Profile round trip across instances, last one wins, invalid save refused, invalid file named).

Checked by hand against the dev server already running on localhost:3000 (not mine, not restarted; Next hot-reloaded the change), real Claude Code session and real Carrefour:

- `POST /api/agent {"text":"Hola, mi código postal es 1425"}` (5.3 s): "¡Listo! Guardé tu código postal 1425."; `.data/chat/profile.json` = `{"postalCode":"1425"}`.
- "¿Cuál es mi código postal?" (2.8 s): "Tu código postal guardado es 1425." (no tool call, no question).
- "Ahora quiero que sea 5000" (2.9 s): profile became `{"postalCode":"5000"}`.
- "Mi código postal es 14" (7.0 s): the agent said it is not valid, asked again and said 9999 was still saved; file unchanged.
- A fresh `tsx` process (not the server) read `{"postalCode":"9999"}` through `loadProfile` and, with the real agent, answered "Sí, tu código postal guardado es 9999." to "¿Ya sabés mi código postal?"; `curl localhost:3000/agent` rendered the whole Chat. This supports "after a reload or a restart" (state only on disk, read every turn), but I did not stop and start `pnpm dev` itself nor click in a browser.
- Finding: live Carrefour `checkDelivery` returned `delivers` for 9999, 0001, 0000, 4400 and 9410 (any four digits with sellers), and `postal-code-rejected` only for malformed codes (`abc`, `123`). So 9999 was saved live. The refusal of an unserved code (`does-not-deliver` and `postal-code-rejected`) is covered only by tests with the fake store. Noted in `docs/LLM.md`.
- `.data/chat/` test data was deleted afterwards.
- Open: the agent, when it refuses, relies on the prompt to say the old code stays; it is not scored until the eval set (ticket 10).

