# 02: The agent reports its session's duration, cost and tokens to the Turn Log

**What to build:** when the agent's Claude Code session returns a result, the Turn Log entry's `agent.reported` holds the duration Claude Code reports, the cost and the input, output, cache-read and cache-write tokens, so the gap between the agent's wall time and its reported duration shows the session's start-up. When a tool ends the turn the session is aborted and returns nothing, and `reported` stays `null`. Fields the provider does not give stay `null`. See the spec, `../spec.md`, the `ChatAgent` decision under "Where the timeline is built", and its "Further Notes".

**Blocked by:** 01 (Every turn of the Chat writes its Turn Log line).

**Status:** resolved

- [x] The `ChatAgent` port has a way to report its session, used by `takeAgentTurn` to fill `agent.reported`; `ai` stays out of core (ADR 0006).
- [x] The agent adapter reports the provider metadata's `costUsd` and `durationMs` and the result's token usage, and reports nothing when a tool ended the turn. Every setting it passes the provider is unchanged.
- [x] Check in `node_modules` which usage fields the provider fills, including cache tokens, and record what was found under `## Comments` and in `docs/references/claude-code-provider.md`.
- [x] Tests: the agent adapter with a fake model whose result carries provider metadata and usage reports them, and reports nothing when a tool ends the turn; `takeAgentTurn` with a fake agent that reports puts the numbers in `reported`.
- [x] `docs/LLM.md` says where the agent's timing and cost are recorded.
- [x] One turn sent through the running app has `reported` filled; record its wall time and reported duration under `## Comments`.
- [x] `pnpm check` exits 0.

## Comments

- Built (2026-10-17). The `ChatAgent` port gained `reportSession(report)` on `AgentTurn` (`src/core/agent-chat/agent.ts`), typed with `AgentSessionReport` from `turn-log.ts`, so core never imports `ai`. `takeAgentTurn` passes a callback that stores the report and writes it as `agent.reported`; an agent that never calls it leaves `reported` `null`, so the eval runner and every fake keep working unchanged.
- The adapter (`src/adapters/agent/claude-code-agent.ts`) calls `reportSession(sessionReport(result.providerMetadata, result.totalUsage))` right after `agent.generate` returns; when a tool ended the turn the abort lands in the `catch` and nothing is reported. A value that is not a finite non-negative number becomes `null`. No provider setting changed (the existing settings tests still pass).
- Field mapping: `durationMs` and `costUsd` from `providerMetadata["claude-code"]`; `inputTokens` is `totalUsage.inputTokenDetails.noCacheTokens` (Claude Code's `input_tokens`, so the four token fields do not overlap), `outputTokens` is `totalUsage.outputTokens`, `cacheReadTokens` and `cacheWriteTokens` are `inputTokenDetails.cacheReadTokens` and `cacheWriteTokens`.
- What the provider fills (read in `node_modules/ai-sdk-provider-claude-code/dist/index.js`, 4.3.3): on the `result` message it sets `costUsd = total_cost_usd`, `durationMs = duration_ms` and `usage = convertClaudeCodeUsage(message.usage)`, which maps `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` and `output_tokens`, defaulting a missing cache field to `0` (so `0` may mean "not reported"); `outputTokens.text` and `reasoning` stay unset. Recorded in `docs/references/claude-code-provider.md` under "What a session reports".
- Live check through the `next dev` server already running on port 3000 (the same one used in ticket 01, not started here, left running): "gracias, ¿en qué zonas entregan?" got a text reply and this Turn Log line, with an agent wall time of 2,589 ms (`startMs` 0.26 to `endMs` 2589.24) and a reported duration of 2,388 ms, so about 0.2 s of session start-up:

```json
{"ownerText":"gracias, ¿en qué zonas entregan?","durationMs":2589.4653749996796,"outcome":"replied","agent":{"startMs":0.26049999985843897,"endMs":2589.2434580000117,"reported":{"durationMs":2388,"costUsd":0.08042700000000001,"inputTokens":2,"outputTokens":102,"cacheReadTokens":10535,"cacheWriteTokens":9534}}}
```

- `docs/LLM.md` and `ARCHITECTURE.md` say where the agent's timing and cost are recorded. `pnpm check` exits 0.
