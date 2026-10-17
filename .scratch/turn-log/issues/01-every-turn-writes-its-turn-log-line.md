# 01: Every turn of the Chat writes its Turn Log line with the agent's span and each tool call

**What to build:** each turn the Owner sends in the chat appends one line to the Turn Log in the Chat's data folder: when it started, the Owner's text, its total duration, how it ended (`replied`, `ended-by-tool`, `failed` or `aborted`) and its error, the agent's span (`startMs`, `endMs`, with `reported` always `null` for now), and one `tool` event per tool call with its name, start, end, `ok` and error. Times inside the turn are milliseconds from its start on a monotonic clock. Writing the line never fails or delays the turn. After this ticket the operator can send a message at http://localhost:3000 and read where the turn's time went between the agent and its tools with `jq`. See the spec, `../spec.md`, under "The Turn Log", "Where the timeline is built" and "Never breaking a turn".

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Turn Log is in `GLOSSARY.md`, next to Chat, with the definition in the spec.
- [x] The Turn Log entry has a schema in core with the shape in the spec, including the `step` and `llm-call` event kinds that tickets 02 and 03 fill; the files adapter has a saver that appends one line per entry and a loader that parses every line and names a bad one by number, both wired in compose.
- [x] `takeAgentTurn` receives a clock and the Turn Log saver, records the agent's span around its reply, wraps every tool it hands the agent to record a `tool` event, and saves the entry after the Assistant's message.
- [x] A failed turn saves its entry with outcome `failed` and the error, then fails as today; an aborted turn saves outcome `aborted`; a turn ended by a tool saves `ended-by-tool`.
- [x] A saver that throws does not change the reply or the saved Chat, and the failure is written to the server's error output.
- [x] The route passes the real clock and saver; the eval runner keeps working without writing a Turn Log.
- [x] Tests through `takeAgentTurn` with fakes and a fake clock cover every outcome, a failing tool, two tool calls that overlap and a throwing saver; the files adapter tests cover the saver and a bad line.
- [x] `ARCHITECTURE.md` lists the file in the data folders table and the Turn Log in the order flow.
- [x] One turn sent through the running app appends one valid line; record it under `## Comments`.
- [x] `pnpm check` exits 0.

## Comments

- Built (2026-10-17). `src/core/agent-chat/turn-log.ts` holds `turnLogEntrySchema` with the `tool`, `step` and `llm-call` event kinds and `agentSessionReportSchema` for `reported`. `takeAgentTurn` now takes `clock` and `saveTurnLog`, wraps every tool of the turn to record a `tool` event (start, end, `ok`, error; events are pushed in the order the calls finish, so overlapping calls keep their own `startMs`), records the agent's span around `agent.reply` (in a `finally`, so a failed or aborted reply still has its end), and saves the entry after the Assistant's message. A failed turn saves `failed` with the error message; a turn whose signal is aborted saves `aborted` with the abort's message; then the error is rethrown as before. `reported` is always `null` (ticket 02 fills it).
- `takeAgentTurn` swallows a throwing saver so the turn never changes; the saver the route uses, `appendTurnLogEntry` in `src/compose.ts`, catches the files adapter's error and writes `Could not write the Turn Log: …` to `console.error` (the server's error output). Core never prints.
- Files adapter: `appendTurnLogEntry` validates with the schema and appends one line to `.data/chat/turn-log.jsonl`; `loadTurnLog` returns `{ found, entries, errors }`, keeping the valid entries and naming each bad line by number, so ticket 04 can skip bad lines and say when there is no Turn Log.
- The eval runner passes `performance.now()` and a saver that does nothing, so `pnpm agent:eval` writes no Turn Log.
- Times are not rounded: they are `performance.now()` differences with fractions of a millisecond.
- Live check: a `next dev` server from this repo was already running on port 3000 (started at 11:06, not by this ticket), so the turn went through it after hot reload and it was left running. `curl -X POST http://localhost:3000/api/agent -d '{"text":"hola, ¿qué podés hacer?"}'` answered with a text reply in about 3.9 s and `.data/chat/turn-log.jsonl` got one line, which `loadTurnLog` reads with no errors:

```json
{"startedAt":"2026-10-17T16:11:14.491Z","ownerText":"hola, ¿qué podés hacer?","durationMs":3659.430083000101,"outcome":"replied","error":null,"agent":{"startMs":0.3082910003140569,"endMs":3658.847666000016,"reported":null},"events":[]}
```

- No turn with a tool call was sent through the app, to keep test Orders out of the Owner's `orders.json`; `tool` events are covered by the `takeAgentTurn` tests (ended by a tool, a failing tool, two overlapping calls).
- `pnpm check` exits 0 (433 tests).
