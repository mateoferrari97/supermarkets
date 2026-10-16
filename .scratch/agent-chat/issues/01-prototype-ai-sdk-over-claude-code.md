# 01: Prototype AI SDK over a local Claude Code session

**What to build:** A throwaway prototype, outside the repo's source, that confirms ADR 0014's runtime before anything is built: `ToolLoopAgent` from AI SDK 7 with `ai-sdk-provider-claude-code` on this machine's Claude Code login, two fake tools passed through `createAiSdkMcpServer` (a `resolveItem` returning picked or choose, an `askQuestions` that ends the turn) and a minimal `useChat` page. It answers: how a tool result and the end of a turn reach the page, how messages are stored and replayed on the next turn, time and cost of a turn with two tool calls, and how the app layer may import AI SDK under the import rule of ADR 0006.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] An Owner message, a tool call, a round shown and a reply that resumes it run end to end
- [x] Findings are in this ticket's Comments, with commands and numbers
- [x] What was learned about the provider is recorded in a reference doc
- [x] Nothing is added to the repo's source or dependencies

## Comments

2026-10-16 (worker): built the prototype outside the repo, in the session scratchpad (`ai` 7.0.143, `ai-sdk-provider-claude-code` 4.3.3, `@ai-sdk/react` 4.0.147, `next` 16.4.0, installed there with npm). Nothing was added to `src/`, `package.json` or the lockfile; the only repo changes are `docs/references/claude-code-provider.md`, its link in `docs/references/README.md` and this ticket. Full findings are in that reference; the numbers below are single runs on this machine (Claude Code 2.1.301, model `sonnet`).

- Run 1, `agent.generate("necesito leche y yogur")` with two fake tools through `createAiSdkMcpServer`, default session settings: 9.8 s, 1 step holding 2 `resolveItem` calls and 1 `askQuestions`, 257,109 input tokens, 0.383 USD (cold cache).
- Run 2, same with `strictMcpConfig: true`, `settingSources: []`, `tools: []`, `persistSession: false` and a string `systemPrompt`: 5,275 input tokens, 0.0058 to 0.0059 USD, 7.2 and 7.8 s (two runs). Default settings warm: 0.0084 USD, 6.3 s.
- The model kept writing after `askQuestions` and contradicted the round. Aborting the agent's `AbortSignal` from inside `askQuestions.execute` (after 30 ms) ended the stream cleanly at 5.8 s with parts `tool-output-available` then `abort`, no exception, and `onFinish` got `isAborted: true` with all parts.
- Route `POST /api/chat` (`createAgentUIStreamResponse`, server loads the stored list, client sends only the last message), run with curl: turn 1 returned the two tool calls and the round in 6.4 s (`[chat] finish { ms: 6186, isAborted: true, n: 2 }`); turn 2, "1: yogur marca B", returned the text "Listo: Leche entera La Serenísima 1 L y yogur marca B agregados a tu pedido." in 3.6 s, so the replayed history carried the leche picked in turn 1.
- Page `useChat`, checked by hand in Chrome at localhost: sent "necesito leche y yogur", the page showed the two tool parts and the round with three buttons (recommended starred) and status `ready`; clicked "yogur marca B", the page showed "Leche entera La Serenísima 1 L y yogur marca B agregados al pedido."; after a reload the whole Chat, round included, came back from the stored list.
- Stored tool parts carry `callProviderMetadata` and `resultProviderMetadata` with the raw MCP strings, and the assistant message id was empty until the server sets one (`generateMessageId`).
- Import rule: `eslint.config.js` already lets `src/app/**` import `ai` and `@ai-sdk/react` (it only forbids adapters), and `src/core/` imports only core and zod. Suggested: the agent in `src/adapters/`, a port in core, wired in `src/compose.ts`; the route and page in `src/app/` use `ai` only for the UI message stream and `useChat`. This is a recommendation for ticket 02, not a change to ADR 0006.
- Open: the Claude subscription question, two turns at once, a turn aborted before `askQuestions`, and time and cost with real tools, the real prompt and 40 messages.
