# 10: Agent eval set

**What to build:** An eval set of scripted Owner messages over a given Chat, Profile and past Orders, scored by code on the tool calls (postal code not asked when known, `askQuestions` only after no Fit, `buildCart` only after a proposal, past Order used when asked) and on the products of the cart. A runner command uses real sessions with a runs option; a validator joins `pnpm check`.

**Blocked by:** 05, 06

**Status:** ready-for-agent

- [x] Cases cover the user stories of the spec
- [x] The validator is in `pnpm check` and the runner in the Commands of `CLAUDE.md`
- [x] `docs/LLM.md` and `docs/TESTING.md` describe the eval set
- [x] A full run is recorded in this ticket's Comments

## Comments

2026-10-16 (worker): built the agent eval set.

**Built**
- `evals/agent.json`: 15 cases, validated by `src/core/agent-chat/eval-set.ts` (zod; unique ids, every one of the 11 agent user stories covered, no turn that requires and forbids a tool, a cart expectation only when the last turn ends with a cart, and so on). Stories 3 (the page opens on the whole Chat), 13 to 16 (developer stories) are not agent behaviour and stay with their own tests; `docs/LLM.md#the-agent-eval-set` says so.
- `runAgentCase` (`eval-run.ts`) plays a case's Owner messages through the real `takeAgentTurn` over an in-memory Chat, Profile and Orders (never `.data/chat/`), with `snapshotStore` (`eval-store.ts`) as the `OnlineStore` (Catalog Snapshot prices and stock, delivers everywhere but `doesNotDeliver`, so no Carrefour call) and records every tool call. `scoreAgentRun` (`eval-score.ts`) scores by code: the end of each turn, required and forbidden tools, questions of a round, `moreOptions`, the Profile at the end and the cart's products; plus the rules of the spec on every turn (postal code not asked when the Profile has it, `askQuestions` rounds only after a `resolveItem` answered `choose`, `buildCart` never refused and never before a proposal was shown or the last Order reopened).
- `pnpm agent:eval [filter...] [--runs N]` (`src/cli/agent-eval.ts`, report in `agent-eval-report.ts`) and `pnpm agent:eval-set`, which joins `pnpm check`. Wiring in `compose.ts` (`createAgentEvaluator`, `loadAgentEvalSet`, `saveAgentEvalRun`) and `data-files.ts` (runs in `.data/agent/eval-runs/`).
- Docs: `CLAUDE.md` (Commands, Before every push), `ARCHITECTURE.md`, `docs/LLM.md` (new section "The agent eval set"; the two "scored when ticket 10 exists" sentences now link to it), `docs/TESTING.md`.
- Bug the eval found and I fixed: `resolveItem` passed `original: description` to call 2 (`fit-products`), so a brand sent as `brand` was missing from the Owner's words and the model answered "No pediste marca" and picked another brand (2 leches descremadas La Serenísima came back as Casanto). `resolveItem` now appends the brand to `original` when the description lacks it (`resolve-item.ts`, test "gives call 2 the brand in the Owner's words, once"). After it, `postal-code-asked-once` and `precise-products-no-questions` pass in 3 of 3 runs.

**Commands run**
- `pnpm agent:eval` (3 runs per case, real Claude Code sessions, Catalog Snapshot of 2026-10-15, started 22:15 UTC): 13/15 cases passed, 0 errors in 45 runs, 50 sessions of call 2, 1124 s, 0.1945 USD for those calls (the agent's own sessions are not costed). The 2 cases that did not pass, `correction-removes-an-item` (1 of 3 runs) and `correction-replaces-an-item` (1 of 3 runs), are marked `expectedToFail` in the set with their reason, as the other eval sets do (`correction-replaces-an-item` already was in this run; `correction-removes-an-item` I marked after it, so the run exited 1 on it); the same cases failed 0 of 3 and 2 of 3 runs in the run before. Every other case passed 3 of 3 runs: postal-code-asked-once, change-postal-code, postal-code-not-delivered, precise-products-no-questions, repeat-last-order, repeat-an-earlier-order, add-to-the-last-order, recipe-plan, gift-plan, advice-without-a-purchase, off-topic-question, asks-one-round-with-recommended-answers, asks-for-more-options. Times per run: 3 to 5 s with no search, 12 s repeating an Order, 24 s for a plain Order to proposal and cart, 36 to 62 s for rounds and Corrections. The run file is in `.data/agent/eval-runs/2026-10-16T22-15-56.444Z.json` (not committed).
- Earlier runs while building the set (`--runs 1` and 3-run partial runs) found two things now in the set: the yerba Playadito 1 kg Item came back `choose` because the agent sends `size: "1 kg"` and call 2 keeps nothing, so no case uses it as a fresh product (the past Orders of the repeat cases still do); and "jugo de mburucuyá" or the 10 kg charcoal sometimes resolve to `picked`, so the one-round case asks for three Items that usually `choose` and requires 2 questions.
- `pnpm check`: exit 0 (typecheck, lint, format, no-comments, docs:check, 700 tests, `order:eval-set`, `plan:eval-set`, `agent:eval-set`).

**Findings for later prompt work (not fixed here)**
- After a Correction the agent sometimes builds `proposeOrder` with the wrong refs: it kept the replaced Coca-Cola and dropped the milk (`correction-replaces-an-item`, 2 of 3 then 1 of 3 runs). The cart then has Coca-Cola Zero and the old Coca-Cola and no milk.
- On a Correction the agent sometimes calls `proposeOrder` with a ref that is gone (`unknown-ref`, recovers) or `buildCart` with the previous proposal id (`stale-proposal`, recovers), one failing run in `correction-removes-an-item`.
- `askQuestions` is refused with `bad-option` (an option with both `productId` and `label`) in several rounds, up to 3 times in a turn; the agent recovers on the next call but each retry costs seconds.
- With `size: "1 kg"` and a brand, `fit-products` answers no Fit for "yerba mate Playadito" although `Yerba mate Playadito suave con palo 1 kg` exists, so the Owner is asked a question for a precise request.

**Open**
- The agent's own sessions are not costed: `ChatAgent.reply` returns only text. Costing them needs the provider metadata of `ToolLoopAgent`'s result through the port.
- Nothing was exercised in the browser or against the page: this ticket changes no UI, and the root page is untouched.

