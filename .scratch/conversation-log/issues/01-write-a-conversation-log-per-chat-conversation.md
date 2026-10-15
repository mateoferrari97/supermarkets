# 01: Write a Conversation Log per chat conversation

**What to build:** Every conversation the Owner has in the chat (`pnpm dev`) is written, as it happens, to its own Conversation Log (see `GLOSSARY.md`) under `.data/conversations/`, so that mistakes can be reviewed later: what the Owner wrote, what the Assistant replied, every step with its duration, every call to the LLM and to the Online Store with its full input and output, and how each turn ended.

**Blocked by:** None (can start immediately)

**Status:** resolved

## Decisions (agreed with the Owner)

- Level of detail: Owner messages, Assistant replies (questions, cart, errors), every step with its duration, every LLM call with task, full input, raw output, cost and duration, and every Online Store call (delivery check, candidate search, simulation, and any other port method) with its input and output.
- One file per conversation: `.data/conversations/<local date and time the conversation started, YYYY-MM-DD-HHmmss>-<sessionId>.jsonl`. JSONL, one event per line, each with an ISO timestamp and a `type`.
- Not committed: `.data/` is already ignored by git.
- Failed and aborted turns are logged too, each turn ending with an outcome `completed`, `failed` or `aborted` and the error message when there is one.
- No way to flag a mistake from the chat yet; the Owner points at a conversation by date and time.
- The Conversation Log is never shown in the chat.

## Constraints

- Respect the layer rule of ADR 0006 as enforced by ESLint; never `eslint-disable`. Paths and the `.data/` layout are known only to `src/adapters/files/`; `src/app/` gets the log through `compose`.
- Prefer recording at the port boundary (for example decorators of `Llm` and `OnlineStore` wired in `compose`) over threading logging through core use cases; the raw LLM output and input are only visible inside `adapters/claude-code`, so extend what its `onCall` reports rather than duplicating its process handling. `order:eval` must keep working.
- A failure to write the log never breaks the Owner's order: the turn goes on and the error is printed to the server console.
- No behaviour change to order resolution, product selection or the chat UI.

## Acceptance

- [x] A chat conversation produces one `.jsonl` file under `.data/conversations/` with the events above, in order, including at least one LLM call with input and raw output and one Online Store call with input and output.
- [x] A failed turn and an aborted turn each end with their outcome in the log.
- [x] The log writer in `adapters/files` and any decorator are tested with Vitest (temporary directories, fakes; no live calls).
- [x] `ARCHITECTURE.md` Data section lists `.data/conversations/` (what, who writes it, who validates it, not committed); the codemap mentions where the log is written.
- [x] One real conversation in the chat run end to end and its log file inspected, noted under Comments.
- [x] `pnpm check` exits 0.

## Comments

- **Real conversation.** Ran in the chat's route (`POST /api/turn` on the `pnpm dev` server at http://localhost:3000, driven with `curl`, so the events are the same the browser gets): postal code `1425`, then "una yerba playadito de 1 kg y dos leches enteras la serenisima, lo mas barato". The log `.data/conversations/2026-10-15-110230-a8954ac7-450a-4004-959b-8dd0f0a7d043.jsonl` has 33 events in order: `conversation-started` with commit `0cbc1a3`, two turns each with `owner-message`, `assistant-reply` and `turn-ended` `completed`; one `checkDelivery`, two `findCandidates`, four `simulate` and one `cartLink` store call with input and output; four LLM calls (`split-order`, two `resolve-item`, `translate-preference`) with input, raw output, cost and duration; seven steps with `durationMs`. It already shows a mistake to review: the yerba line came back empty ("No encontré ningún producto playadito 1 kg disponible.") and the log shows why: `findCandidates` returned only two 500 g Playadito yerbas.
- **Real aborted turn.** A second conversation cut by `curl --max-time 3` during "un kilo de azucar" ends with `turn-ended` `aborted`, error `ResponseAborted` (`.data/conversations/2026-10-15-110320-298c63b1-4008-4e21-b0f4-e4a8bd640282.jsonl`). The first try logged an empty error because Next's abort reason has no message, so `messageOf` falls back to the error's name. A real failed turn was not provoked; it is covered by `loggedTurn`'s test.
- **LLM input.** Agreed with the coordinator: each `llm-call` keeps the task, the model, the JSON sent on stdin and a SHA-256 of the full system prompt instead of the prompt itself (several KB per call with the Product Type tree), and `conversation-started` keeps the git HEAD commit (null outside a repo), so a reviewed case can be tied to the exact prompt and vocabulary.
- **Where it is recorded.** The event types, `loggedStore` (decorator of `OnlineStore`, every port method including `cartLink`), `loggedSteps` and `loggedTurn` live in `src/core/conversation-log/`. The LLM calls come from the Claude Code adapter's `onCall`, which now also reports model, prompt hash, input and raw output; `pnpm order:eval` still reads only `costUsd`. Since `onCall` is per adapter instance, `openConversationLog` in `compose` gives each conversation its own `Llm` over the shared vocabulary. `onCall` still fires only when the session returns a result; a `claude` process that exits non-zero or is killed by an abort writes no `llm-call`, and its error reaches the log through `turn-ended`.
- **Writing.** `openConversationLog` in `src/adapters/files/data-files.ts` appends one line per event with `appendFileSync`, adding the ISO `at`; any write error is printed with `console.error` and the turn goes on. The file name uses the local start time.
