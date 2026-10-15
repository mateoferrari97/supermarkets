# 01: Write a Conversation Log per chat conversation

**What to build:** Every conversation the Owner has in the chat (`pnpm dev`) is written, as it happens, to its own Conversation Log (see `GLOSSARY.md`) under `.data/conversations/`, so that mistakes can be reviewed later: what the Owner wrote, what the Assistant replied, every step with its duration, every call to the LLM and to the Online Store with its full input and output, and how each turn ended.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

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

- [ ] A chat conversation produces one `.jsonl` file under `.data/conversations/` with the events above, in order, including at least one LLM call with input and raw output and one Online Store call with input and output.
- [ ] A failed turn and an aborted turn each end with their outcome in the log.
- [ ] The log writer in `adapters/files` and any decorator are tested with Vitest (temporary directories, fakes; no live calls).
- [ ] `ARCHITECTURE.md` Data section lists `.data/conversations/` (what, who writes it, who validates it, not committed); the codemap mentions where the log is written.
- [ ] One real conversation in the chat run end to end and its log file inspected, noted under Comments.
- [ ] `pnpm check` exits 0.
