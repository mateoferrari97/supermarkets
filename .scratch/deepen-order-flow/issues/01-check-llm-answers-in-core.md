# 01: Check LLM answers in core (call 2 and read-reply)

**What to build:** Core gets one function per LLM task that calls the port and checks the answer against its input: call 2 (`fitProducts`) and `read-reply`. Every adapter, every test fake and the eval set's answer cases go through the same rules, so a second LLM adapter gets them for free and a fake cannot return an answer the real adapter would reject. The Owner sees no change; an invalid LLM answer still ends the turn with an error.

Rules checked:

- Call 2: Fits and Alternatives are among the Matches, a question exactly when nothing fits, no Alternatives while something fits, at most five Alternatives.
- `read-reply`: entries only for listed Items, one per Item, a choice only for an asked Item and within its Alternatives, a question on an unanswered Item in the cart. Every asked Item left out is added as "unanswered", and entries are sorted by Item number, so the output always has one entry per listed asked Item.

A broken rule throws an error naming the task, the Item and the rule, so the Conversation Log and the eval report still explain a bad answer. The Claude Code adapter keeps only prompts, zod output schemas and line parsing (ADR 0006).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Core exposes a checked call for `fitProducts` and one for `read-reply`; `matchItems`, `takeTurn` and the eval set's answer cases call these, never the port directly
- [ ] The read-reply check fills an "unanswered" entry for every asked Item left out and sorts entries by Item number
- [ ] The core fallbacks (`entry ?? unanswered`, the slice to five Alternatives) are removed
- [ ] Rule checks are removed from the Claude Code adapter; its tests cover prompts, schemas, parsing and the process only
- [ ] Pure tests in core, one per rule, plus a test that read-reply fills unanswered entries; the rule tests from the adapter test file move here
- [ ] Each error message names the task, the Item and the broken rule
- [ ] Test fakes of the LLM pass through the same checks
- [ ] `docs/LLM.md` says the checks run in core, not in the adapter
- [ ] `pnpm check` is green
